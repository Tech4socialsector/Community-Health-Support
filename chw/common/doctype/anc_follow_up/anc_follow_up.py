# Copyright (c) 2026, tech4socialsector@azimpremjifoundation.org and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document
from frappe.utils import add_days, getdate
from chw.api import sync_next_visit_todo, validate_phone_number

DEFAULT_ANC_WINDOW_DAYS = 30
DEFAULT_RISK_ALERT_DAYS = 7
# Last-resort fallback only, if the Master record is missing entirely - the
# real number always comes from ANC Visit Interval Master's own field.
DEFAULT_AUTOMATIC_WINDOW_COUNT = 6

# The three follow-up tables all describe the same patient, just recorded by
# a different staff type. Some organizations only use one or two of these
# (e.g. Nurse + Doctor, no Volunteer) - the calculation never assumes any
# particular one is in use; an empty table simply contributes nothing.
FOLLOWUP_TABLE_FIELDS = ["anc_followup", "anc_followup_for_nurse", "anc_followup_for_docter"]


class ANCFollowup(Document):
	def validate(self):
		validate_phone_number(self.phone_number)
		self.sync_followup_rows_with_pregnancy()
		if self.status == "Closed":
			# She's delivered - no more ANC visits are due, regardless of what's
			# still sitting on the last row's Date of Next Visit.
			self.next_anc_visit_date = None
			self.next_anc_visit_date_auto = None
			self.next_anc_visit_risk_alert = ""
		else:
			self.set_next_anc_visit_date()

	def on_update(self):
		sync_next_visit_todo(
			self,
			"next_anc_visit_date",
			f"ANC follow-up visit due for {self.first_name or self.pregnant_id}",
		)

	def sync_followup_rows_with_pregnancy(self):
		# LMP Date and POG (how far along she was at that specific visit) are
		# reference info for the staff member, not something they should have
		# to type - both are derived straight from the pregnancy's own LMP
		# date, across every follow-up table in use.
		if not self.pregnant_id:
			return
		lmp_date = frappe.db.get_value("Pregnancy Registration", self.pregnant_id, "lmp_date")
		if not lmp_date:
			return

		for table_field in FOLLOWUP_TABLE_FIELDS:
			for row in self.get(table_field):
				row.lmp_date = lmp_date
				row.pog_weeks = self.calculate_pog(lmp_date, row.date) if row.date else ""

		self.sync_patient_condition_to_pregnancy()
		self.insert_urgent_followups_for_risk_rows()

	def sync_patient_condition_to_pregnancy(self):
		# If any staff member - Volunteer, Nurse, or Doctor - records this
		# patient as at-risk on any visit, that becomes the pregnancy's
		# current risk status - feeding straight into the window quota,
		# alert date and Work Order List highlight, all already driven by
		# Pregnancy Registration's High Risk field. A "Normal" reading takes
		# no action - it never downgrades an existing High Risk flag on its
		# own; that's a separate, deliberate decision. Since Risk never
		# downgrades, "was any row ever Risk" is equivalent to (and simpler
		# than) tracking which table's row was most recent.
		any_risk = any(
			row.patient_condition == "Risk"
			for table_field in FOLLOWUP_TABLE_FIELDS
			for row in self.get(table_field)
		)
		if any_risk:
			frappe.db.set_value("Pregnancy Registration", self.pregnant_id, "high_risk", "Yes")

	def insert_urgent_followups_for_risk_rows(self):
		# Whenever a visit is Completed with Patient Condition = Risk, she
		# needs an earlier follow-up than the normal monthly cadence - insert
		# it right after that row (not appended at the end), dated from that
		# visit's own actual date + the High-Risk Alert Within Days. Runs
		# independently per follow-up table - a risk finding on the Nurse's
		# table only ever inserts an extra Nurse row, never into Doctor's or
		# Volunteer's. Skipped if the next row already sitting there is
		# close enough that a separate visit wouldn't add anything, and
		# never inserted twice for the same trigger.
		_, _, alert_within_days, _ = self.get_window_policy("Yes")
		for table_field in FOLLOWUP_TABLE_FIELDS:
			self._insert_urgent_followups(table_field, alert_within_days)

	def _insert_urgent_followups(self, table_field, alert_within_days):
		table = self.get(table_field)
		i = 0
		while i < len(table):
			row = table[i]
			if row.status == "Completed" and row.patient_condition == "Risk":
				next_row = table[i + 1] if i + 1 < len(table) else None
				already_inserted = next_row and next_row.urgent_followup
				if not already_inserted:
					urgent_date = add_days(getdate(row.date), alert_within_days)
					next_row_too_soon = next_row and getdate(next_row.date) <= urgent_date
					if not next_row_too_soon:
						new_row = self.append(table_field, {})
						new_row.date = urgent_date
						new_row.status = "Pending"
						new_row.urgent_followup = 1
						new_row.lmp_date = row.lmp_date
						new_row.pog_weeks = self.calculate_pog(row.lmp_date, urgent_date) if row.lmp_date else ""
						table.remove(new_row)
						table.insert(i + 1, new_row)
						for idx, r in enumerate(table):
							r.idx = idx + 1
			i += 1

	@staticmethod
	def calculate_pog(lmp_date, as_of_date):
		days_pregnant = (getdate(as_of_date) - getdate(lmp_date)).days
		if days_pregnant < 0:
			return ""
		weeks, days = divmod(days_pregnant, 7)
		return f"{weeks} weeks {days} days"

	def set_next_anc_visit_date(self):
		# The first N monthly windows (N = Automatic Window Count on the
		# Master, per risk group) are calculated automatically, anchored to
		# LMP (not to the last visit, so a late/early visit never drifts the
		# windows after it), and correctly account for late registration - a
		# patient who registers already 2 months in starts at the window she's
		# actually in, not window 1. Completed visits are counted across
		# every follow-up table in use combined - a visit done by the Nurse
		# closes the window exactly like one done by the Volunteer would.
		# After the automatic phase, visit frequency depends on her
		# condition, so whichever staff member last typed a date takes over,
		# exactly like before.
		if not self.pregnant_id:
			return

		reg = frappe.db.get_value(
			"Pregnancy Registration", self.pregnant_id, ["lmp_date", "high_risk"], as_dict=True
		)
		if not reg or not reg.lmp_date:
			return

		# An open Urgent-tagged row always wins first, in every phase, on
		# whichever table it's on - it never gets masked by either the
		# automatic window calculation or a staff member's own manually
		# typed date. "From" is the visit that triggered it, "To" is the
		# urgent row's own date - shown as a range, same as any other window.
		urgent = self.get_pending_urgent_followup()
		if urgent:
			self.next_anc_visit_date = urgent.date
			self.next_anc_visit_date_auto = urgent.date
			# The urgent date itself already IS the early-visit signal - no
			# separate alert needed on top of it.
			self.next_anc_visit_risk_alert = ""
			self.sync_child_row_fields(urgent.trigger_date, urgent.date)
			return

		high_risk = reg.high_risk or "No"
		window_days, visits_per_window, alert_within_days, automatic_window_count = self.get_window_policy(high_risk)
		completed_count = sum(
			len([row for row in self.get(table_field) if row.status == "Completed"])
			for table_field in FOLLOWUP_TABLE_FIELDS
		)
		starting_window = self.get_window_index(self.creation or getdate(), reg.lmp_date, window_days)
		current_window = self.get_current_window(starting_window, completed_count, visits_per_window)

		window_start = add_days(getdate(reg.lmp_date), (current_window - 1) * window_days)
		window_end = add_days(window_start, window_days)

		# High Risk only, shown in red on the main form - a nudge to visit
		# early within the window. Blank for Normal patients, and the
		# window/due date above are unaffected either way.
		risk_alert = (
			"Visit by {0}".format(frappe.utils.formatdate(add_days(window_start, alert_within_days)))
			if high_risk == "Yes"
			else ""
		)

		if current_window <= automatic_window_count:
			# Automatic phase - locked to the calculation, no manual override.
			self.next_anc_visit_date = window_end
			self.next_anc_visit_date_auto = window_end
			self.next_anc_visit_risk_alert = risk_alert
			self.sync_child_row_fields(window_start, window_end)
			return

		# Manual phase from here on - whichever row, on whichever table,
		# carries the most recently visited date's "Date of Next Visit" is
		# the real answer. Until anyone has actually recorded one, never
		# leave this blank - show her current month's window (from POG) as
		# a starting suggestion instead.
		# .get() rather than direct attribute access - not every follow-up
		# table necessarily carries this field (e.g. it's absent on ANC
		# Followup Child), so a table without it just never contributes a
		# manual row instead of erroring.
		manual_rows = [
			row for table_field in FOLLOWUP_TABLE_FIELDS
			for row in self.get(table_field) if row.get("date_of_next_visit")
		]
		if not manual_rows:
			self.next_anc_visit_date = window_end
			self.next_anc_visit_date_auto = window_end
			self.next_anc_visit_risk_alert = risk_alert
			self.sync_child_row_fields(window_start, window_end)
			return

		current = getdate(self.next_anc_visit_date) if self.next_anc_visit_date else None
		last_auto = getdate(self.next_anc_visit_date_auto) if self.next_anc_visit_date_auto else None
		if current and last_auto and current != last_auto:
			# user has manually overridden the date; leave it alone - it's no
			# longer a calculated window, so there's no range or alert to show.
			self.next_anc_visit_risk_alert = ""
			self.sync_child_row_fields(None, None)
			return

		latest_row = max(manual_rows, key=lambda r: getdate(r.date))
		calculated_date = getdate(latest_row.get("date_of_next_visit"))
		self.next_anc_visit_date = calculated_date
		self.next_anc_visit_date_auto = calculated_date
		# A staff member's own manually typed date isn't a calculated window either.
		self.next_anc_visit_risk_alert = ""
		self.sync_child_row_fields(None, None)

	def sync_child_row_fields(self, window_start, window_end):
		# "Date of Next Visit" is auto-filled on the latest row of EVERY
		# follow-up table in use - a genuine manual entry on an earlier row,
		# or a fresh row added later, is never overwritten by this. "Next
		# Visit Window" is a plain read-only range shown on every row, on
		# every table, so opening any of them (Volunteer, Nurse, or Doctor)
		# shows the same clear From-To picture instead of a single date with
		# no context.
		if window_start and window_end:
			display = "{0} to {1}".format(frappe.utils.formatdate(window_start), frappe.utils.formatdate(window_end))
		else:
			display = ""

		for table_field in FOLLOWUP_TABLE_FIELDS:
			table = self.get(table_field)
			if window_start and window_end and table:
				table[-1].date_of_next_visit = window_end
			for row in table:
				row.next_visit_window = display

	def get_pending_urgent_followup(self):
		candidates = []
		for table_field in FOLLOWUP_TABLE_FIELDS:
			urgent = self._pending_urgent_in(self.get(table_field))
			if urgent:
				candidates.append(urgent)
		if not candidates:
			return None
		return min(candidates, key=lambda u: u.date)

	@staticmethod
	def _pending_urgent_in(table):
		urgent_rows = [
			(i, row) for i, row in enumerate(table)
			if row.urgent_followup and row.status != "Completed"
		]
		if not urgent_rows:
			return None

		i, earliest = min(urgent_rows, key=lambda pair: getdate(pair[1].date))
		trigger_row = table[i - 1] if i > 0 else None
		trigger_date = getdate(trigger_row.date) if trigger_row else getdate(earliest.date)
		return frappe._dict(date=getdate(earliest.date), trigger_date=trigger_date)

	@staticmethod
	def get_window_policy(high_risk):
		policy = frappe.db.get_value(
			"ANC Visit Interval Master",
			high_risk,
			["interval_days", "visits_required_per_window", "risk_alert_within_days", "automatic_window_count"],
			as_dict=True,
		)
		window_days = (policy and policy.interval_days) or DEFAULT_ANC_WINDOW_DAYS
		visits_per_window = (policy and policy.visits_required_per_window) or 1
		alert_within_days = (policy and policy.risk_alert_within_days) or DEFAULT_RISK_ALERT_DAYS
		automatic_window_count = (policy and policy.automatic_window_count) or DEFAULT_AUTOMATIC_WINDOW_COUNT
		return window_days, visits_per_window, alert_within_days, automatic_window_count

	@staticmethod
	def get_window_index(reference_date, lmp_date, window_days):
		days_elapsed = (getdate(reference_date) - getdate(lmp_date)).days
		if days_elapsed < 0:
			return 1
		return (days_elapsed // window_days) + 1

	@staticmethod
	def get_current_window(starting_window, completed_count, visits_per_window):
		# A window only closes once its quota of completed visits is met -
		# 1 normally, more if the org's High Risk policy requires it (e.g. 2
		# visits within the same month).
		window = starting_window
		remaining = completed_count
		while remaining >= visits_per_window:
			remaining -= visits_per_window
			window += 1
		return window

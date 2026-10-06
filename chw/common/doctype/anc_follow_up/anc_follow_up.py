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
# (e.g. Nurse + Doctor, no Volunteer) - LMP/POG sync and the shared risk flag
# still apply across all three. The continuous monthly-window SCHEDULE,
# however, is driven by the Nurse table alone - Volunteer and Doctor are
# open-ended, manual logs with no calculated cadence, no urgent chain, and no
# Work Order List connection of their own (see NURSE_TABLE_FIELD below).
FOLLOWUP_TABLE_FIELDS = ["anc_followup", "anc_followup_for_nurse", "anc_followup_for_docter"]
NURSE_TABLE_FIELD = "anc_followup_for_nurse"


class ANCFollowup(Document):
	def validate(self):
		validate_phone_number(self.phone_number)
		self.sync_followup_rows_with_pregnancy()
		self.close_on_delivery_or_abortion()
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

	def close_on_delivery_or_abortion(self):
		# Two independent signals can close this record, whichever arrives
		# first - Birth Registration (handled separately, in chw.api's
		# create_pnc_from_birth_registration) is the guaranteed eventual
		# backstop, but it's a different document that may not get created
		# until well after the delivery itself. Delivery Status / Aboration
		# Status set directly here close it immediately instead of waiting.
		# One-way only - never reopens a closed record if these are later
		# edited back to "No" by mistake.
		if self.delivery_status == "Yes" or self.aboration_status == "Yes":
			self.status = "Closed"

	def sync_followup_rows_with_pregnancy(self):
		# LMP Date and POG (how far along she was at that specific visit) are
		# reference info for the staff member, not something they should have
		# to type - both are derived straight from the pregnancy's own LMP
		# date, across every follow-up table in use, Volunteer and Doctor
		# included (this is pure convenience auto-fill, unrelated to
		# scheduling).
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
		self.refresh_pregnancy_pog_and_trimester(lmp_date)
		self.insert_urgent_followups_for_risk_rows()

	def refresh_pregnancy_pog_and_trimester(self, lmp_date):
		today = getdate()
		days_pregnant = (today - getdate(lmp_date)).days
		weeks, days = divmod(days_pregnant, 7)
		pog = f"{weeks} weeks {days} days"

		if weeks <= 13:
			trimester = "First trimester"
		elif weeks <= 27:
			trimester = "Second trimester"
		else:
			trimester = "Third trimester"

		frappe.db.set_value("Pregnancy Registration", self.pregnant_id, {"pog": pog, "trimester": trimester})

	def sync_patient_condition_to_pregnancy(self):
		
		any_risk = any(
			row.patient_condition == "Risk"
			for table_field in FOLLOWUP_TABLE_FIELDS
			for row in self.get(table_field)
		)
		if any_risk:
			frappe.db.set_value("Pregnancy Registration", self.pregnant_id, "high_risk", "Yes")

	def insert_urgent_followups_for_risk_rows(self):
		_, _, alert_within_days, _ = self.get_window_policy()
		self._insert_urgent_followups(NURSE_TABLE_FIELD, alert_within_days)

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
						new_row.window_start_date = row.date
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
		
		if not self.pregnant_id:
			return

		reg = frappe.db.get_value(
			"Pregnancy Registration", self.pregnant_id, ["lmp_date", "high_risk"], as_dict=True
		)
		if not reg or not reg.lmp_date:
			return
		urgent = self.get_pending_urgent_followup()
		if urgent:
			self.next_anc_visit_date = urgent.date
			self.next_anc_visit_date_auto = urgent.date
			self.next_anc_visit_risk_alert = ""
			self.sync_child_row_fields(urgent.trigger_date, urgent.date)
			return

		high_risk = reg.high_risk or "No"
		window_days, visits_per_window, alert_within_days, automatic_window_count = self.get_window_policy()
		completed_count = len([row for row in self.get(NURSE_TABLE_FIELD) if row.status == "Completed"])
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

		# Manual phase from here on - whichever Nurse row carries the most
		# recently visited date's "Date of Next Visit" is the real answer.
		# Until she has actually recorded one, never leave this blank - show
		# her current month's window (from LMP) as a starting suggestion
		# instead.
		manual_rows = [row for row in self.get(NURSE_TABLE_FIELD) if row.get("date_of_next_visit")]
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
		# A manually typed date isn't a calculated window either.
		self.next_anc_visit_risk_alert = ""
		self.sync_child_row_fields(None, None)

	def sync_child_row_fields(self, window_start, window_end):
		# "Date of Next Visit" and "Next Visit Window" are auto-filled on the
		# Nurse table only - Volunteer's and Doctor's own "Date of Next
		# Visit" fields (where present) are left purely to manual entry,
		# never overwritten by this calculation.
		if window_start and window_end:
			display = "{0} to {1}".format(frappe.utils.formatdate(window_start), frappe.utils.formatdate(window_end))
		else:
			display = ""

		table = self.get(NURSE_TABLE_FIELD)
		if window_start and window_end and table:
			table[-1].date_of_next_visit = window_end
		for row in table:
			row.next_visit_window = display

	def get_pending_urgent_followup(self):
		return self._pending_urgent_in(self.get(NURSE_TABLE_FIELD))

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
	def get_window_policy():
		# ANC Visit Interval Master is a one-time-setup Single - one policy,
		# the same for every patient regardless of High Risk status (that
		# field only controls whether the Risk Alert nudge is shown, not
		# which cadence applies).
		master = frappe.get_single("ANC Visit Interval Master")
		window_days = master.interval_days or DEFAULT_ANC_WINDOW_DAYS
		visits_per_window = master.visits_required_per_window or 1
		alert_within_days = master.risk_alert_within_days or DEFAULT_RISK_ALERT_DAYS
		automatic_window_count = master.automatic_window_count or DEFAULT_AUTOMATIC_WINDOW_COUNT
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

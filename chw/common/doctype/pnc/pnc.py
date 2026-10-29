# Copyright (c) 2026, tech4socialsector@azimpremjifoundation.org and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import add_days, getdate
from chw.api import sync_next_visit_todo, validate_phone_number
from chw.chw_master import visit_schedule

# Last-resort fallback only, used if the Visit Schedule Master has no PNC
# rows configured yet - the real policy always comes from that master's
# Visit Schedule rows (Applies To = "PNC"). (window_opens_day,
# window_closes_day) per visit, 1-indexed by position - visit 1 opens at
# delivery, visit 2 is the last week of a 6-week (42-day) postnatal period.
DEFAULT_VISIT_SCHEDULE = [(0, 7), (35, 42)]
DEFAULT_RISK_ALERT_DAYS = 1

# Safe margin past the default ~6-week (42-day) postnatal period, used only
# by the exit-women-pnc report cutoff (chw.api.pnc_fully_completed_names) to
# decide a record's postnatal window has fully elapsed.
PNC_SCHEDULE_DURATION_MONTHS = 2


@frappe.whitelist()
def get_visit_schedule():
	"""The shared Visit Schedule Master's rows for PNC, for pnc.js's live
	preview - see chw.chw_master.visit_schedule."""
	return visit_schedule.get_visit_schedule_rows("PNC")


class PNC(Document):
	def validate(self):
		validate_phone_number(self.phone_number)
		self.validate_gender()
		self.sync_patient_condition_to_high_risk()
		self.insert_urgent_followups_for_risk_rows()
		self.set_next_pnc_visit_date()

	def on_update(self):
		sync_next_visit_todo(
			self,
			"next_pnc_visit_date",
			f"PNC follow-up visit due for {self.first_name} (Baby: {self.name_of_child})",
		)

	def validate_gender(self):
		if not self.birth_registration_id:
			return

		# `fmid` is the mother's Family member ID; `family_member_id` was its
		# old, renamed column - always empty now, so this check never ran.
		family_member_id = frappe.db.get_value(
			"Birth Registration", self.birth_registration_id, "fmid"
		)
		gender = family_member_id and frappe.db.get_value("Family members", family_member_id, "gender")
		if gender and gender != "Female":
			frappe.throw(_("PNC can only be created for a female family member."))

	def sync_patient_condition_to_high_risk(self):
		# The only way high_risk ever gets set - there's no manual entry
		# point on the main form. Mother and baby are checked on the same
		# Volunteer visit row, and either the mother's Patient Condition OR
		# the baby's Baby Condition can push this to Yes. A later "Normal"
		# reading never downgrades it back on its own.
		mother_risk = self._latest_condition(self.mother, "patient_condition") == "Risk"
		baby_risk = self._latest_condition(self.mother, "baby_condition") == "Risk"
		if mother_risk or baby_risk:
			self.high_risk = "Yes"

	@staticmethod
	def _latest_condition(table, fieldname):
		rows_with_condition = [row for row in table if row.get(fieldname)]
		if not rows_with_condition:
			return None
		return rows_with_condition[-1].get(fieldname)

	def insert_urgent_followups_for_risk_rows(self):
		self._insert_urgent_followups("mother")

	@staticmethod
	def _is_risk_row(row):
		# One visit row covers mother and baby - Risk on either one counts.
		return row.get("patient_condition") == "Risk" or row.get("baby_condition") == "Risk"

	def _insert_urgent_followups(self, table_field):
		# Whenever a visit is Completed with its condition field = Risk, an
		# earlier follow-up than the normal schedule is needed - insert it
		# right after that row (not appended at the end), dated from that
		# visit's own actual date + *that visit's own* Urgent Visit Within
		# Days (not a fixed number, not a chain - each schedule row sets its
		# own duration, found by counting how many visits are completed up
		# to and including this one). Skipped if the next row already
		# sitting there is close enough that a separate visit wouldn't add
		# anything, and never inserted twice for the same trigger.
		table = self.get(table_field)
		i = 0
		while i < len(table):
			row = table[i]
			if row.status == "Completed" and self._is_risk_row(row):
				next_row = table[i + 1] if i + 1 < len(table) else None
				already_inserted = next_row and next_row.urgent_followup
				if not already_inserted:
					# A previously completed urgent follow-up is an extra visit,
					# not one of the numbered schedule visits - excluded here so
					# it doesn't push this trigger's own visit number (and the
					# urgent-within-days setting looked up from it) too high.
					effective_visit_number = len(
						[r for r in table[: i + 1] if r.status == "Completed" and not r.urgent_followup]
					)
					urgent_within_days = self.get_urgent_visit_within_days(effective_visit_number)
					urgent_date = add_days(getdate(row.date), urgent_within_days)
					next_row_too_soon = next_row and getdate(next_row.date) <= urgent_date
					if not next_row_too_soon:
						new_row = self.append(table_field, {})
						new_row.window_start_date = row.date
						new_row.date = urgent_date
						new_row.status = "Pending"
						new_row.urgent_followup = 1
						table.remove(new_row)
						table.insert(i + 1, new_row)
						for idx, r in enumerate(table):
							r.idx = idx + 1
			i += 1

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
	def get_urgent_visit_within_days(visit_number):
		"""One shared Urgent Visit Within Days for all of PNC's visits - see
		chw.chw_master.visit_schedule.get_urgent_visit_within_days.
		visit_number is accepted (but unused) only so callers don't need to
		change - every visit uses the same configured gap."""
		return visit_schedule.get_urgent_visit_within_days("PNC", DEFAULT_RISK_ALERT_DAYS)

	def set_next_pnc_visit_date(self):
		# One track: mother and baby are checked on the same Volunteer visit
		# row, so its schedule (or an open urgent row) decides the next
		# visit for both.
		if not self.date_of_delivery:
			return

		track = self._compute_track(self.mother, getdate(self.date_of_delivery))
		self.sync_mother_row_fields(track.window_start, track.window_end)
		# None once every scheduled visit is complete.
		self.next_pnc_visit_date = track.next_date
		self.next_pnc_visit_date_auto = track.next_date
		self.pnc_visit_risk_alert = track.risk_alert

	def _compute_track(self, table, delivery_date):
		# An open Urgent-tagged row on this table always wins first - it
		# never gets masked by the normal schedule lookup. The urgent date
		# itself already IS the early-visit signal, so no separate alert on
		# top of it.
		urgent = self._pending_urgent_in(table)
		if urgent:
			return frappe._dict(
				next_date=urgent.date, window_start=urgent.trigger_date, window_end=urgent.date, risk_alert="",
				is_urgent=True,
			)

		# An urgent follow-up is an extra visit squeezed in between regular
		# windows, not one of the numbered schedule visits - completing it
		# must not advance the regular schedule by a visit it was never
		# part of.
		visit_number = len([row for row in table if row.status == "Completed" and not row.urgent_followup]) + 1
		window = self.get_visit_window(visit_number)
		if window is None:
			# every visit on this table has been completed
			return frappe._dict(next_date=None, window_start=None, window_end=None, risk_alert="", is_urgent=False)

		window_start = add_days(delivery_date, window.start_offset)
		window_end = add_days(delivery_date, window.end_offset)

		# High Risk only, shown in red - a nudge to visit early within the
		# window (from window_start, not window_end - the point is to go
		# sooner, not to wait until the window is about to close). Blank
		# otherwise; the window/due date above are unaffected either way.
		high_risk = self.high_risk or "No"
		risk_alert = (
			"Visit by {0}".format(frappe.utils.formatdate(add_days(window_start, window.risk_alert_within_days)))
			if high_risk == "Yes"
			else ""
		)
		return frappe._dict(
			next_date=window_end, window_start=window_start, window_end=window_end, risk_alert=risk_alert,
			is_urgent=False,
		)

	def sync_mother_row_fields(self, window_start, window_end):
		self._sync_row_fields(self.mother, window_start, window_end)

	@staticmethod
	def _sync_row_fields(table, window_start, window_end):
		# "Date of Next Visit" is auto-filled on the latest row only.
		# "Next Visit Window" is a plain read-only range shown on every row.
		if window_start and window_end:
			display = "{0} to {1}".format(frappe.utils.formatdate(window_start), frappe.utils.formatdate(window_end))
			# An urgent-followup row's own window (see _insert_urgent_followups)
			# is the Risk alert deadline, not this regular schedule's window -
			# never overwritten by it, regardless of call order.
			if table and not table[-1].urgent_followup:
				table[-1].date_of_next_visit = window_end
		else:
			display = ""

		for row in table:
			if row.urgent_followup:
				continue
			row.next_visit_window = display

	@staticmethod
	def get_visit_window(visit_number):
		"""visit_number is 1-indexed - see
		chw.chw_master.visit_schedule.get_visit_window. Returns None once
		visit_number has no matching row - there's no fixed cap, the
		configured rows *are* the cap."""
		return visit_schedule.get_visit_window("PNC", visit_number, DEFAULT_VISIT_SCHEDULE, DEFAULT_RISK_ALERT_DAYS)

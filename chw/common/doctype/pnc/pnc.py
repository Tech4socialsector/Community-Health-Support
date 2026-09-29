# Copyright (c) 2026, tech4socialsector@azimpremjifoundation.org and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import add_days, getdate
from chw.api import sync_next_visit_todo, validate_phone_number

# Last-resort fallback only, used if the PNC Visit Interval Master hasn't
# been configured yet - the real policy always comes from that master's
# Visit Schedule rows. (window_opens_day, window_closes_day) per visit,
# 1-indexed by position - visit 1 opens at delivery, visit 2 is the last
# week of a 6-week (42-day) postnatal period.
DEFAULT_VISIT_SCHEDULE = [(0, 7), (35, 42)]
DEFAULT_RISK_ALERT_DAYS = 1

# Safe margin past the default ~6-week (42-day) postnatal period, used only
# by the exit-women-pnc report cutoff (chw.api.pnc_fully_completed_names) to
# decide a record's postnatal window has fully elapsed.
PNC_SCHEDULE_DURATION_MONTHS = 2


@frappe.whitelist()
def get_visit_schedule():
	"""The master's Visit Schedule rows, for pnc.js's live preview. A child
	table (PNC Visit Schedule Row) has no permission rules of its own -
	only the parent Single does - so the client can't reliably list it
	directly via frappe.db.get_list; fetching through the parent doc here
	goes through normal, already-granted permission checks instead."""
	master = frappe.get_single("PNC Visit Interval Master")
	return [
		{
			"window_opens_day": row.window_opens_day,
			"window_closes_day": row.window_closes_day,
			"risk_alert_within_days": row.risk_alert_within_days,
		}
		for row in master.visit_schedule
	]


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

		family_member_id = frappe.db.get_value(
			"Birth Registration", self.birth_registration_id, "family_member_id"
		)
		gender = family_member_id and frappe.db.get_value("Family members", family_member_id, "gender")
		if gender and gender != "Female":
			frappe.throw(_("PNC can only be created for a female family member."))

	def sync_patient_condition_to_high_risk(self):
		# The only way high_risk ever gets set - there's no manual entry
		# point on the main form. If the CHW records the mother as at-risk
		# during any followup, that becomes her current risk status, feeding
		# the risk alert and the urgent follow-up chain below. A later
		# "Normal" reading never downgrades it back on its own.
		rows_with_condition = [row for row in self.mother if row.patient_condition]
		if not rows_with_condition:
			return

		if rows_with_condition[-1].patient_condition == "Risk":
			self.high_risk = "Yes"

	def insert_urgent_followups_for_risk_rows(self):
		# Whenever a visit is Completed with Patient Condition = Risk, she
		# needs an earlier follow-up than the normal schedule - insert it
		# right after that row (not appended at the end), dated from that
		# visit's own actual date + *that visit's own* Urgent Visit Within
		# Days (not a fixed number, not a chain - each schedule row sets its
		# own duration, found by counting how many visits are completed up
		# to and including this one). Skipped if the next row already
		# sitting there is close enough that a separate visit wouldn't add
		# anything, and never inserted twice for the same trigger.
		i = 0
		while i < len(self.mother):
			row = self.mother[i]
			if row.status == "Completed" and row.patient_condition == "Risk":
				next_row = self.mother[i + 1] if i + 1 < len(self.mother) else None
				already_inserted = next_row and next_row.urgent_followup
				if not already_inserted:
					effective_visit_number = len(
						[r for r in self.mother[: i + 1] if r.status == "Completed"]
					)
					urgent_within_days = self.get_urgent_visit_within_days(effective_visit_number)
					urgent_date = add_days(getdate(row.date), urgent_within_days)
					next_row_too_soon = next_row and getdate(next_row.date) <= urgent_date
					if not next_row_too_soon:
						new_row = self.append("mother", {})
						new_row.date = urgent_date
						new_row.status = "Pending"
						new_row.urgent_followup = 1
						self.mother.remove(new_row)
						self.mother.insert(i + 1, new_row)
						for idx, r in enumerate(self.mother):
							r.idx = idx + 1
			i += 1

	def get_pending_urgent_followup(self):
		urgent_rows = [
			(i, row) for i, row in enumerate(self.mother)
			if row.urgent_followup and row.status != "Completed"
		]
		if not urgent_rows:
			return None

		i, earliest = min(urgent_rows, key=lambda pair: getdate(pair[1].date))
		trigger_row = self.mother[i - 1] if i > 0 else None
		trigger_date = getdate(trigger_row.date) if trigger_row else getdate(earliest.date)
		return frappe._dict(date=getdate(earliest.date), trigger_date=trigger_date)

	@staticmethod
	def get_urgent_visit_within_days(visit_number):
		"""The schedule row matching visit_number's own Urgent Visit Within
		Days - clamped to the last configured row if visit_number runs past
		however many rows exist, so a risk finding beyond the configured
		schedule still gets a sensible duration instead of failing."""
		master = frappe.get_single("PNC Visit Interval Master")
		rows = master.visit_schedule
		if not rows:
			return DEFAULT_RISK_ALERT_DAYS
		index = max(min(visit_number, len(rows)) - 1, 0)
		return rows[index].urgent_visit_within_days or DEFAULT_RISK_ALERT_DAYS

	def set_next_pnc_visit_date(self):
		# Each visit's window is a direct row lookup from the PNC Visit
		# Interval Master's Visit Schedule table - however many rows are
		# configured there, that's how many visits this protocol has. Any
		# days not covered by a row (a gap between two windows) simply have
		# nothing due - that's not a special case, the code never looks at
		# those days at all.
		if not self.date_of_delivery:
			return

		# An open Urgent-tagged row always wins first - it never gets masked
		# by the normal schedule lookup. "From" is the visit that triggered
		# it, "To" is the urgent row's own date.
		urgent = self.get_pending_urgent_followup()
		if urgent:
			self.next_pnc_visit_date = urgent.date
			self.next_pnc_visit_date_auto = urgent.date
			# The urgent date itself already IS the early-visit signal - no
			# separate alert needed on top of it.
			self.pnc_visit_risk_alert = ""
			self.sync_mother_row_fields(urgent.trigger_date, urgent.date)
			return

		visit_number = len([row for row in self.mother if row.status == "Completed"]) + 1
		window = self.get_visit_window(visit_number)
		if window is None:
			# every scheduled visit has been completed
			self.next_pnc_visit_date = None
			self.next_pnc_visit_date_auto = None
			self.pnc_visit_risk_alert = ""
			self.sync_mother_row_fields(None, None)
			return

		delivery_date = getdate(self.date_of_delivery)
		window_start = add_days(delivery_date, window.start_offset)
		window_end = add_days(delivery_date, window.end_offset)

		self.next_pnc_visit_date = window_end
		self.next_pnc_visit_date_auto = window_end

		# High Risk only, shown in red - a nudge to visit early within the
		# window (from window_start, not window_end - the point is to go
		# sooner, not to wait until the window is about to close). Blank for
		# Normal mothers; the window/due date above are unaffected either way.
		high_risk = self.high_risk or "No"
		self.pnc_visit_risk_alert = (
			"Visit by {0}".format(frappe.utils.formatdate(add_days(window_start, window.risk_alert_within_days)))
			if high_risk == "Yes"
			else ""
		)

		self.sync_mother_row_fields(window_start, window_end)

	def sync_mother_row_fields(self, window_start, window_end):
		# "Date of Next Visit" is auto-filled on the latest row only.
		# "Next Visit Window" is a plain read-only range shown on every row.
		if window_start and window_end:
			display = "{0} to {1}".format(frappe.utils.formatdate(window_start), frappe.utils.formatdate(window_end))
			if self.mother:
				self.mother[-1].date_of_next_visit = window_end
		else:
			display = ""

		for row in self.mother:
			row.next_visit_window = display

	@staticmethod
	def get_visit_window(visit_number):
		"""visit_number is 1-indexed, matching row position in the master's
		Visit Schedule table - row 1 is visit 1, row 2 is visit 2, and so on.
		Returns None once visit_number exceeds however many rows exist -
		there's no fixed cap, the row count *is* the cap."""
		master = frappe.get_single("PNC Visit Interval Master")
		rows = master.visit_schedule

		if rows:
			if visit_number < 1 or visit_number > len(rows):
				return None
			row = rows[visit_number - 1]
			return frappe._dict(
				start_offset=row.window_opens_day,
				end_offset=row.window_closes_day,
				risk_alert_within_days=row.risk_alert_within_days or DEFAULT_RISK_ALERT_DAYS,
			)

		if visit_number < 1 or visit_number > len(DEFAULT_VISIT_SCHEDULE):
			return None
		start_offset, end_offset = DEFAULT_VISIT_SCHEDULE[visit_number - 1]
		return frappe._dict(
			start_offset=start_offset,
			end_offset=end_offset,
			risk_alert_within_days=DEFAULT_RISK_ALERT_DAYS,
		)

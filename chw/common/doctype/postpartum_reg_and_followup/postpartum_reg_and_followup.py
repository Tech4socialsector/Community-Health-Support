# Copyright (c) 2026, tfss and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document
from frappe.utils import add_days, getdate

from chw.api import sync_next_visit_todo

# Last-resort fallback only, used if the Postpartum Visit Interval Master
# hasn't been configured yet - the real policy always comes from that
# master's Visit Schedule rows. (window_opens_day, window_closes_day) per
# visit, 1-indexed by position - visit 1 opens at delivery, visit 2 is the
# last week of a 6-week (42-day) postpartum period.
DEFAULT_VISIT_SCHEDULE = [(0, 7), (35, 42)]
DEFAULT_RISK_ALERT_DAYS = 1


@frappe.whitelist()
def get_visit_schedule():
	"""The master's Visit Schedule rows, for this form's live preview. A
	child table (Postpartum Visit Schedule Row) has no permission rules of
	its own - only the parent Single does - so the client can't reliably
	list it directly via frappe.db.get_list; fetching through the parent
	doc here goes through normal, already-granted permission checks
	instead."""
	master = frappe.get_single("Postpartum Visit Interval Master")
	return [
		{
			"window_opens_day": row.window_opens_day,
			"window_closes_day": row.window_closes_day,
			"risk_alert_within_days": row.risk_alert_within_days,
		}
		for row in master.visit_schedule
	]


class PostpartumRegandFollowup(Document):
	def validate(self):
		self.insert_urgent_followups_for_risk_rows()
		self.set_next_visit_date()

	def on_update(self):
		sync_next_visit_todo(
			self,
			"next_visit_date",
			f"Postpartum followup visit due for {self.patient_name or self.name}",
		)

	def insert_urgent_followups_for_risk_rows(self):
		# Whenever a visit is Completed with either Mother's Condition or
		# Baby's Condition = Risk, an earlier follow-up than the normal
		# schedule is needed - insert it right after that row (not appended
		# at the end), dated from that visit's own actual date + *that
		# visit's own* Urgent Visit Within Days. One combined follow-up
		# covers whichever of them needs it - not a separate chain each,
		# since there's only one followup table here (mother and baby are
		# recorded together on the same household visit). Skipped if the
		# next row already sitting there is close enough that a separate
		# visit wouldn't add anything, and never inserted twice for the
		# same trigger.
		table = self.followup_visits
		i = 0
		while i < len(table):
			row = table[i]
			is_risk = row.mother_condition == "Risk" or row.baby_condition == "Risk"
			if row.status == "Completed" and is_risk:
				next_row = table[i + 1] if i + 1 < len(table) else None
				already_inserted = next_row and next_row.urgent_followup
				if not already_inserted:
					effective_visit_number = len([r for r in table[: i + 1] if r.status == "Completed"])
					urgent_within_days = self.get_urgent_visit_within_days(effective_visit_number)
					urgent_date = add_days(getdate(row.date_of_visit), urgent_within_days)
					next_row_too_soon = next_row and getdate(next_row.date_of_visit) <= urgent_date
					if not next_row_too_soon:
						new_row = self.append("followup_visits", {})
						new_row.date_of_visit = urgent_date
						new_row.status = "Pending"
						new_row.urgent_followup = 1
						table.remove(new_row)
						table.insert(i + 1, new_row)
						for idx, r in enumerate(table):
							r.idx = idx + 1
			i += 1

	def get_pending_urgent_followup(self):
		table = self.followup_visits
		urgent_rows = [
			(i, row) for i, row in enumerate(table)
			if row.urgent_followup and row.status != "Completed"
		]
		if not urgent_rows:
			return None

		i, earliest = min(urgent_rows, key=lambda pair: getdate(pair[1].date_of_visit))
		trigger_row = table[i - 1] if i > 0 else None
		trigger_date = getdate(trigger_row.date_of_visit) if trigger_row else getdate(earliest.date_of_visit)
		return frappe._dict(date=getdate(earliest.date_of_visit), trigger_date=trigger_date)

	@staticmethod
	def get_urgent_visit_within_days(visit_number):
		"""The schedule row matching visit_number's own Urgent Visit Within
		Days - clamped to the last configured row if visit_number runs past
		however many rows exist, so a risk finding beyond the configured
		schedule still gets a sensible duration instead of failing."""
		master = frappe.get_single("Postpartum Visit Interval Master")
		rows = master.visit_schedule
		if not rows:
			return DEFAULT_RISK_ALERT_DAYS
		index = max(min(visit_number, len(rows)) - 1, 0)
		return rows[index].urgent_visit_within_days or DEFAULT_RISK_ALERT_DAYS

	def currently_high_risk(self):
		# Live, not sticky - reflects only the most recently COMPLETED
		# visit's own condition. A later Normal visit clears this back down
		# on its own; nothing is remembered past the latest visit.
		completed_rows = [row for row in self.followup_visits if row.status == "Completed"]
		if not completed_rows:
			return False
		latest = max(completed_rows, key=lambda row: getdate(row.date_of_visit))
		return latest.mother_condition == "Risk" or latest.baby_condition == "Risk"

	def set_next_visit_date(self):
		# Each visit's window is a direct row lookup from the Postpartum
		# Visit Interval Master's Visit Schedule table - however many rows
		# are configured there, that's how many visits this protocol has.
		# Any days not covered by a row (a gap between two windows) simply
		# have nothing due - the code never looks at those days at all.
		if not self.delivery_date:
			return

		high_risk = self.currently_high_risk()

		# An open Urgent-tagged row always wins first - it never gets masked
		# by the normal schedule lookup. "From" is the visit that triggered
		# it, "To" is the urgent row's own date.
		urgent = self.get_pending_urgent_followup()
		if urgent:
			self.next_visit_date = urgent.date
			self.next_visit_date_auto = urgent.date
			# The urgent date itself already IS the early-visit signal - no
			# separate alert needed on top of it.
			self.postpartum_risk_alert = ""
			self.sync_row_fields(urgent.trigger_date, urgent.date)
			return

		visit_number = len([row for row in self.followup_visits if row.status == "Completed"]) + 1
		window = self.get_visit_window(visit_number)
		if window is None:
			# every scheduled visit has been completed
			self.next_visit_date = None
			self.next_visit_date_auto = None
			self.postpartum_risk_alert = ""
			self.sync_row_fields(None, None)
			return

		delivery_date = getdate(self.delivery_date)
		window_start = add_days(delivery_date, window.start_offset)
		window_end = add_days(delivery_date, window.end_offset)

		self.next_visit_date = window_end
		self.next_visit_date_auto = window_end

		# High Risk only, shown in red - a nudge to visit early within the
		# window (from window_start, not window_end - the point is to go
		# sooner, not to wait until the window is about to close). Blank
		# otherwise; the window/due date above are unaffected either way.
		self.postpartum_risk_alert = (
			"Visit by {0}".format(frappe.utils.formatdate(add_days(window_start, window.risk_alert_within_days)))
			if high_risk
			else ""
		)

		self.sync_row_fields(window_start, window_end)

	def sync_row_fields(self, window_start, window_end):
		# "Date of Next Visit" is auto-filled on the latest row only.
		# "Next Visit Window" is a plain read-only range shown on every row.
		if window_start and window_end:
			display = "{0} to {1}".format(frappe.utils.formatdate(window_start), frappe.utils.formatdate(window_end))
			if self.followup_visits:
				self.followup_visits[-1].date_of_next_visit = window_end
		else:
			display = ""

		for row in self.followup_visits:
			row.next_visit_window = display

	@staticmethod
	def get_visit_window(visit_number):
		"""visit_number is 1-indexed, matching row position in the master's
		Visit Schedule table - row 1 is visit 1, row 2 is visit 2, and so on.
		Returns None once visit_number exceeds however many rows exist -
		there's no fixed cap, the row count *is* the cap."""
		master = frappe.get_single("Postpartum Visit Interval Master")
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

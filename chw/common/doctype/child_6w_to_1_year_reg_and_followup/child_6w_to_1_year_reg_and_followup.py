# Copyright (c) 2026, tech4socialsector@azimpremjifoundation.org and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document
from frappe.utils import add_days, getdate

from chw.api import sync_next_visit_todo

# Last-resort fallback only, if the Master record is missing entirely - the
# real numbers always come from Child 6w-1y Visit Interval Master's own
# fields.
DEFAULT_INTERVAL_DAYS = 30
DEFAULT_RISK_ALERT_DAYS = 7
DEFAULT_AUTOMATIC_WINDOW_COUNT = 10


class Child6wto1YearRegandFollowup(Document):
	def validate(self):
		self.insert_urgent_followups_for_risk_rows()
		self.set_next_visit_date()

	def on_update(self):
		sync_next_visit_todo(
			self,
			"next_visit_date",
			f"Child 6w-1y followup visit due for {self.patient_name or self.name}",
		)

	def insert_urgent_followups_for_risk_rows(self):
		# Whenever a visit is Completed with Baby Condition = Risk, she
		# needs an earlier follow-up than the normal monthly cadence -
		# insert it right after that row (not appended at the end), dated
		# from that visit's own actual date + the Master's Risk Alert Days.
		# Skipped if the next row already sitting there is close enough
		# that a separate visit wouldn't add anything, and never inserted
		# twice for the same trigger.
		alert_within_days = self.get_window_policy().risk_alert_within_days

		table = self.followup_visits
		i = 0
		while i < len(table):
			row = table[i]
			if row.status == "Completed" and row.baby_condition == "Risk":
				next_row = table[i + 1] if i + 1 < len(table) else None
				already_inserted = next_row and next_row.urgent_followup
				if not already_inserted:
					urgent_date = add_days(getdate(row.date_of_visit), alert_within_days)
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

	def currently_high_risk(self):
		# Live, not sticky - reflects only the most recently COMPLETED
		# visit's own Baby Condition. A later Normal visit clears this back
		# down on its own; nothing is remembered past the latest visit.
		completed_rows = [row for row in self.followup_visits if row.status == "Completed"]
		if not completed_rows:
			return False
		latest = max(completed_rows, key=lambda row: getdate(row.date_of_visit))
		return latest.baby_condition == "Risk"

	@staticmethod
	def get_window_policy():
		master = frappe.get_single("Child 6w-1y Visit Interval Master")
		return frappe._dict(
			interval_days=master.interval_days or DEFAULT_INTERVAL_DAYS,
			visits_per_window=master.visits_required_per_window or 1,
			risk_alert_within_days=master.risk_alert_within_days or DEFAULT_RISK_ALERT_DAYS,
			automatic_window_count=master.automatic_window_count or DEFAULT_AUTOMATIC_WINDOW_COUNT,
		)

	@staticmethod
	def get_window_index(reference_date, anchor_date, window_days):
		days_elapsed = (getdate(reference_date) - getdate(anchor_date)).days
		if days_elapsed < 0:
			return 1
		return (days_elapsed // window_days) + 1

	@staticmethod
	def get_current_window(starting_window, completed_count, visits_per_window):
		# A window only closes once its quota of completed visits is met.
		window = starting_window
		remaining = completed_count
		while remaining >= visits_per_window:
			remaining -= visits_per_window
			window += 1
		return window

	def set_next_visit_date(self):
		# Anchored on Date of Visit - the date this baby was registered
		# into the 6w-1y program, not her raw birth date, since that's when
		# this program's own monthly cadence actually starts counting from.
		# Fully automatic throughout (like PNC/Postpartum) - once the
		# configured number of windows is covered, this program is done for
		# this child, no manual phase.
		if not self.date_of_visit:
			return

		policy = self.get_window_policy()

		# An open Urgent-tagged row always wins first - it never gets
		# masked by the normal schedule lookup. "From" is the visit that
		# triggered it, "To" is the urgent row's own date.
		urgent = self.get_pending_urgent_followup()
		if urgent:
			self.next_visit_date = urgent.date
			self.next_visit_date_auto = urgent.date
			# The urgent date itself already IS the early-visit signal - no
			# separate alert needed on top of it.
			self.child_risk_alert = ""
			self.sync_row_fields(urgent.trigger_date, urgent.date)
			return

		completed_count = len([row for row in self.followup_visits if row.status == "Completed"])
		starting_window = self.get_window_index(self.creation or getdate(), self.date_of_visit, policy.interval_days)
		current_window = self.get_current_window(starting_window, completed_count, policy.visits_per_window)

		if current_window > policy.automatic_window_count:
			# Every configured window has been covered - this program is
			# done for this child.
			self.next_visit_date = None
			self.next_visit_date_auto = None
			self.child_risk_alert = ""
			self.sync_row_fields(None, None)
			return

		window_start = add_days(getdate(self.date_of_visit), (current_window - 1) * policy.interval_days)
		window_end = add_days(window_start, policy.interval_days)

		self.next_visit_date = window_end
		self.next_visit_date_auto = window_end

		# High Risk only, shown in red - a nudge to visit early within the
		# window (from window_start, not window_end). Blank otherwise; the
		# window/due date above are unaffected either way.
		high_risk = self.currently_high_risk()
		self.child_risk_alert = (
			"Visit by {0}".format(frappe.utils.formatdate(add_days(window_start, policy.risk_alert_within_days)))
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

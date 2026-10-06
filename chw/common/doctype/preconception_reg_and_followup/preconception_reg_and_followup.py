# Copyright (c) 2026, tfss and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import getdate

from chw.api import sync_next_visit_todo


class PreconceptionRegandFollowup(Document):
	def validate(self):
		self.validate_followup_dates()
		self.set_next_visit_date()

	def validate_followup_dates(self):
		# A visit being logged after the fact (backdated) or a next-visit
		# date that isn't genuinely in the future would make "which row is
		# most recent" and "when is she next due" both unreliable - this
		# program has no calculation engine to catch that, so the dates
		# themselves have to be guaranteed sane going in.
		today = getdate()
		for row in self.followup_visits:
			if row.date_of_visit and getdate(row.date_of_visit) < today:
				frappe.throw(_("Row #{0}: Date of Visit cannot be in the past.").format(row.idx))
			if row.date_of_next_visit and getdate(row.date_of_next_visit) <= today:
				frappe.throw(_("Row #{0}: Date of Next Visit must be a future date, not today or earlier.").format(row.idx))

	def on_update(self):
		sync_next_visit_todo(
			self,
			"next_visit_date",
			f"Preconception followup visit due for {self.patient_name or self.name}",
		)

	def set_next_visit_date(self):
		# Unlike ANC/PNC, there's no pre-generated schedule here - a followup row
		# only ever gets added once that visit has actually happened, and it
		# carries the CHW's own note of when the next one should be. So "next
		# due" is simply whichever row was added most recently, not the
		# earliest not-yet-completed one.
		rows = [row for row in self.followup_visits if row.date_of_next_visit]
		if not rows:
			return

		current = getdate(self.next_visit_date) if self.next_visit_date else None
		last_auto = getdate(self.next_visit_date_auto) if self.next_visit_date_auto else None
		if current and last_auto and current != last_auto:
			# Front Desk (well, the CHW) manually overrode this - leave it alone,
			# same override-tolerance ANC/PNC already give.
			return

		calculated_date = getdate(rows[-1].date_of_next_visit)
		self.next_visit_date = calculated_date
		self.next_visit_date_auto = calculated_date

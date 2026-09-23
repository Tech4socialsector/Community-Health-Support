# Copyright (c) 2026, tech4socialsector@azimpremjifoundation.org and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document
from frappe.utils import getdate
from chw.api import sync_next_visit_todo, validate_phone_number


class ANCFollowup(Document):
	def validate(self):
		validate_phone_number(self.phone_number)
		if self.status == "Closed":
			# She's delivered - no more ANC visits are due, regardless of what's
			# still sitting on the last row's Date of Next Visit.
			self.next_anc_visit_date = None
			self.next_anc_visit_date_auto = None
		else:
			self.set_next_anc_visit_date()

	def on_update(self):
		sync_next_visit_todo(
			self,
			"next_anc_visit_date",
			f"ANC follow-up visit due for {self.first_name or self.pregnant_id}",
		)

	def set_next_anc_visit_date(self):
		# No pre-generated schedule any more - a followup row only ever gets
		# added once that visit has actually happened, and it carries the CHW's
		# own note of when the next one should be. So "next due" is simply
		# whichever row was added most recently.
		rows = [row for row in self.anc_followup if row.date_of_next_visit]
		if not rows:
			return

		current = getdate(self.next_anc_visit_date) if self.next_anc_visit_date else None
		last_auto = getdate(self.next_anc_visit_date_auto) if self.next_anc_visit_date_auto else None
		if current and last_auto and current != last_auto:
			# user has manually overridden the date; leave it alone
			return

		calculated_date = getdate(rows[-1].date_of_next_visit)
		self.next_anc_visit_date = calculated_date
		self.next_anc_visit_date_auto = calculated_date

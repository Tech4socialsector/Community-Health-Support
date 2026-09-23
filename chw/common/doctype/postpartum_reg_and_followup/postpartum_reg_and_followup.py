# Copyright (c) 2026, tfss and contributors
# For license information, please see license.txt

from frappe.model.document import Document
from frappe.utils import getdate

from chw.api import sync_next_visit_todo


class PostpartumRegandFollowup(Document):
	def validate(self):
		self.set_next_visit_date()

	def on_update(self):
		sync_next_visit_todo(
			self,
			"next_visit_date",
			f"Postpartum followup visit due for {self.patient_name or self.name}",
		)

	def set_next_visit_date(self):
		# Same reasoning as Preconception's own set_next_visit_date() - a
		# followup row only exists once that visit already happened, so "next
		# due" is whichever row was added most recently, not an earliest-pending
		# lookup like ANC/PNC use.
		rows = [row for row in self.followup_visits if row.date_of_next_visit]
		if not rows:
			return

		current = getdate(self.next_visit_date) if self.next_visit_date else None
		last_auto = getdate(self.next_visit_date_auto) if self.next_visit_date_auto else None
		if current and last_auto and current != last_auto:
			return

		calculated_date = getdate(rows[-1].date_of_next_visit)
		self.next_visit_date = calculated_date
		self.next_visit_date_auto = calculated_date

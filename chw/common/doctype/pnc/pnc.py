# Copyright (c) 2026, tech4socialsector@azimpremjifoundation.org and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import getdate
from chw.api import sync_next_visit_todo, validate_phone_number


class PNC(Document):
	def validate(self):
		validate_phone_number(self.phone_number)
		self.validate_gender()
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

	def set_next_pnc_visit_date(self):
		# No pre-generated schedule any more - a mother row only ever gets added
		# once that visit has actually happened (in practice, PNC visits here
		# run about 3 weeks, not a fixed 6-month interval schedule), and it
		# carries the CHW's own note of when the next one should be. So "next
		# due" is simply whichever row was added most recently.
		rows = [row for row in self.mother if row.date_of_next_visit]
		if not rows:
			return

		current = getdate(self.next_pnc_visit_date) if self.next_pnc_visit_date else None
		last_auto = getdate(self.next_pnc_visit_date_auto) if self.next_pnc_visit_date_auto else None
		if current and last_auto and current != last_auto:
			# user has manually overridden the date; leave it alone
			return

		calculated_date = getdate(rows[-1].date_of_next_visit)
		self.next_pnc_visit_date = calculated_date
		self.next_pnc_visit_date_auto = calculated_date

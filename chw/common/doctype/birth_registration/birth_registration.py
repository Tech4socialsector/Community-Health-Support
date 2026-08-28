# Copyright (c) 2026, tech4socialsector@azimpremjifoundation.org and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.model.document import Document
from chw.api import validate_phone_number


class BirthRegistration(Document):
	def validate(self):
		validate_phone_number(self.phone_number)
		self.validate_pregnancy_registration()

	def validate_pregnancy_registration(self):
		if not self.family_member_id:
			return

		if not frappe.db.exists("Pregnancy Registration", {"familymember_id": self.family_member_id}):
			frappe.throw(_(
				"Birth Registration can only be created for a family member who has a "
				"Pregnancy Registration on record."
			))

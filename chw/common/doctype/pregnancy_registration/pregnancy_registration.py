# Copyright (c) 2026, tech4socialsector@azimpremjifoundation.org and contributors
# For license information, please see license.txt

from frappe.model.document import Document
from frappe.utils import add_days
from chw.api import validate_phone_number


class PregnancyRegistration(Document):
	def validate(self):
		validate_phone_number(self.phone_number)
		if self.lmp_date:
			self.estimated_date_of_delivery = add_days(self.lmp_date, 281)
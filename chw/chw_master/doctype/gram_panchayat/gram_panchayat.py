# Copyright (c) 2026, tech4socialsector@azimpremjifoundation.org and contributors
# For license information, please see license.txt

from frappe.model.document import Document

from chw.places import fill_and_check_code


class GramPanchayat(Document):
	def validate(self):
		fill_and_check_code(self)

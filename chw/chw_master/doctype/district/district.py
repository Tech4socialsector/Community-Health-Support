# Copyright (c) 2026, tech4socialsector@azimpremjifoundation.org and contributors
# For license information, please see license.txt

from frappe.model.document import Document

from chw.places import fill_and_check_code


class District(Document):
	def validate(self):
		# Named by the user: the name is the district's name.
		if not (self.district or "").strip():
			self.district = self.name
		fill_and_check_code(self)

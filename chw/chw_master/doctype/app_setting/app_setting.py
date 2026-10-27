# Copyright (c) 2026, tech4socialsector@azimpremjifoundation.org and contributors
# For license information, please see license.txt

from frappe.model.document import Document

from chw.programmes import validate_programme_forms


class AppSetting(Document):
	def validate(self):
		validate_programme_forms(self)

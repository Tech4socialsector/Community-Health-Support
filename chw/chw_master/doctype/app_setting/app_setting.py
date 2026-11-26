# Copyright (c) 2026, tech4socialsector@azimpremjifoundation.org and contributors
# For license information, please see license.txt

from frappe.model.document import Document

from chw import field_settings
from chw.programmes import validate_programme_forms


class AppSetting(Document):
	def validate(self):
		validate_programme_forms(self)
		# Field selection per form (chw.field_settings): drop anything the
		# app needs before it's applied.
		field_settings.clean(self)

	def on_update(self):
		field_settings.apply(self)

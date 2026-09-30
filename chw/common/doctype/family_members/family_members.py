# Copyright (c) 2026, tech4socialsector@azimpremjifoundation.org and contributors
# For license information, please see license.txt

import frappe
from dateutil.relativedelta import relativedelta
from frappe import _
from frappe.model.document import Document
from frappe.utils import getdate, today
from chw.api import validate_phone_number
from chw.common.doctype.household_profile.household_profile import refresh_member_counts


class Familymembers(Document):
	def validate(self):
		validate_phone_number(self.phone_number)
		self.calculate_age()
		self.sync_suggested_charity_percentage()

	def on_update(self):
		refresh_member_counts(self.hhid)

	def after_delete(self):
		refresh_member_counts(self.hhid)

	def sync_suggested_charity_percentage(self):
		# fetch_from only pulls once, when hhid is first set on this row - if
		# the household's Charity Assessment gets filled in (or redone) later,
		# an existing family member would otherwise be stuck showing a blank
		# or stale value. Re-pull on every save instead, so it always matches
		# the household's current assessment.
		if not self.hhid:
			return
		self.suggested_charity_percentage = frappe.db.get_value(
			"Household profile", self.hhid, "charity_percentage_band"
		)

	def calculate_age(self):
		if not self.date_of_birth:
			self.age = ""
			self.age_in_months = 0
			self.age_in_days = 0
			return

		dob = getdate(self.date_of_birth)
		now = getdate(today())

		if dob > now:
			frappe.throw(_("Date of Birth cannot be in the future."))

		delta = relativedelta(now, dob)

		self.age = str(delta.years)
		self.age_in_months = delta.years * 12 + delta.months
		self.age_in_days = (now - dob).days

# Copyright (c) 2026, tech4socialsector@azimpremjifoundation.org and contributors
# For license information, please see license.txt

import frappe
from dateutil.relativedelta import relativedelta
from frappe import _
from frappe.model.document import Document
from frappe.utils import getdate, today
from chw.api import validate_phone_number
from chw.common.doctype.household_profile.household_profile import refresh_member_counts
from chw.cancer.eligibility import after_member_change, apply_member_rules


class Familymembers(Document):
	def validate(self):
		validate_phone_number(self.phone_number)
		self.calculate_age()
		# Cancer screening eligibility and the woman-as-head rule - only
		# while the Cancer programme is on (chw.cancer.eligibility).
		apply_member_rules(self)

	def on_update(self):
		refresh_member_counts(self.hhid)
		after_member_change(self)

	def after_delete(self):
		refresh_member_counts(self.hhid)
		self._deleted = True
		after_member_change(self)

	def calculate_age(self):
		if not self.date_of_birth:
			# No DOB on record - if the exact birth date isn't known, a staff
			# member can still type Age in directly by hand, and every other
			# doctype that shows this person's age (Pregnancy Registration,
			# Birth Registration, NCD, ANC, Palliative Care, Preconception,
			# Postpartum, Child 6w-1y) fetches it straight from this same
			# field - so it must be left exactly as entered, not wiped.
			# It must be a whole number of years, though: NCD does int(age)
			# and ANC Follow-up stores it in an Int field.
			age = str(self.age or "").strip()
			if age and (not age.isdigit() or int(age) > 120):
				frappe.throw(
					_("Age must be a whole number of years (0 to 120), e.g. 45."),
					title=_("Check the age"),
				)
			self.age = str(int(age)) if age else self.age
			return

		dob = getdate(self.date_of_birth)
		now = getdate(today())

		if dob > now:
			frappe.throw(_("Date of Birth cannot be in the future."))

		self.update(get_age_values(dob, now))


def get_age_values(dob, on_date):
	"""Every age field of a Family member, from its date of birth as of
	on_date. Shared by validate() and the daily refresh (chw.tasks), so a
	saved record and an overnight update can never disagree.

	`age` is the whole number of years: NCD does int(age) and ANC Follow-up
	stores it in an Int field (both fetch it from here)."""
	return {"age": str(relativedelta(on_date, dob).years)}


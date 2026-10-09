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
			# No DOB on record - if the exact birth date isn't known, a staff
			# member can still type Age in directly by hand, and every other
			# doctype that shows this person's age (Pregnancy Registration,
			# Birth Registration, NCD, ANC, Palliative Care, Preconception,
			# Postpartum, Child 6w-1y) fetches it straight from this same
			# field - so it must be left exactly as entered, not wiped.
			# Age in Months/Days can't be derived without a real DOB though,
			# so those always reset regardless.
			self.age_in_months = 0
			self.age_in_days = 0
			self.age_detail = ""
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

	`age` stays the whole number of years: NCD does int(age) and ANC
	Follow-up stores it in an Int field (both fetch it from here), so the
	years / months / days wording goes in its own field, age_detail."""
	delta = relativedelta(on_date, dob)
	return {
		"age": str(delta.years),
		"age_in_months": delta.years * 12 + delta.months,
		"age_in_days": (on_date - dob).days,
		"age_detail": format_age_detail(delta.years, delta.months, delta.days),
	}


def format_age_detail(years, months, days):
	"""'2 years, 3 months, 10 days' - leading zero units are left out, so a
	baby reads '4 months, 2 days' or '12 days', not '0 years, 0 months'."""

	def part(count, unit):
		return f"{count} {unit}" + ("" if count == 1 else "s")

	parts = []
	if years:
		parts.append(part(years, "year"))
	if years or months:
		parts.append(part(months, "month"))
	parts.append(part(days, "day"))
	return ", ".join(parts)

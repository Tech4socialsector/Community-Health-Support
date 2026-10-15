# Copyright (c) 2026, tech4socialsector@azimpremjifoundation.org and contributors
# For license information, please see license.txt

import frappe
from dateutil.relativedelta import relativedelta
from frappe import _
from frappe.model.document import Document
from frappe.utils import getdate, today
from chw.api import validate_phone_number
from chw.common.doctype.household_profile.household_profile import refresh_member_counts

# LCH Palliative Care Charity Criteria form - each field's options are listed
# worst-need-first (score 4) to least-need (score 1), so the score is just
# that option's position in its own list. Kept here as the single source of
# truth; family_members.js and the PWA's familyMembers doctype-hook mirror
# this same order for a live client-side preview, but the server always
# recomputes on save regardless of what the browser sent.
CHARITY_CRITERIA_FIELDS = [
	"charity_breadwinner_occupation",
	"charity_dependent_ratio",
	"charity_health_condition",
	"charity_living_conditions",
	"charity_disability_severity",
	"charity_mch_assessment",
]

# Some criteria only apply some of the time (mirrors each field's own
# depends_on in family_members.json) - a field hidden by its own condition
# must not count toward "every criterion answered" below, or the suggested
# % would never appear for a record that will never show that field.
CHARITY_CRITERIA_APPLICABLE = {
	"charity_disability_severity": lambda doc: doc.get("is_the_person_currently_pregnant") != "Yes",
	"charity_mch_assessment": lambda doc: doc.get("does_the_person_require_palliative_care") != "Yes",
}


def _applicable_charity_fields(doc):
	return [f for f in CHARITY_CRITERIA_FIELDS if CHARITY_CRITERIA_APPLICABLE.get(f, lambda d: True)(doc)]


def _option_score(fieldname, value, meta):
	if not value:
		return 0
	options = [o for o in (meta.get_field(fieldname).options or "").split("\n") if o]
	try:
		# First option (index 0) is worst-need = score 4, last is score 1.
		return len(options) - options.index(value)
	except ValueError:
		return 0


def charity_percentage_band(score):
	if score >= 20:
		return ">80%"
	if score >= 17:
		return "60-80%"
	if score >= 12:
		return "40-60%"
	if score >= 7:
		return "20-40%"
	return "0-20%"


class Familymembers(Document):
	def validate(self):
		validate_phone_number(self.phone_number)
		self.calculate_age()
		self.update_charity_assessment()

	def on_update(self):
		refresh_member_counts(self.hhid)

	def after_delete(self):
		refresh_member_counts(self.hhid)

	def update_charity_assessment(self):
		meta = self.meta
		applicable = _applicable_charity_fields(self)
		answered = [f for f in applicable if self.get(f)]
		if not answered:
			self.charity_assessment_score = 0
			self.suggested_charity_percentage = ""
			return

		score = sum(_option_score(f, self.get(f), meta) for f in CHARITY_CRITERIA_FIELDS)
		self.charity_assessment_score = score
		# Only show a suggested band once every criterion that actually
		# applies to this record is answered - a partial score would
		# understate need and suggest too low a charity %.
		if len(answered) == len(applicable):
			self.suggested_charity_percentage = charity_percentage_band(score)
		else:
			self.suggested_charity_percentage = ""

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

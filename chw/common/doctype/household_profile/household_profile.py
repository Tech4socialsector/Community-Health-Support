# Copyright (c) 2026, tech4socialsector@azimpremjifoundation.org and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document
from chw.api import validate_phone_number

# LCH Palliative Care Charity Criteria form - each field's options are listed
# worst-need-first (score 4) to least-need (score 1), so the score is just
# that option's position in its own list. Kept here as the single source of
# truth; household_profile.js mirrors this same order for the live client-side
# total, but the server always recomputes on save regardless of what the
# browser sent.
CHARITY_CRITERIA_FIELDS = [
	"charity_breadwinner_occupation",
	"charity_dependent_ratio",
	"charity_health_condition",
	"charity_living_conditions",
	"charity_disability_severity",
]


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
	if score >= 17:
		return ">80%"
	if score >= 14:
		return "60-80%"
	if score >= 10:
		return "40-60%"
	if score >= 6:
		return "20-40%"
	return "0-20%"


class Householdprofile(Document):
	def validate(self):
		validate_phone_number(self.phone_no)
		self.update_member_counts()
		self.update_charity_assessment()

	def update_member_counts(self):
		self.members_added = frappe.db.count("Family members", {"hhid": self.name}) if self.name else 0
		self.pending_members = max((self.total_family_members or 0) - self.members_added, 0)

	def update_charity_assessment(self):
		meta = self.meta
		answered = [f for f in CHARITY_CRITERIA_FIELDS if self.get(f)]
		if not answered:
			self.charity_assessment_score = 0
			self.charity_percentage_band = ""
			return

		score = sum(_option_score(f, self.get(f), meta) for f in CHARITY_CRITERIA_FIELDS)
		self.charity_assessment_score = score
		# Only show a suggested band once all 5 criteria are answered - a
		# partial score would understate need and suggest too low a charity %.
		if len(answered) == len(CHARITY_CRITERIA_FIELDS):
			self.charity_percentage_band = charity_percentage_band(score)
		else:
			self.charity_percentage_band = ""


def refresh_member_counts(hhid):
	if not hhid or not frappe.db.exists("Household profile", hhid):
		return

	members_added = frappe.db.count("Family members", {"hhid": hhid})
	total_family_members = frappe.db.get_value("Household profile", hhid, "total_family_members") or 0
	pending_members = max(total_family_members - members_added, 0)

	frappe.db.set_value(
		"Household profile",
		hhid,
		{"members_added": members_added, "pending_members": pending_members},
		update_modified=False,
	)

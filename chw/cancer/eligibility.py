"""Cancer screening rules on the common forms (Family members, Household
profile). Everything here runs only while the Cancer programme is on in
App Setting - the other programmes' use of those forms is untouched.

Eligible for cancer screening (Cancer Screening Program workflow):
  - a woman aged 30-65, or
  - anyone, of any age, who uses tobacco,
  - and not a known cancer patient.

Head of the family: in the cancer programme it is a woman. Only when the
family has no woman may a man be head (the workflow's "if only men is
there in family, create new ID with him as head")."""

import frappe
from frappe import _
from frappe.utils import cint

from chw.programmes import enabled_programmes

# The Relationship (with the Head of the Family) a member who IS the head
# carries - created by patch chw.patches.v1_0.add_head_of_family_relationship.
HEAD_RELATIONSHIP = "Self (Head of the Family)"

ELIGIBLE_AGE = (30, 65)


def cancer_on():
	return "cancer" in enabled_programmes()


def eligibility(member):
	"""(Yes|No, reason) for a Family member, from gender, age, tobacco use
	and known cancer patient."""
	if member.get("known_cancer_patient") == "Yes":
		return "No", _("Known cancer patient")
	age = cint(member.get("age")) if str(member.get("age") or "").strip() else None
	is_woman = member.get("gender") == "Female"
	if is_woman and age is not None and ELIGIBLE_AGE[0] <= age <= ELIGIBLE_AGE[1]:
		return "Yes", ""
	if member.get("tobacco_user") == "Yes":
		return "Yes", ""
	if is_woman:
		if age is None:
			return "No", _("Age not known")
		return "No", _("Age mismatch (not 30–65)")
	return "No", _("Not a woman aged 30–65 and not a tobacco user")


def apply_member_rules(member):
	"""Family members validate."""
	if not cancer_on():
		return
	set_member_eligibility(member)
	check_head_is_woman(member)


def set_member_eligibility(member):
	if member.get("cancer_eligibility_manual"):
		member.cancer_not_eligible_reason = member.cancer_eligibility_note if member.cancer_screening_eligible == "No" else ""
		return
	member.cancer_screening_eligible, member.cancer_not_eligible_reason = eligibility(member)


def _other_members(member):
	if not member.hhid:
		return []
	return frappe.get_all(
		"Family members",
		filters={"hhid": member.hhid, "name": ["!=", member.name or ""], "status": ["!=", "Inactive"]},
		fields=["name", "family_member", "gender", "relationship"],
	)


def check_head_is_woman(member):
	others = _other_members(member)
	women = [m for m in others if m.gender == "Female"]

	if member.relationship == HEAD_RELATIONSHIP:
		other_head = next((m for m in others if m.relationship == HEAD_RELATIONSHIP), None)
		if other_head:
			frappe.throw(
				_("{0} is already the head of this family. Change their relationship first.").format(
					other_head.family_member or other_head.name
				),
				title=_("Only one head of the family"),
			)
		if member.gender != "Female":
			if women:
				frappe.throw(
					_("In the cancer screening programme the head of the family must be a woman. Make {0} the head instead.").format(
						", ".join(w.family_member or w.name for w in women)
					),
					title=_("Head of the family must be a woman"),
				)
			if member.tobacco_user != "Yes":
				frappe.msgprint(
					_("There is no woman in this family, so a man can be the head - but for cancer screening he should be a tobacco user."),
					title=_("Head of the family"),
					indicator="orange",
				)
		return

	# A woman added to a family whose head is a man: point it out.
	if member.gender == "Female":
		male_head = next((m for m in others if m.relationship == HEAD_RELATIONSHIP and m.gender != "Female"), None)
		if male_head:
			frappe.msgprint(
				_("The head of this family is {0}, a man. In the cancer screening programme the head should be a woman - consider making {1} the head.").format(
					male_head.family_member or male_head.name, member.family_member or _("this member")
				),
				title=_("Head of the family"),
				indicator="orange",
			)


def after_member_change(member):
	"""Family members on_update / after_delete: keep the household's head
	name and eligibility in step."""
	if not cancer_on() or not member.hhid or not frappe.db.exists("Household profile", member.hhid):
		return
	if member.relationship == HEAD_RELATIONSHIP and member.family_member and not getattr(member, "_deleted", False):
		if frappe.db.get_value("Household profile", member.hhid, "household_head_name") != member.family_member:
			frappe.db.set_value("Household profile", member.hhid, "household_head_name", member.family_member)
	refresh_household_eligibility(member.hhid)


def refresh_household_eligibility(hhid):
	"""Household Eligible = Yes when any active member is eligible; else No
	with the reason (Known Cancer Patient / Age Mismatch / Others)."""
	if frappe.db.get_value("Household profile", hhid, "cancer_survey_done") == "No":
		return
	members = frappe.get_all(
		"Family members",
		filters={"hhid": hhid, "status": ["!=", "Inactive"]},
		fields=["cancer_screening_eligible", "known_cancer_patient", "gender", "cancer_not_eligible_reason"],
	)
	if not members:
		return
	values = {"cancer_screening_eligible": "No", "not_eligible_reason": None, "not_eligible_other_reason": None}
	if any(m.cancer_screening_eligible == "Yes" for m in members):
		values["cancer_screening_eligible"] = "Yes"
	elif all(m.known_cancer_patient == "Yes" for m in members):
		values["not_eligible_reason"] = "Known Cancer Patient"
	elif any(m.gender == "Female" and m.known_cancer_patient != "Yes" for m in members):
		values["not_eligible_reason"] = "Age Mismatch"
	else:
		values["not_eligible_reason"] = "Others"
		values["not_eligible_other_reason"] = _("No woman aged 30–65 and no tobacco user")
	frappe.db.set_value("Household profile", hhid, values)

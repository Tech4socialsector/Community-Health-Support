import frappe


def execute():
	"""Cancer screening eligibility is now worked out from gender, age and
	tobacco use (chw.cancer.eligibility). Recalculate it once for existing
	family members - and their households - on a site running Cancer;
	members set by hand keep their value."""
	from chw.cancer.eligibility import cancer_on, eligibility, refresh_household_eligibility

	if not cancer_on():
		return
	frappe.reload_doc("common", "doctype", "family_members")
	households = set()
	for m in frappe.get_all(
		"Family members",
		filters={"cancer_eligibility_manual": 0},
		fields=["name", "hhid", "gender", "age", "tobacco_user", "known_cancer_patient"],
	):
		eligible, reason = eligibility(m)
		frappe.db.set_value(
			"Family members",
			m.name,
			{"cancer_screening_eligible": eligible, "cancer_not_eligible_reason": reason},
			update_modified=False,
		)
		if m.hhid:
			households.add(m.hhid)
	for hhid in households:
		if frappe.db.exists("Household profile", hhid):
			refresh_household_eligibility(hhid)

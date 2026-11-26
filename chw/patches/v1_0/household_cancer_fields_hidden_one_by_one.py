import frappe


def execute():
	"""Household profile was rearranged: the Cancer Survey section is gone and
	its questions sit in Respondent Details. Cancer now hides those questions
	one by one (programmes.common_sections); drop the Property Setters left
	on the removed section and apply the new rule."""
	for name in frappe.get_all(
		"Property Setter",
		filters={"doc_type": "Household profile", "field_name": "cancer_survey_section"},
		pluck="name",
	):
		frappe.delete_doc("Property Setter", name, ignore_permissions=True)
	from chw.programmes import apply_common_sections

	apply_common_sections()
	frappe.clear_cache(doctype="Household profile")

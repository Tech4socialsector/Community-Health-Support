import frappe


def execute():
	"""Cancer screening conditions:
	- the "Self (Head of the Family)" relationship, so the member who is the
	  head can be marked (and checked to be a woman while Cancer is on);
	- consent is new on the Main Screening Form and now opens the screening
	  tabs: screenings recorded before it existed are taken as consented,
	  so they stay visible."""
	from chw.cancer.eligibility import HEAD_RELATIONSHIP

	frappe.reload_doc("chw_master", "doctype", "relationship_with_the_head_of_the_family")
	if not frappe.db.exists("Relationship with the Head of the Family", HEAD_RELATIONSHIP):
		frappe.get_doc({"doctype": "Relationship with the Head of the Family", "__newname": HEAD_RELATIONSHIP}).insert(
			ignore_permissions=True, set_name=HEAD_RELATIONSHIP
		)

	frappe.reload_doc("cancer", "doctype", "main_screening_form")
	for name, exam_date, created in frappe.get_all(
		"Main Screening Form",
		filters={"consent_given": ["in", [None, ""]]},
		fields=["name", "date_of_examination", "creation"],
		as_list=True,
	):
		frappe.db.set_value(
			"Main Screening Form",
			name,
			{"consent_given": "Yes", "consent_date": exam_date or created.date()},
			update_modified=False,
		)

import frappe

from chw.api import find_matching_anc_followup


def execute():
	frappe.reload_doc("common", "doctype", "pnc")

	pnc_records = frappe.get_all(
		"PNC",
		filters={"anc_followup_id": ["in", ["", None]]},
		fields=["name", "birth_registration_id"],
	)

	for pnc in pnc_records:
		if not pnc.birth_registration_id:
			continue

		family_member_id, date_of_delivery = frappe.db.get_value(
			"Birth Registration", pnc.birth_registration_id, ["family_member_id", "date_of_delivery"]
		)
		anc_followup_id = find_matching_anc_followup(family_member_id, date_of_delivery)
		if anc_followup_id:
			frappe.db.set_value("PNC", pnc.name, "anc_followup_id", anc_followup_id)

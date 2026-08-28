import frappe
from frappe.utils import getdate

from chw.common.doctype.child_growth_monitoring.child_growth_monitoring import get_stage_for_date


def execute():
	"""One-time migration: Malnutrition + Malnutrition Followup Child are being
	retired in favour of the unified Child Growth Monitoring / Child Growth
	Followup doctypes (which cover the same 0-5 year MUAC/edema/classification
	workflow, plus 5-11 years). Copy every existing Malnutrition record's data
	across before the old doctype's files (and, via remove_orphan_doctypes, its
	DocType record) are removed later in this same migrate run.
	"""
	frappe.reload_doc("common", "doctype", "child_growth_followup")
	frappe.reload_doc("common", "doctype", "child_growth_monitoring")

	if not frappe.db.table_exists("Malnutrition"):
		return

	malnutrition_records = frappe.get_all(
		"Malnutrition",
		fields=["name", "familymember_id", "health_worker_name", "next_followup_date", "next_followup_date_auto"],
	)

	for m in malnutrition_records:
		if not m.familymember_id or not frappe.db.exists("Family members", m.familymember_id):
			continue

		family_member = frappe.get_doc("Family members", m.familymember_id)
		if not family_member.date_of_birth:
			continue

		cgm_name = frappe.db.get_value(
			"Child Growth Monitoring", {"familymember_id": m.familymember_id}, "name"
		)
		cgm = (
			frappe.get_doc("Child Growth Monitoring", cgm_name)
			if cgm_name
			else frappe.new_doc("Child Growth Monitoring")
		)

		cgm.familymember_id = family_member.name
		cgm.village = family_member.village
		cgm.household_id = family_member.hhid
		cgm.first_name = family_member.family_member
		cgm.gender = family_member.gender
		cgm.date_of_birth = family_member.date_of_birth
		cgm.phone_number = family_member.phone_number
		cgm.health_worker_name = cgm.health_worker_name or m.health_worker_name

		existing_dates = {getdate(row.date) for row in cgm.growth_followup if row.date}

		followups = frappe.get_all(
			"Malnutrition Followup Child",
			filters={"parent": m.name},
			fields=[
				"date", "status", "weight", "height", "muac", "edema",
				"classification", "referred_to_nrc", "remarks",
			],
			order_by="date asc",
		)

		for f in followups:
			if f.date and getdate(f.date) in existing_dates:
				continue
			cgm.append("growth_followup", {
				"date": f.date,
				"stage": get_stage_for_date(family_member.date_of_birth, f.date) if f.date else "",
				"status": f.status,
				"weight": f.weight,
				"height": f.height,
				"muac": f.muac,
				"edema": f.edema,
				"classification": f.classification,
				"referred_to_nrc": f.referred_to_nrc,
				"remarks": f.remarks,
			})

		if m.next_followup_date and not cgm_name:
			cgm.next_followup_date = m.next_followup_date
			cgm.next_followup_date_auto = m.next_followup_date_auto

		cgm.save(ignore_permissions=True)

	frappe.db.commit()

	# The "Malnutrition" Number Card on the CHW App workspace is a DB-only record
	# (never exported to a file) - repoint it so the workspace tile keeps working
	# once the Malnutrition doctype itself is gone.
	if frappe.db.exists("Number Card", "Malnutrition"):
		frappe.db.set_value("Number Card", "Malnutrition", {
			"label": "Child Growth Monitoring",
			"document_type": "Child Growth Monitoring",
		})
		frappe.db.commit()

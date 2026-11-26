import frappe


def execute():
	"""Outreach Clinic: Status (Planned / Active / Closed) became one Active
	tick, and the team table and resource-planning counts were dropped
	(allocation will come from user roles). Carry a closed clinic over as
	not active, and remove the Outreach Clinic Team doctype."""
	if frappe.db.has_column("Outreach Clinic", "status"):
		frappe.db.sql("update `tabOutreach Clinic` set active = 0 where status = 'Closed'")
		frappe.db.sql("update `tabOutreach Clinic` set active = 1 where ifnull(status, '') != 'Closed'")
	if frappe.db.exists("DocType", "Outreach Clinic Team"):
		frappe.delete_doc("DocType", "Outreach Clinic Team", ignore_missing=True, force=True)

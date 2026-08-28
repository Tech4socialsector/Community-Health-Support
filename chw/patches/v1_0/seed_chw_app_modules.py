import frappe


def execute():
	"""Seed the CHW App Settings.modules child table with the app's default
	Home page tiles, so the Vue app has navigation modules out of the box
	instead of an empty list until someone configures them from the desk."""
	frappe.reload_doc("chw_master", "doctype", "chw_app_module")
	frappe.reload_doc("chw_master", "doctype", "chw_app_settings")

	settings = frappe.get_single("CHW App Settings")
	if settings.get("modules"):
		return

	defaults = [
		{"doctype_name": "Household profile", "label": "Households", "icon": "home"},
		{"doctype_name": "Family members", "label": "Family Members", "icon": "users"},
		{"doctype_name": "ANC Follow-up", "label": "ANC Follow-up", "icon": "file-text"},
	]
	for row in defaults:
		settings.append("modules", {"enabled": 1, **row})
	settings.save(ignore_permissions=True)
	frappe.db.commit()

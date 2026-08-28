import frappe


def execute():
	"""One-time copy of CHW App Settings.modules (child table rows) into the
	standalone CHW Module Settings doctype (one row per DocType), so Home's
	module tiles get their own list view/records instead of being buried in a
	Single doctype's grid. CHW Module Settings was later replaced by App
	Module Setting - see migrate_module_settings_to_app_module_setting, which
	regroups these flat rows into that new shape. The old "modules" field on
	CHW App Settings is left in place (hidden) for history.
	"""
	if not frappe.db.table_exists("CHW Module Settings"):
		return

	frappe.reload_doc("chw_master", "doctype", "chw_app_settings")

	settings = frappe.get_single("CHW App Settings")
	old_rows = settings.get("modules") or []

	for idx, row in enumerate(old_rows):
		if not row.doctype_name or frappe.db.exists("CHW Module Settings", row.doctype_name):
			continue
		frappe.get_doc({
			"doctype": "CHW Module Settings",
			"doctype_name": row.doctype_name,
			"label": row.label,
			"icon": row.icon,
			"route": row.route,
			"enabled": row.enabled,
			"restrict_by_role": row.get("restrict_by_role"),
			"roles": row.get("roles"),
			"sort_order": idx,
		}).insert(ignore_permissions=True)

	frappe.db.commit()

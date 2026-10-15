import frappe


def execute():
	"""CHW Module Settings (one row per DocType, roles as CSV text) is replaced
	by App Module Setting (one row per module label, with a "doctypes" child
	table so a module can list several sidebar DocTypes, and roles as a proper
	Table MultiSelect). Group the old flat rows back into modules by label and
	copy them across; the old doctype is left on disk so this data is still
	readable if a resume/rollback needs it, but is no longer used by the app.
	"""
	frappe.reload_doc("chw_master", "doctype", "app_module_setting_role")
	frappe.reload_doc("chw_master", "doctype", "app_module_doctype_item")
	frappe.reload_doc("chw_master", "doctype", "app_module_setting")

	if not frappe.db.table_exists("CHW Module Settings"):
		return

	old_rows = frappe.get_all(
		"CHW Module Settings",
		fields=["name", "label", "doctype_name", "icon", "route", "enabled", "restrict_by_role", "roles", "sort_order"],
		order_by="sort_order asc",
	)

	modules = {}
	for row in old_rows:
		label = row.label or row.doctype_name
		module = modules.setdefault(label, {
			"label": label,
			"icon": row.icon,
			"enabled": row.enabled,
			"restrict_by_role": row.restrict_by_role,
			"roles": {r.strip() for r in (row.roles or "").split(",") if r.strip()},
			"sort_order": row.sort_order or 0,
			"doctypes": [],
		})
		module["roles"] |= {r.strip() for r in (row.roles or "").split(",") if r.strip()}
		module["doctypes"].append({
			"doctype_name": row.doctype_name,
			"label": row.label,
			"icon": row.icon,
			"route": row.route,
		})

	for module in modules.values():
		module_name = frappe.scrub(module["label"])
		if frappe.db.exists("App Module Setting", module_name):
			continue
		frappe.get_doc({
			"doctype": "App Module Setting",
			"module_name": module_name,
			"label": module["label"],
			"icon": module["icon"],
			"enabled": module["enabled"],
			"restrict_by_role": module["restrict_by_role"],
			"roles": [{"role": r} for r in module["roles"]],
			"sort_order": module["sort_order"],
			"doctypes": module["doctypes"],
		}).insert(ignore_permissions=True)

	frappe.db.commit()

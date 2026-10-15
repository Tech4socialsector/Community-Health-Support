import frappe


def execute():
	"""App Module Setting now autonames by `module_name` instead of `label`, and
	has a new required, unique `module_name` field. Existing records (named by
	their old `label` value) need `module_name` backfilled and the record
	itself renamed to match, so autoname stays consistent going forward.
	"""
	frappe.reload_doc("chw_master", "doctype", "app_module_setting")

	if not frappe.db.table_exists("App Module Setting"):
		return

	rows = frappe.get_all("App Module Setting", fields=["name", "label", "module_name"])
	for row in rows:
		if row.module_name:
			continue
		slug = frappe.scrub(row.label or row.name)
		module_name = slug
		suffix = 1
		while (
			module_name.lower() != row.name.lower()
			and frappe.db.exists("App Module Setting", module_name)
		):
			suffix += 1
			module_name = f"{slug}_{suffix}"

		frappe.db.set_value("App Module Setting", row.name, "module_name", module_name, update_modified=False)
		if module_name != row.name:
			frappe.rename_doc("App Module Setting", row.name, module_name, force=True, show_alert=False)

	frappe.db.commit()

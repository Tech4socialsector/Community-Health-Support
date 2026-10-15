import frappe


def execute():
	"""CHW App Settings is renamed to App Setting (shorter, since "CHW" is
	already implied by the app itself). App Setting is a Single with no
	incoming Link/Table references from any other doctype, so no downstream
	reference fixups are needed - but frappe.rename_doc("DocType", ...) does
	NOT move a Single's own key-value rows in `tabSingles` (that table is
	keyed by the doctype name string, and the generic doctype-rename path
	only renames a doctype's own SQL table, which a Single doesn't have).
	Those rows have to be migrated by hand, or app_name/app_logo/etc. (and
	the child-table rows they contain) silently orphan under the old name.
	"""
	old_name = "CHW App Settings"
	new_name = "App Setting"

	frappe.reload_doc("chw_master", "doctype", "app_setting")

	had_old_doctype = frappe.db.exists("DocType", old_name)

	if had_old_doctype and not frappe.db.exists("DocType", new_name):
		frappe.rename_doc("DocType", old_name, new_name, force=True, show_alert=False)

	Singles = frappe.qb.DocType("Singles")
	orphaned = frappe.qb.from_(Singles).select(Singles.field).where(Singles.doctype == old_name).limit(1).run()
	if orphaned:
		(
			frappe.qb.update(Singles)
			.set(Singles.doctype, new_name)
			.where(Singles.doctype == old_name)
		).run()
		(
			frappe.qb.update(Singles)
			.set(Singles.value, new_name)
			.where((Singles.doctype == new_name) & (Singles.field == "name"))
		).run()

	frappe.delete_doc("DocType", old_name, ignore_missing=True, force=True)
	frappe.db.commit()

import frappe

# Roles another app layers onto chw doctypes through Custom DocPerm
# (metta's custom_docperm.json fixture adds "CHW Coordinator" to 26 of
# them, re-applied on every migrate).
LAYERED_ROLES = {"CHW Coordinator"}

# DocPerm bookkeeping that mustn't be copied onto a new Custom DocPerm row.
SKIP_FIELDS = {"name", "owner", "creation", "modified", "modified_by", "idx", "parent", "parentfield", "parenttype", "doctype"}


def restore_standard_perms_hidden_by_custom():
	"""Once a doctype has any Custom DocPerm row, Frappe ignores the
	doctype's own permission rules entirely. The layered "CHW Coordinator"
	row therefore *replaced* chw's rules (System Manager, Program
	Coordinator, CHW Health Worker) instead of adding to them: nobody could
	delete in Desk, and those roles lost access altogether.

	Copies the doctype's own rules in beside the layered one - what Role
	Permission Manager itself does when a doctype is first customised.
	Only touches chw doctypes whose custom rules are *all* layered roles,
	i.e. exactly this state; a doctype someone has customised by hand in
	Role Permission Manager already has other rows and is left alone.
	Runs after_migrate, so after the fixture that causes it; safe to repeat.
	"""
	chw_modules = set(frappe.get_all("Module Def", filters={"app_name": "chw"}, pluck="name"))
	custom_rows = frappe.get_all("Custom DocPerm", fields=["parent", "role"])

	roles_by_doctype = {}
	for row in custom_rows:
		roles_by_doctype.setdefault(row.parent, set()).add(row.role)

	restored = []
	for doctype, roles in roles_by_doctype.items():
		if not roles <= LAYERED_ROLES:
			continue
		if frappe.db.get_value("DocType", doctype, "module") not in chw_modules:
			continue

		added = 0
		for perm in frappe.get_all("DocPerm", fields="*", filters={"parent": doctype}):
			if perm.role in LAYERED_ROLES:
				continue
			exists = frappe.db.exists(
				"Custom DocPerm",
				{"parent": doctype, "role": perm.role, "permlevel": perm.permlevel, "if_owner": perm.if_owner},
			)
			if exists:
				continue
			custom = frappe.new_doc("Custom DocPerm")
			custom.update({k: v for k, v in perm.items() if k not in SKIP_FIELDS})
			custom.parent = doctype
			custom.insert(ignore_permissions=True)
			added += 1

		if added:
			frappe.clear_cache(doctype=doctype)
			restored.append(doctype)

	if restored:
		frappe.db.commit()
	print(f"chw: restored standard permissions on {len(restored)} doctype(s): {', '.join(sorted(restored))}")

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


# Lookup lists the CHW forms link to. Anyone who fills a form may add a
# missing entry from the Link box ("+ Create a new ...", as in Desk) -
# read and create only, never edit or delete; Program Manager and Report
# Viewer only read. The same rows are in each doctype's own JSON; this
# covers sites where the doctype has Custom DocPerm rows, which make
# Frappe ignore the JSON (see restore_standard_perms_hidden_by_custom).
MASTER_DOCTYPES = (
	"Appearance",
	"Cardiovascular",
	"Does the patient need",
	"Gastrointestinal",
	"Genitourinary",
	"Gram Panchayat",
	"Mental Health Symptom Master",
	"Musculatory System",
	"NCD Disease",
	"Neurological",
	"Occupation",
	"Past Medical History Master",
	"Pregnancy High Risk Master",
	"Relationship with the Head of the Family",
	"Respiratory",
	"State List",
	"Sub Centre",
	"Symptoms",
	"Type Of Disability",
	"Village",
	"medicine name",
)
MASTER_CREATE_ROLES = (
	"CHW Health Worker",
	"CHW Coordinator",
	"Data Collector",
	"Coordinator",
	"Palliative Care Coordinator",
	"Palliative Care Worker",
)
MASTER_READ_ROLES = ("Program Manager", "Report Viewer")


def grant_master_access_on_custom_perms():
	"""Adds the master read/create rows to doctypes that have Custom DocPerm
	rows - only raises flags that are off, never removes any. Runs
	after_migrate (after restore_standard_perms_hidden_by_custom); safe to
	repeat. Roles not on the site yet are skipped."""
	roles_on_site = set(frappe.get_all("Role", pluck="name"))
	changed = set()
	for doctype in MASTER_DOCTYPES:
		if not frappe.db.exists("Custom DocPerm", {"parent": doctype}):
			continue
		for role in MASTER_CREATE_ROLES + MASTER_READ_ROLES:
			if role not in roles_on_site:
				continue
			want = {"read": 1, "report": 1, "print": 1}
			if role in MASTER_CREATE_ROLES:
				want["create"] = 1
			name = frappe.db.get_value("Custom DocPerm", {"parent": doctype, "role": role, "permlevel": 0, "if_owner": 0})
			if name:
				current = frappe.db.get_value("Custom DocPerm", name, list(want), as_dict=True)
				missing = {k: 1 for k in want if not current.get(k)}
				if missing:
					frappe.db.set_value("Custom DocPerm", name, missing)
					changed.add(doctype)
			else:
				row = frappe.new_doc("Custom DocPerm")
				row.update({"parent": doctype, "role": role, "permlevel": 0, **want})
				row.insert(ignore_permissions=True)
				changed.add(doctype)

	for doctype in changed:
		frappe.clear_cache(doctype=doctype)
	if changed:
		frappe.db.commit()
	print(f"chw: master read/create access updated on {len(changed)} doctype(s)")

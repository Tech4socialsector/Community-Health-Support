import frappe


LABEL_OVERRIDES = {
	"NCD": "Non-Communicable Disease",
	"ANC Follow-up": "Antenatal Care",
	"PNC": "Postnatal Care",
}


def execute():
	"""NCD / ANC Follow-up / PNC are the real doctype names (renaming those
	would mean a DB table rename plus updating every Python/JS reference
	that hardcodes those strings - out of scope here). What users actually
	see in the app's sidebar/Home tiles is the `label` on each App Module
	Setting's Sidebar DocTypes row, which defaults to the doctype name when
	left blank - so setting an explicit friendlier label there changes what
	shows up without touching the doctype itself."""
	if not frappe.db.exists("DocType", "App Module Setting"):
		return

	for module_name in frappe.get_all("App Module Setting", pluck="name"):
		module_doc = frappe.get_doc("App Module Setting", module_name)
		changed = False
		for row in module_doc.doctypes or []:
			new_label = LABEL_OVERRIDES.get(row.doctype_name)
			if new_label and row.label != new_label:
				row.label = new_label
				changed = True
		if changed:
			module_doc.save(ignore_permissions=True)

	frappe.db.commit()

import frappe
from frappe import _

# Every programme the one chw app ships, switched on/off from App Setting ->
# Programmes. Household profile and Family members are the common forms and
# are never listed here - they are always on.
#
# `module` - the Frappe module holding the programme's forms, child tables
#   and masters.
# `role` - the role for someone who works in this programme only. Its
#   permissions are in the DocType JSON: create/write on the programme's
#   forms and on Household profile / Family members, read on its masters and
#   the common masters.
# `doctypes` - every form of the programme: hidden from the CHW app and
#   blocked from new records while the programme is off.
# `sidebar` - the subset shown in the CHW app's sidebar, in order. Forms
#   that are already in another App Module Setting (e.g. the "CHW" module
#   fixture carries the MCH and Palliative forms) stay where they are; only
#   the missing ones go into this programme's own module.
# `common_sections` - (DocType, Section/Tab Break) pairs on the common forms
#   (Household profile, Family members) that only this programme needs. They
#   are hidden while the programme is off - see apply_common_sections.
# `number_cards`, `shortcuts`, `masters` - what the programme adds to the
#   shared Desk workspace and sidebar (see apply_desk_navigation): its counts,
#   its forms in flow order, and its own masters.
PROGRAMMES = {
	"mch": {
		"module": "MCH",
		"role": "MCH Worker",
		"field": "enable_mch",
		"label": "MCH",
		"icon": "baby",
		"doctypes": [
			"Preconception Reg and Followup",
			"Pregnancy Registration",
			"ANC Follow-up",
			"Birth Registration",
			"PNC",
			"Postpartum Reg and Followup",
			"Child 6w to 1 Year Reg and Followup",
			"Child Growth Monitoring",
			"MCH Volunteer Intake Form Postpartum",
		],
		"sidebar": [
			"Preconception Reg and Followup",
			"Pregnancy Registration",
			"ANC Follow-up",
			"Birth Registration",
			"PNC",
			"Postpartum Reg and Followup",
			"Child 6w to 1 Year Reg and Followup",
		],
		"number_cards": ["Pregnancy Registration", "ANC Follow-up", "Birth Registration", "PNC Followup", "Preconception (Yesterday)", "Postpartum (Yesterday)", "Child 6w-1y (Yesterday)"],
		"shortcuts": ["Pregnancy Registration", "ANC Follow-up", "Birth Registration", "PNC", "Child 6w to 1 Year Reg and Followup"],
		"masters": ["Pregnancy High Risk Master", "Malnutrition Category Master", "ANC Visit Interval Master", "PNC Visit Interval Master", "Postpartum Visit Interval Master", "Child 6w-1y Visit Interval Master"],
	},
	"palliative": {
		"module": "Palliative Care",
		"role": "Palliative Care Worker",
		"field": "enable_palliative",
		"label": "Palliative Care",
		"icon": "heart-handshake",
		"doctypes": ["Palliative Care Initial Assessment Form", "Palliative care followup"],
		"sidebar": ["Palliative Care Initial Assessment Form", "Palliative care followup"],
		"number_cards": ["Palliative Care Initial Assessment Form-1", "Palliative Care followup-1"],
		"shortcuts": ["Palliative Care Initial Assessment Form", "Palliative care followup"],
		"masters": ["Past Medical History Master", "Symptoms", "Cardiovascular", "Respiratory", "Neurological", "Gastrointestinal", "Genitourinary", "Musculatory System", "Does the patient need"],
	},
	"mental_health": {
		"module": "Mental Health Care",
		"role": "Mental Health Care Worker",
		"field": "enable_mental_health",
		"label": "Mental Health",
		"icon": "brain",
		"doctypes": ["Mental Health"],
		"sidebar": ["Mental Health"],
		"number_cards": ["Mental Health Registrations"],
		"shortcuts": ["Mental Health"],
		"masters": ["Mental Health Symptom Master"],
	},
	"ncd": {
		"module": "NCD Care",
		"role": "NCD Care Worker",
		"field": "enable_ncd",
		"label": "NCD",
		"icon": "activity",
		"doctypes": ["NCD"],
		"sidebar": ["NCD"],
		"number_cards": ["NCD Registrations"],
		"shortcuts": ["NCD"],
		"masters": ["NCD Disease", "NCD Complications"],
	},
	"cancer": {
		"module": "Cancer",
		"role": "Cancer Worker",
		"field": "enable_cancer",
		"label": "Cancer Screening",
		"icon": "stethoscope",
		"doctypes": ["Main Screening Form", "Clinical Evaluation"],
		"sidebar": ["Main Screening Form", "Clinical Evaluation"],
		"number_cards": ["Cancer Screenings", "Clinical Evaluations"],
		"shortcuts": ["Main Screening Form", "Clinical Evaluation"],
		"common_sections": [
			("Household profile", "cancer_survey_section"),
			("Family members", "cancer_family_member_details_section"),
		],
		"masters": ["Medical History", "Breast Palpation Finding", "Breast Referral Type", "Cervix Visual Finding", "Cervical Referral Type", "HPV DNA Result Type", "Habit Master", "Occupation Master"],
	},
}

CACHE_KEY = "chw_disabled_programme_doctypes"


def enabled_programmes(settings=None):
	# Read from the table, not frappe.get_cached_doc: a cached App Setting can
	# outlive a save (seen after several saves in one session), and a stale
	# copy here gets frozen into CACHE_KEY. The result is cached anyway.
	if settings is None:
		settings = frappe.db.get_singles_dict("App Setting", cast=True)
	return [key for key, p in PROGRAMMES.items() if settings.get(p["field"])]


def disabled_doctypes():
	"""Every form of every programme that is switched off. Cached; cleared
	whenever App Setting is saved."""

	def compute():
		on = set(enabled_programmes())
		return {dt for key, p in PROGRAMMES.items() if key not in on for dt in p["doctypes"]}

	return frappe.cache.get_value(CACHE_KEY, compute)


def is_doctype_disabled(doctype):
	return doctype in disabled_doctypes()


def block_disabled_programme(doc, method=None):
	"""doc_events "*" before_insert: no new records for a programme that is
	switched off - from the CHW app, Desk or the API alike. Migrations,
	patches, installs and data imports are let through so existing data can
	still be moved around."""
	if frappe.flags.in_install or frappe.flags.in_migrate or frappe.flags.in_patch or frappe.flags.in_import:
		return
	if not is_doctype_disabled(doc.doctype):
		return
	label = next(p["label"] for p in PROGRAMMES.values() if doc.doctype in p["doctypes"])
	frappe.throw(
		_("{0} is turned off for this site. Turn it on in App Setting → Programmes to add a {1}.").format(
			_(label), _(doc.doctype)
		),
		title=_("Programme turned off"),
	)


def on_app_setting_update(doc, method=None):
	# The saved doc itself, not the cached copy - the document cache may not
	# be cleared yet while on_update runs.
	frappe.clear_document_cache("App Setting", "App Setting")
	frappe.cache.delete_value(CACHE_KEY)
	sync_programme_modules(doc)
	apply_desk_navigation(doc)
	apply_common_sections(doc)
	# Desk caches each form's meta, Connections box included.
	frappe.clear_cache()


def sync_programme_modules(settings=None):
	"""Give every switched-on programme a place in the CHW app's sidebar.

	For each programme, the `sidebar` forms that aren't already in some App
	Module Setting are put into an App Module Setting of the programme's own
	(named after its label), created the first time it's needed. A programme
	that is switched off keeps its App Module Setting but gets it disabled,
	so nothing - order, icons, role restrictions someone set by hand - is
	lost when it's switched back on. Forms of switched-off programmes in
	shared modules (the "CHW" fixture) are hidden at read time by
	chw.api.get_app_modules instead."""
	on = set(enabled_programmes(settings))
	for key, p in PROGRAMMES.items():
		own = p["label"]
		exists = frappe.db.exists("App Module Setting", own)
		if key not in on:
			if exists:
				frappe.db.set_value("App Module Setting", own, "enabled", 0)
			continue

		elsewhere = set(
			frappe.get_all(
				"App Module DocType Item",
				filters={"parenttype": "App Module Setting", "parent": ["!=", own]},
				pluck="doctype_name",
			)
		)
		wanted = [dt for dt in p["sidebar"] if dt not in elsewhere and frappe.db.exists("DocType", dt)]

		if exists:
			module = frappe.get_doc("App Module Setting", own)
			have = {row.doctype_name for row in module.doctypes}
			for dt in wanted:
				if dt not in have:
					module.append("doctypes", {"doctype_name": dt, "label": dt})
			module.enabled = 1
			module.save(ignore_permissions=True)
		elif wanted:
			last = max([s or 0 for s in frappe.get_all("App Module Setting", pluck="sort_order")] or [0])
			frappe.get_doc(
				{
					"doctype": "App Module Setting",
					"module_name": own,
					"label": own,
					"icon": p["icon"],
					"enabled": 1,
					"sort_order": last + 1,
					"doctypes": [{"doctype_name": dt, "label": dt} for dt in wanted],
				}
			).insert(ignore_permissions=True)


# Desk navigation: one workspace and one sidebar for the whole app, however
# many programmes are on - Household profile and Family members once, then a
# section for each programme that is switched on.
#
# The "CHW App" workspace (common/workspace/chw_app) ships with the number
# cards, shortcuts and cards of every programme; apply_desk_navigation writes
# its page layout (`content`) with only the blocks of the programmes that are
# on. The Common sidebar (common/sidebar/common) ships with a section per
# programme; the sections of programmes that are off are hidden. Each
# programme module also ships a sidebar whose rows are all hidden, so Desk
# never shows a separate icon or sidebar per programme - their forms open in
# the Common one. Desk hides any form, card or shortcut the user has no
# permission for, so a Cancer Worker sees Household & Family plus Cancer.
WORKSPACE = "CHW App"
CORE_FORMS = ["Household profile", "Family members"]
CORE_NUMBER_CARDS = ["Household Details", "Family Members"]
COMMON_MASTERS = [
	"Village",
	"Sub Centre",
	"Gram Panchayat",
	"District",
	"State List",
	"Health Worker",
	"Occupation",
	"Relationship with the Head of the Family",
	"Type Of Disability",
	"Habits",
	"medicine name",
]


def workspace_content(keys):
	"""The workspace page layout for the programmes `keys`: number cards only,
	in groups, each under a heading - "Household & Family" (households and
	family members, shared by every programme) and then one per programme.
	Block ids are derived from what they show, so the same programmes always
	give the same layout."""

	def block(kind, name, **data):
		return {"id": f"{kind}-{frappe.scrub(name)}"[:60], "type": kind, "data": data}

	def group(title, cards):
		text = title.replace("&", "&amp;")
		out = [block("header", title, text=f'<span class="h4"><b>{text}</b></span>', col=12)]
		return out + [block("number_card", n, number_card_name=n, col=3) for n in cards]

	content = group("Household & Family", CORE_NUMBER_CARDS)
	for key in keys:
		content += group(PROGRAMMES[key]["module"], PROGRAMMES[key]["number_cards"])
	return content


def sidebar_section_owner(label):
	"""The programme a Common sidebar Section Break belongs to, from its label
	(the programme's module, or "<module> Masters")."""
	for key, p in PROGRAMMES.items():
		if label in (p["module"], f"{p['module']} Masters"):
			return key
	return None


def apply_desk_navigation(settings=None):
	"""Make Desk match App Setting -> Programmes. Runs when App Setting is
	saved and after every migrate, because migrate re-imports the workspace
	and sidebar JSON as shipped (every programme showing)."""
	import json

	on = [key for key in PROGRAMMES if key in set(enabled_programmes(settings))]
	changed = False

	content = json.dumps(workspace_content(on), separators=(",", ":"))
	if frappe.db.exists("Workspace", WORKSPACE) and frappe.db.get_value("Workspace", WORKSPACE, "content") != content:
		frappe.db.set_value("Workspace", WORKSPACE, "content", content, update_modified=False)
		changed = True

	programme_modules = {p["module"] for p in PROGRAMMES.values()}
	for sidebar in frappe.get_all("Sidebar", filters={"app": "chw"}, fields=["name", "module"]):
		rows = frappe.get_all(
			"Sidebar Item",
			filters={"parenttype": "Sidebar", "parent": sidebar.name},
			fields=["name", "type", "label", "child", "hidden"],
			order_by="idx asc",
		)
		section = None
		for row in rows:
			if sidebar.module in programme_modules:
				hide = 1
			else:
				if row.type == "Section Break":
					section = sidebar_section_owner(row.label)
				elif not row.child:
					section = None
				hide = 1 if section and section not in on else 0
			if row.hidden != hide:
				frappe.db.set_value("Sidebar Item", row.name, "hidden", hide, update_modified=False)
				changed = True

	if changed:
		frappe.clear_cache()


def filter_connections(data):
	"""override_doctype_dashboards (registered in hooks.py for every chw
	DocType with a Connections box): drop the connections to forms of
	programmes switched off in App Setting, and any group left empty - so
	with only Cancer on, a Family member's Connections show Main Screening
	Form and nothing else."""
	off = disabled_doctypes()
	transactions = []
	for group in data.get("transactions") or []:
		items = [dt for dt in group.get("items") or [] if dt not in off]
		if items:
			transactions.append({**group, "items": items})
	data["transactions"] = transactions
	return data


# Roles that work across every programme. A user holding one of these is
# left alone by apply_user_programme_access.
ALL_PROGRAMME_ROLES = {"Administrator", "System Manager", "Program Coordinator", "CHW Health Worker"}


def apply_user_programme_access(doc, method=None):
	"""User validate: a user whose only programme access comes from
	programme roles (Cancer Worker, MCH Worker, ...) gets the Desk modules of
	every other programme blocked, so ticking Cancer Worker on a user is all
	it takes for them to see Household & Family plus Cancer and nothing else.

	Only the five programme modules are touched; blocks on any other module
	are kept. A user with a Module Profile, or with a role that works across
	all programmes (see ALL_PROGRAMME_ROLES), is left as set."""
	if doc.module_profile:
		return
	roles = {row.role for row in doc.get("roles") or []}
	if roles & ALL_PROGRAMME_ROLES:
		return
	mine = {p["module"] for p in PROGRAMMES.values() if p["role"] in roles}
	if not mine:
		return

	programme_modules = {p["module"] for p in PROGRAMMES.values()}
	kept = [row.module for row in doc.get("block_modules") or [] if row.module not in programme_modules]
	blocked = kept + sorted(programme_modules - mine)
	if sorted(row.module for row in doc.get("block_modules") or []) != sorted(blocked):
		doc.set("block_modules", [{"module": module} for module in blocked])


def programmes_for_user():
	"""The switched-on programmes the current user can open at least one form of."""
	off = disabled_doctypes()
	return [
		key
		for key, p in PROGRAMMES.items()
		if any(dt not in off and frappe.has_permission(dt, "read") for dt in p["doctypes"])
	]


def adjust_desk_for_user(bootinfo):
	"""boot_session: fit the Desk sidebar and workspace to this user.

	Sidebar - remove section headings left with nothing under them.

	The Common sidebar has a section per programme, and Desk drops the forms
	a user can't open but keeps the Section Break above them - so an NCD Care
	Worker on a site running MCH too would see an empty "MCH" heading. This
	runs after Desk has built the user's sidebars, on chw's only."""
	for entry in (bootinfo.get("module_sidebars") or {}).values():
		if entry.get("module") != "Common":
			continue
		items = entry.get("items") or []
		kept = []
		for i, item in enumerate(items):
			if item.get("type") == "Section Break":
				following = items[i + 1] if i + 1 < len(items) else None
				if not following or following.get("type") == "Section Break" or not following.get("child"):
					continue
			kept.append(item)
		entry["items"] = kept

	# The CHW App workspace, laid out for this user: only the headings and
	# number cards of programmes they can open (Desk hides a number card the
	# user can't read, but not the heading above it).
	import json

	for page in (bootinfo.get("workspaces") or {}).get("pages") or []:
		if page.get("name") == WORKSPACE and not page.get("is_layout_customized"):
			page["content"] = json.dumps(workspace_content(programmes_for_user()), separators=(",", ":"))


def apply_common_sections(settings=None):
	"""Show the programme sections of Household profile and Family members
	only while their programme is on (e.g. "Cancer Survey" and "Cancer Family
	Member Details" for Cancer).

	Sets the section's `hidden` through a Property Setter, so Desk, the CHW
	app and the phones' offline copy of the form all follow it, and the form
	JSON stays as designed. Hiding a section hides every field under it; the
	values already saved are kept. Runs when App Setting is saved and after
	every migrate (a new site starts with every programme off)."""
	from frappe.custom.doctype.property_setter.property_setter import make_property_setter

	on = set(enabled_programmes(settings))
	for key, p in PROGRAMMES.items():
		hidden = "0" if key in on else "1"
		for doctype, fieldname in p.get("common_sections") or []:
			if not frappe.get_meta(doctype).get_field(fieldname):
				continue
			current = frappe.db.get_value(
				"Property Setter",
				{"doc_type": doctype, "field_name": fieldname, "property": "hidden"},
				"value",
			)
			if current is None and hidden == "0":
				continue  # never hidden, nothing to undo
			if current == hidden:
				continue
			make_property_setter(
				doctype, fieldname, "hidden", hidden, "Check", validate_fields_for_doctype=False
			)
			frappe.clear_cache(doctype=doctype)

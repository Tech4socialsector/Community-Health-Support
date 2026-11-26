import frappe

# Links to District, kept in step when a district's name changes.
def _district_links():
	links = frappe.db.sql(
		"select parent, fieldname from `tabDocField` where fieldtype='Link' and options='District' and parent != 'District'"
	)
	links += frappe.db.sql(
		"select dt, fieldname from `tabCustom Field` where fieldtype='Link' and options='District'"
	)
	return {(dt, fn) for dt, fn in links}


def execute():
	"""District was numbered (autoincrement: 9, 12 ...). It's now named by the
	user, like the other place masters: each existing district is renamed to
	its District Name (9 -> "Villupuram"), every link to it follows, and the
	DocType is switched to "Set by user" before its new JSON is synced (Frappe
	refuses that switch on a table with data)."""
	if not frappe.db.table_exists("District"):
		return
	if (frappe.db.get_value("DocType", "District", "autoname") or "") != "autoincrement":
		return

	rows = frappe.db.sql("select name, district, state from `tabDistrict` order by name", as_dict=True)
	taken, mapping = set(), {}
	for r in rows:
		base = (r.district or "").strip() or f"District {r.name}"
		new = base
		if new.lower() in taken and r.state:
			new = f"{base} - {r.state}"
		n = 2
		while new.lower() in taken:
			new = f"{base} {n}"
			n += 1
		taken.add(new.lower())
		mapping[str(r.name)] = new

	# name: bigint -> text, as for any named DocType
	frappe.db.sql_ddl(f"alter table `tabDistrict` modify `name` varchar({frappe.db.VARCHAR_LEN}) not null")

	links = _district_links()
	for old, new in mapping.items():
		frappe.db.sql("update `tabDistrict` set name=%s where name=%s", (new, old))
		for dt, fn in links:
			if frappe.db.table_exists(dt) and frappe.db.has_column(dt, fn):
				frappe.db.sql(f"update `tab{dt}` set `{fn}`=%s where `{fn}`=%s", (new, old))
		frappe.db.sql(
			"update `tabUser Permission` set for_value=%s where allow='District' and for_value=%s", (new, old)
		)

	frappe.db.set_value("DocType", "District", {"autoname": "prompt", "naming_rule": "Set by user"})
	try:
		frappe.db.sql_ddl("drop sequence if exists `district_id_seq`")
	except Exception:
		pass
	frappe.clear_cache(doctype="District")

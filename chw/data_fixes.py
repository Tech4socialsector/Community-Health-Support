import frappe

# Location links every CHW form copies down from Village -> Household ->
# Family member -> Pregnancy -> ANC / Birth / PNC ...
LOCATION_MASTERS = ("Gram Panchayat", "Sub Centre", "Village")


def clear_invalid_location_links(dry_run=0):
	"""One-off: Gram Panchayat / Sub Centre / Village fields that hold text
	which isn't a real master record - left from when these were plain text
	fields (e.g. Pregnancy Registration's Gram Panchayat = "Jharipani", a
	village name). Frappe refuses to save any record that copies such a
	value (ANC Follow-up, Birth Registration ...: "Could not find Gram
	Panchayat: Jharipani"), in Desk as well as the app.

	Each bad value is replaced with what the record's own Village says
	(Village.village_code / sub_center) when that's a real record, else
	cleared. Run with dry_run=1 first to see what would change:
	bench --site <site> execute chw.data_fixes.clear_invalid_location_links --kwargs "{'dry_run': 1}"
	"""
	modules = set(frappe.get_all("Module Def", filters={"app_name": "chw"}, pluck="name"))
	doctypes = frappe.get_all(
		"DocType", filters={"module": ["in", list(modules)], "istable": 0, "issingle": 0}, pluck="name"
	)
	village_masters = {
		v.name: v
		for v in frappe.get_all("Village", fields=["name", "village_code", "sub_center"])
	}
	exists = {dt: set(frappe.get_all(dt, pluck="name")) for dt in LOCATION_MASTERS}

	changed = 0
	for dt in doctypes:
		meta = frappe.get_meta(dt)
		fields = [
			df for df in meta.fields
			if df.fieldtype == "Link" and df.options in LOCATION_MASTERS and frappe.db.has_column(dt, df.fieldname)
		]
		if not fields:
			continue
		village_field = next((df.fieldname for df in fields if df.options == "Village"), None)
		for df in fields:
			rows = frappe.get_all(dt, filters={df.fieldname: ["is", "set"]}, fields=["name", df.fieldname] + ([village_field] if village_field and village_field != df.fieldname else []))
			for row in rows:
				value = row.get(df.fieldname)
				if value in exists[df.options]:
					continue
				replacement = None
				village = village_masters.get(row.get(village_field)) if village_field else None
				if village:
					candidate = village.village_code if df.options == "Gram Panchayat" else village.sub_center if df.options == "Sub Centre" else None
					if candidate in exists.get(df.options, ()):
						replacement = candidate
				print(f"{dt} {row.name}: {df.fieldname} {value!r} -> {replacement!r}")
				changed += 1
				if not int(dry_run):
					frappe.db.set_value(dt, row.name, df.fieldname, replacement, update_modified=False)

	if not int(dry_run):
		frappe.db.commit()
	print(f"{'Would change' if int(dry_run) else 'Changed'} {changed} value(s).")

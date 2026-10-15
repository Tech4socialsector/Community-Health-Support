"""Offline mode for the CHW Vue app: what a phone downloads to work without
a network, and where its Outbox lands when the network is back.

Download (get_offline_data): the forms the user has on their Home page,
every CHW form those link to (Family members, Village, Gram Panchayat ...)
and their child tables - the metadata to draw them, and the records the
user may read. Records come through frappe.get_list, so a CHW only gets
what Desk would show them: their own area once User Permissions limit them
to their villages. Repeat downloads only send what changed since the last
one, plus the list of names still there, so the phone can drop records
that were deleted or are no longer shared with the user.

Upload (push_insert / push_update): one Outbox entry each. Every entry
carries the phone's own id for that change, logged in CHW Offline Sync - a
retry after a dropped connection gets the record already made instead of a
second copy. An edit made offline is checked against the record as it was
when the phone last saw it: if someone else changed the same field online
in the meantime, nothing is overwritten - the server's version goes back
to the phone and the CHW chooses which to keep.
"""

import hashlib
import json
import re

import frappe
from frappe import _
from frappe.utils import cint, now

# Most recent first, per form - a phone has limited room, and a CHW works
# with their own recent families, not years of history.
RECORD_LIMIT = 5000

# Fields Frappe sets itself - never taken from a phone.
SYSTEM_FIELDS = {
	"owner",
	"creation",
	"modified",
	"modified_by",
	"docstatus",
	"idx",
	"parent",
	"parentfield",
	"parenttype",
	"_user_tags",
	"_comments",
	"_assign",
	"_liked_by",
	"_seen",
}


def _chw_modules():
	return set(frappe.get_all("Module Def", filters={"app_name": "chw"}, pluck="name"))


def _offline_doctypes():
	"""(record doctypes, all doctypes incl. child tables) the phone needs,
	starting from the user's Home page forms and following their Link and
	Table fields within the CHW app."""
	from chw.api import get_app_modules

	chw_modules = _chw_modules()
	module_of = dict(frappe.get_all("DocType", fields=["name", "module"], as_list=True))

	queue = [item["doctype_name"] for module in get_app_modules() for item in module["doctypes"]]
	seen, ordered = set(), []
	while queue:
		doctype = queue.pop(0)
		if doctype in seen or not frappe.db.exists("DocType", doctype):
			continue
		seen.add(doctype)
		ordered.append(doctype)
		for df in frappe.get_meta(doctype).fields:
			if df.fieldtype in ("Table", "Table MultiSelect") and df.options:
				queue.append(df.options)
			# Links to other apps (User, DocType ...) stay online-only: the
			# phone keeps the last answers it got for those instead.
			elif df.fieldtype == "Link" and df.options and module_of.get(df.options) in chw_modules:
				queue.append(df.options)

	records = []
	for doctype in ordered:
		meta = frappe.get_meta(doctype)
		if meta.istable or meta.issingle:
			continue
		if frappe.has_permission(doctype, "read"):
			records.append(doctype)
	return records, ordered


def _attach_children(doctype, rows):
	"""Child-table rows onto their parents, in grid order - get_list only
	returns the main record."""
	if not rows:
		return
	by_name = {r["name"]: r for r in rows}
	for df in frappe.get_meta(doctype).get_table_fields():
		for r in rows:
			r[df.fieldname] = []
		children = frappe.get_all(
			df.options,
			fields=["*"],
			filters={"parenttype": doctype, "parentfield": df.fieldname, "parent": ["in", list(by_name)]},
			order_by="idx asc",
		)
		for child in children:
			parent = by_name.get(child.parent)
			if parent is not None:
				parent[df.fieldname].append(child)


@frappe.whitelist()
def get_offline_data(since=None, metas_hash=None):
	"""{server_time, doctypes, metas, metas_hash, records: {doctype: [changed
	docs]}, names: {doctype: [every name the user can see]}} - see module
	docstring. The form definitions are most of the size (2 MB+) and rarely
	change, so they're only sent when they differ from the phone's copy
	(`metas_hash`)."""
	if frappe.session.user == "Guest":
		frappe.throw(_("Not permitted"), frappe.PermissionError)

	# Taken first: anything saved while this runs is picked up next time.
	server_time = now()
	record_doctypes, all_doctypes = _offline_doctypes()

	records, names = {}, {}
	for doctype in record_doctypes:
		names[doctype] = frappe.get_list(
			doctype, pluck="name", order_by="modified desc", limit_page_length=RECORD_LIMIT
		)
		filters = {"name": ["in", names[doctype]]} if names[doctype] else {"name": ["is", "not set"]}
		if since:
			# >= not >: a record saved in the same second as the last
			# download is fetched twice rather than missed.
			filters["modified"] = [">=", since]
		rows = frappe.get_list(doctype, fields=["*"], filters=filters, limit_page_length=RECORD_LIMIT)
		_attach_children(doctype, rows)
		records[doctype] = rows

	# Same shape as /api/v2/doctype/<doctype>/meta, which the forms read.
	metas = {doctype: frappe.get_meta(doctype) for doctype in all_doctypes}
	current_hash = hashlib.md5(frappe.as_json(metas).encode()).hexdigest()

	return {
		"server_time": server_time,
		"doctypes": record_doctypes,
		"metas": None if metas_hash == current_hash else metas,
		"metas_hash": current_hash,
		"records": records,
		"names": names,
	}


def _clean_doc(doc):
	"""A phone's record, without what only the server may set and without
	the phone's temporary names - a new child row has no name yet."""
	doc = {
		k: v
		for k, v in doc.items()
		if k not in SYSTEM_FIELDS and not (k.startswith("__") and k != "__newname")
	}
	if str(doc.get("name") or "").startswith(("new-", "OFFLINE-")):
		doc.pop("name", None)
	for key, value in list(doc.items()):
		if isinstance(value, list) and value and isinstance(value[0], dict):
			doc[key] = [_clean_row(row) for row in value]
	return doc


def _clean_row(row):
	row = {k: v for k, v in row.items() if k not in SYSTEM_FIELDS and not k.startswith("__")}
	if str(row.get("name") or "").startswith(("new-", "OFFLINE-")):
		row.pop("name", None)
	return row


def _already_synced(client_id):
	return frappe.db.get_value(
		"CHW Offline Sync", client_id, ["reference_doctype", "reference_name", "synced_by"], as_dict=True
	)


def _synced_doc(done):
	"""The record a retried sync already made - only to the user whose phone
	sent it, and only if they may still read it. Never the record the request
	names: a replayed id must not become a way to read other records."""
	if done.synced_by != frappe.session.user:
		frappe.throw(_("This change was synced by another user."), frappe.PermissionError)
	doc = frappe.get_doc(done.reference_doctype, done.reference_name)
	doc.check_permission("read")
	return doc


def _log(client_id, action, doctype, name):
	frappe.get_doc(
		{
			"doctype": "CHW Offline Sync",
			"client_id": client_id,
			"action": action,
			"reference_doctype": doctype,
			"reference_name": name,
			"synced_by": frappe.session.user,
		}
	).insert(ignore_permissions=True)


@frappe.whitelist(methods=["POST"])
def push_insert(client_id, doc):
	"""Create a record made offline. Same checks as a normal save (required
	fields, permissions, the form's own validation) - a refusal comes back
	as the usual error, and the phone keeps the entry for the CHW to fix."""
	if not client_id:
		frappe.throw(_("Missing client id"))
	done = _already_synced(client_id)
	if done:
		doc = _synced_doc(done)
		return {"name": doc.name, "doc": doc.as_dict()}

	doc = _clean_doc(frappe.parse_json(doc))
	if not doc.get("doctype"):
		frappe.throw(_("Missing doctype"))
	# An ID reserved for this phone (see reserve_ids) is kept, so the record
	# has the ID the CHW already saw offline. Anything else - a stale or
	# foreign ID - is ignored and the record is numbered as usual.
	wanted = doc.pop("name", None)
	reservation = _reservation(doc["doctype"], wanted)
	new = frappe.get_doc(doc)
	if reservation:
		new.insert(set_name=wanted)
		frappe.db.set_value("CHW Reserved ID", reservation, "status", "Used")
	else:
		new.insert()
	_log(client_id, "Insert", new.doctype, new.name)
	return {"name": new.name, "doc": new.as_dict()}


# ---- IDs reserved in advance --------------------------------------------
# A phone holds a small block of real IDs per form, taken from the form's own
# numbering series while online. A record made offline uses one at once, so
# the CHW sees HH-00041 instead of "New". Numbers a phone never uses are
# skipped in the series (a gap), which is the price of knowing them early.

# Reserved IDs are switched off: records saved offline show "New" and get
# their real ID when they sync, so the numbering has no gaps. Kept at 0
# (not deleted) so phones still holding IDs from before give them back at
# their next sync (reserve_ids -> release_ids).
RESERVE_BLOCK = 0


def _reserve_block():
	return RESERVE_BLOCK


_SERIES_ONLY_FORMAT = re.compile(r"^format:[^{}]*\{#+\}[^{}]*$")


def _reservable(doctype):
	"""The naming rule if IDs for `doctype` can be known before the record
	exists: a numbering series (HH-.#####) or a format with only a counter
	(PCID-{####}). Names made from a field's value, or by the database, can't."""
	autoname = (frappe.get_meta(doctype).autoname or "").strip()
	lower = autoname.lower()
	if ".#" in autoname and not lower.startswith(("field:", "format:", "naming_series:")):
		return autoname
	if lower.startswith("format:") and _SERIES_ONLY_FORMAT.match(autoname):
		return autoname
	return None


def _next_name(doctype, autoname):
	from frappe.model.naming import _format_autoname, make_autoname

	if autoname.lower().startswith("format:"):
		# Frappe strips the name the same way when it saves (validate_name).
		return _format_autoname(autoname, frappe._dict(doctype=doctype)).strip()
	return make_autoname(autoname, doctype)


def _reservation(doctype, name):
	if not name or str(name).startswith(("new-", "OFFLINE-")) or frappe.db.exists(doctype, name):
		return None
	return frappe.db.get_value(
		"CHW Reserved ID",
		{
			"reference_doctype": doctype,
			"reserved_name": name,
			"user": frappe.session.user,
			"status": "Reserved",
		},
	)


@frappe.whitelist(methods=["POST"])
def reserve_ids(have=None):
	"""Top up the phone's blocks of reserved IDs to the organization's number
	(App Setting). `have`: {doctype: how many the phone still holds}. Returns
	{"block": the number, "ids": {doctype: [new IDs]}} - only for forms the
	user may create. A phone holding more than `block` (the number was
	lowered) gives the extra back with release_ids."""
	if frappe.session.user == "Guest":
		frappe.throw(_("Not permitted"), frappe.PermissionError)
	have = frappe.parse_json(have) or {}
	block = _reserve_block()
	record_doctypes, _all = _offline_doctypes()
	out = {}
	for doctype in record_doctypes:
		autoname = _reservable(doctype)
		held = cint(have.get(doctype))
		# Filled back up to the organization's number at every sync, so the
		# CHW always leaves with that many - and a raised number applies at
		# the next sync.
		if not autoname or held >= block or not frappe.has_permission(doctype, "create"):
			continue
		names = []
		for _i in range(block - held):
			name = _next_name(doctype, autoname)
			# A record imported or named by hand can already hold the number
			# the series is on - skip past it rather than hand out a clash.
			while frappe.db.exists(doctype, name):
				name = _next_name(doctype, autoname)
			frappe.get_doc(
				{
					"doctype": "CHW Reserved ID",
					"reference_doctype": doctype,
					"reserved_name": name,
					"user": frappe.session.user,
				}
			).insert(ignore_permissions=True)
			names.append(name)
		out[doctype] = names
	return {"block": block, "ids": out}


@frappe.whitelist(methods=["POST"])
def release_ids(names=None):
	"""IDs a phone no longer keeps (the organization lowered its number, or
	turned reserved IDs off). Marked Released - only this user's own unused
	reservations; the numbers themselves stay skipped in the series."""
	names = frappe.parse_json(names) or {}
	for doctype, ids in names.items():
		if not ids:
			continue
		frappe.db.set_value(
			"CHW Reserved ID",
			{
				"reference_doctype": doctype,
				"reserved_name": ["in", list(ids)],
				"user": frappe.session.user,
				"status": "Reserved",
			},
			"status",
			"Released",
		)
	return True


def _plain(value):
	"""A value in a form that compares equal however it was stored: empty is
	empty, numbers as numbers, dates as text, child rows without bookkeeping."""
	if isinstance(value, list):
		return [
			{
				k: _plain(v)
				for k, v in (row.as_dict() if hasattr(row, "as_dict") else row).items()
				if k not in SYSTEM_FIELDS and k != "name" and not k.startswith("__") and k != "doctype"
			}
			for row in value
		]
	if value is None or value == "":
		return ""
	if isinstance(value, bool):
		return str(int(value))
	try:
		number = float(value)
		return str(int(number)) if number == int(number) else str(number)
	except (TypeError, ValueError):
		return str(value)


def _same(a, b):
	a, b = _plain(a), _plain(b)
	if isinstance(a, list) or isinstance(b, list):

		def norm(rows):
			return json.dumps([{k: v for k, v in r.items() if v != ""} for r in (rows or [])], sort_keys=True)

		return norm(a if isinstance(a, list) else []) == norm(b if isinstance(b, list) else [])
	return a == b


@frappe.whitelist(methods=["POST"])
def push_update(client_id, doctype, name, changes, base=None, base_modified=None, force=0):
	"""Save an offline edit. `changes` are only the fields the CHW changed,
	`base` what those fields held when the phone last saw the record. A
	field someone else also changed online is a conflict - unless they both
	set the same value - and comes back with the server's record instead of
	being overwritten. force=1 is the CHW choosing "Keep mine"."""
	if not client_id:
		frappe.throw(_("Missing client id"))
	done = _already_synced(client_id)
	if done:
		return {"status": "ok", "doc": _synced_doc(done).as_dict()}

	doc = frappe.get_doc(doctype, name)
	doc.check_permission("write")
	changes = frappe.parse_json(changes) or {}
	base = frappe.parse_json(base) or {}

	if not cint(force) and base_modified and str(doc.modified) != str(base_modified):
		conflicts = [
			field
			for field, mine in changes.items()
			if not _same(doc.get(field), base.get(field)) and not _same(doc.get(field), mine)
		]
		if conflicts:
			return {"status": "conflict", "fields": conflicts, "doc": doc.as_dict()}

	cleaned = _clean_doc({**changes, "doctype": doctype})
	cleaned.pop("doctype", None)
	cleaned.pop("name", None)
	doc.update(cleaned)
	doc.save()
	_log(client_id, "Update", doctype, name)
	return {"status": "ok", "doc": doc.as_dict()}

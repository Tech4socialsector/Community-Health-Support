"""Place masters: State List -> District -> Taluk Block -> Gram Panchayat ->
Village; District, Block and Panchayat have a short code (the Outreach Clinic ID is built from them).

Used by the masters' own validate (fill an empty code, keep codes unique
under their parent) and by the forms that pick places (Outreach Clinic):
pincode lookup and "pick the lowest level, fill the ones above"."""

import re

import frappe
from frappe import _

# doctype -> (code field, parent field or None, label used in messages, digits)
# The Outreach Clinic ID is District (2) + Block (2) + Panchayat (3) digits,
# e.g. 37 + 07 + 411 = 3707411.
LEVELS = {
	"District": ("district_code", "state", "District", 2),
	"Taluk Block": ("block_code", "district", "Taluk / Block", 2),
	"Gram Panchayat": ("panchayat_code", "taluk_block", "Gram Panchayat", 3),
}


def next_code(doctype, parent=None):
	"""The next free number under `parent`, with the level's digits
	(District 01, 02 ...; Panchayat 001, 002 ...)."""
	code_field, parent_field, _label, digits = LEVELS[doctype]
	filters = {parent_field: parent} if parent_field else {}
	used = frappe.get_all(doctype, filters=filters, pluck=code_field)
	numbers = [int(c) for c in used if c and str(c).strip().isdigit()]
	return str((max(numbers) if numbers else 0) + 1).zfill(digits)


def fill_and_check_code(doc):
	"""validate of the place masters: a code is digits only with the level's
	length (shorter ones get leading zeros), unique under its parent, and
	filled with the next free number when left empty."""
	code_field, parent_field, label, digits = LEVELS[doc.doctype]
	parent = doc.get(parent_field) if parent_field else None
	code = (doc.get(code_field) or "").strip()
	if not code:
		if parent_field and not parent:
			return  # an old record with no parent yet - nothing to number under
		code = next_code(doc.doctype, parent)
	if not code.isdigit() or len(code) > digits:
		frappe.throw(
			_("{0} Code must be a number of {1} digits, e.g. {2}.").format(_(label), digits, "1".zfill(digits))
		)
	code = code.zfill(digits)  # 7 -> 07, 41 -> 041
	doc.set(code_field, code)

	filters = {code_field: code, "name": ["!=", doc.name or ""]}
	if parent_field:
		filters[parent_field] = parent
	clash = frappe.db.get_value(doc.doctype, filters, "name")
	if clash:
		frappe.throw(
			_("{0} Code {1} is already used by {2}. Use another code, or leave it empty for the next free one.").format(
				_(label), code, frappe.bold(title_of(doc.doctype, clash))
			)
		)


def title_of(doctype, name):
	if doctype == "District":
		return frappe.db.get_value("District", name, "district") or name
	return name


@frappe.whitelist()
def from_pincode(pincode):
	"""Places a pincode is known for (from Gram Panchayat.pincode).

	Returns {state, district, taluk_block, gram_panchayat?, panchayats}:
	State/District/Block when every panchayat with that pincode agrees, the
	panchayat itself only when there's exactly one."""
	pincode = re.sub(r"\D", "", pincode or "")
	if len(pincode) != 6:
		return {}
	rows = frappe.get_list(
		"Gram Panchayat",
		filters={"pincode": pincode},
		fields=["name", "taluk_block", "district", "state"],
		limit_page_length=50,
	)
	if not rows:
		return {}
	out = {"panchayats": [r.name for r in rows]}
	for key in ("state", "district", "taluk_block"):
		values = {r.get(key) for r in rows}
		if len(values) == 1 and None not in values:
			out[key] = values.pop()
	if len(rows) == 1:
		out["gram_panchayat"] = rows[0].name
	return out


@frappe.whitelist()
def parents_of(doctype, name):
	"""Pick the lowest level, fill the ones above: the State / District /
	Block / Panchayat a District, Taluk Block, Gram Panchayat or Village
	sits under."""
	if not name:
		return {}
	if doctype == "Village":
		gp = frappe.db.get_value("Village", name, "village_code")
		return {"gram_panchayat": gp, **(parents_of("Gram Panchayat", gp) if gp else {})}
	if doctype == "Gram Panchayat":
		row = frappe.db.get_value("Gram Panchayat", name, ["taluk_block", "district", "state", "pincode"], as_dict=True) or {}
		block = row.get("taluk_block")
		district = row.get("district") or (block and frappe.db.get_value("Taluk Block", block, "district"))
		state = row.get("state") or (district and frappe.db.get_value("District", district, "state"))
		return {"taluk_block": block, "district": district, "state": state, "pincode": row.get("pincode")}
	if doctype == "Taluk Block":
		district = frappe.db.get_value("Taluk Block", name, "district")
		return {"district": district, "state": district and frappe.db.get_value("District", district, "state")}
	if doctype == "District":
		return {"state": frappe.db.get_value("District", name, "state")}
	return {}


def check_chain(doc, state="state", district="district", block="taluk_block", panchayat="gram_panchayat"):
	"""A form's State / District / Block / Panchayat must sit inside each
	other - refused on save even if they came from Desk, the API or a phone."""
	s, d, b, p = (doc.get(state), doc.get(district), doc.get(block), doc.get(panchayat))
	d = str(d) if d else d  # District is numbered (autoincrement)
	if d and s and frappe.db.get_value("District", d, "state") != s:
		frappe.throw(_("District {0} isn't in {1}.").format(frappe.bold(title_of("District", d)), frappe.bold(s)))
	if b and d and str(frappe.db.get_value("Taluk Block", b, "district") or "") != d:
		frappe.throw(_("Block {0} isn't in district {1}.").format(frappe.bold(b), frappe.bold(title_of("District", d))))
	if p and b:
		gp_block = frappe.db.get_value("Gram Panchayat", p, "taluk_block")
		if gp_block and gp_block != b:
			frappe.throw(_("Panchayat {0} isn't in block {1}.").format(frappe.bold(p), frappe.bold(b)))


def check_household_places(doc, method=None):
	"""Household profile / Family members validate: District / Block / Panchayat / Village
	inside each other, and the levels above a picked place filled in (for a
	record from the API or a phone that only set the village or panchayat)."""
	if doc.get("village") and not doc.get("gram_panchayat"):
		doc.gram_panchayat = frappe.db.get_value("Village", doc.village, "village_code")
	if doc.get("gram_panchayat"):
		above = parents_of("Gram Panchayat", doc.gram_panchayat)
		for f in ("taluk_block", "district"):
			if not doc.get(f) and above.get(f) and doc.meta.has_field(f):
				doc.set(f, str(above[f]))
	check_chain(doc, state="__no_state__")
	if doc.get("village") and doc.get("gram_panchayat"):
		gp = frappe.db.get_value("Village", doc.village, "village_code")
		if gp and gp != doc.gram_panchayat:
			frappe.throw(
				_("Village {0} isn't in panchayat {1}.").format(frappe.bold(doc.village), frappe.bold(doc.gram_panchayat))
			)

"""Cancer outreach: which clinics a worker can pick on a Household, which
villages a clinic covers, and the details a Household fills from it.

Only used while Cancer is on and its "Outreach Clinic" form is ticked (see
OUTREACH in chw.programmes)."""

import json

import frappe
from frappe import _

def _my_clinic_names(txt=""):
	"""Active clinics the user can read (User Permissions, when set, narrow
	it to theirs)."""
	filters = {"active": 1}
	or_filters = None
	if txt:
		like = f"%{txt}%"
		or_filters = {"name": ["like", like], "outreach_clinic_name": ["like", like], "gram_panchayat": ["like", like]}
	return frappe.get_list(
		"Outreach Clinic",
		filters=filters,
		or_filters=or_filters,
		fields=["name", "outreach_clinic_name", "gram_panchayat"],
		order_by="start_date desc",
		limit_page_length=50,
	)


@frappe.whitelist()
@frappe.validate_and_sanitize_search_inputs
def clinic_query(doctype, txt, searchfield, start, page_len, filters):
	"""Link query for Household profile.outreach_clinic."""
	rows = _my_clinic_names(txt)
	return [(r.name, r.outreach_clinic_name, r.gram_panchayat) for r in rows[int(start) : int(start) + int(page_len)]]


@frappe.whitelist()
def my_clinics():
	"""For filling the clinic on a new Household when the worker has only one."""
	return [r.name for r in _my_clinic_names()]


def _clinic_villages(clinic):
	villages = frappe.get_all(
		"Outreach Clinic Village", filters={"parent": clinic, "parenttype": "Outreach Clinic"}, pluck="village"
	)
	if villages:
		return villages
	gp = frappe.db.get_value("Outreach Clinic", clinic, "gram_panchayat")
	return frappe.get_all("Village", filters={"village_code": gp}, pluck="name") if gp else []


@frappe.whitelist()
@frappe.validate_and_sanitize_search_inputs
def village_query(doctype, txt, searchfield, start, page_len, filters):
	"""Link query for Household profile.village once a clinic is chosen: only
	the villages that clinic covers."""
	if isinstance(filters, str):
		filters = json.loads(filters or "{}")
	clinic = (filters or {}).get("outreach_clinic")
	names = _clinic_villages(clinic) if clinic else []
	txt = (txt or "").lower()
	names = [n for n in names if txt in n.lower()]
	return [(n,) for n in names[int(start) : int(start) + int(page_len)]]


@frappe.whitelist()
def clinic_details(clinic):
	"""What a Household fills from its clinic."""
	if not clinic or not frappe.has_permission("Outreach Clinic", "read", clinic):
		return {}
	doc = frappe.db.get_value(
		"Outreach Clinic", clinic, ["district", "taluk_block", "gram_panchayat", "pincode", "state", "active"], as_dict=True
	)
	if not doc:
		return {}
	villages = _clinic_villages(clinic)
	return {
		"active": doc.active,
		"district": str(doc.district) if doc.district else None,
		"taluk_block": doc.taluk_block,
		"gram_panchayat": doc.gram_panchayat,
		"pincode": doc.pincode,
		"state": doc.state,
		"villages": villages,
		"village": villages[0] if len(villages) == 1 else None,
	}


def check_household_clinic(doc, method=None):
	"""Household profile validate: a new household goes only into an Active
	clinic, and its village must be one the clinic covers."""
	clinic = doc.get("outreach_clinic")
	if not clinic:
		return
	if doc.is_new() and not frappe.db.get_value("Outreach Clinic", clinic, "active"):
		frappe.throw(
			_("Outreach Clinic {0} isn't active. New households can be added only to an active clinic.").format(
				frappe.bold(clinic)
			)
		)
	place = frappe.db.get_value("Outreach Clinic", clinic, ["district", "taluk_block", "gram_panchayat"], as_dict=True) or {}
	# The clinic decides the place: fill what's empty from it.
	for f in ("district", "taluk_block", "gram_panchayat"):
		if not doc.get(f) and place.get(f) and doc.meta.has_field(f):
			doc.set(f, str(place[f]))
	gp = place.get("gram_panchayat")
	if doc.get("gram_panchayat") and gp and doc.gram_panchayat != gp:
		frappe.throw(
			_("Outreach Clinic {0} is for panchayat {1}, not {2}.").format(
				frappe.bold(clinic), frappe.bold(gp), frappe.bold(doc.gram_panchayat)
			)
		)
	if doc.get("village"):
		villages = _clinic_villages(clinic)
		if villages and doc.village not in villages:
			frappe.throw(
				_("Village {0} isn't covered by Outreach Clinic {1}.").format(frappe.bold(doc.village), frappe.bold(clinic))
			)

# Copyright (c) 2026, tech4socialsector@azimpremjifoundation.org and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import getdate

from chw.places import check_chain


def _codes(district, taluk_block, gram_panchayat):
	"""(ID so far, the first level without a code or None, complete?)."""
	out = ""
	for doctype, name, field in (
		("District", district, "district_code"),
		("Taluk Block", taluk_block, "block_code"),
		("Gram Panchayat", gram_panchayat, "panchayat_code"),
	):
		if not name:
			return out, None, False
		code = frappe.db.get_value(doctype, name, field)
		if not code:
			return out, doctype, False
		out += code
	return out, None, True


@frappe.whitelist()
def preview_id(district=None, taluk_block=None, gram_panchayat=None):
	"""The ID shown while the places are picked, before Save. It builds up
	level by level: District code (37), + Block code (3707), + Panchayat
	code (3707411). `exists` names a clinic that already has this ID."""
	cid, missing, complete = _codes(district, taluk_block, gram_panchayat)
	exists = frappe.db.exists("Outreach Clinic", cid) if complete else None
	return {"id": cid, "complete": complete, "missing": _(missing) if missing else None, "exists": exists or None}


class OutreachClinic(Document):
	def autoname(self):
		"""Outreach Clinic ID = District code (2 digits) + Block code (2) +
		Panchayat code (3), e.g. 37 + 07 + 411 = 3707411 - one clinic per
		panchayat."""
		cid, missing, complete = _codes(self.district, self.taluk_block, self.gram_panchayat)
		if missing:
			frappe.throw(
				_("Give a code to the {0} first (open it and save - an empty code gets the next free number).").format(
					_(missing)
				),
				title=_("Code missing"),
			)
		if frappe.db.exists("Outreach Clinic", cid):
			frappe.throw(
				_("Outreach Clinic {0} already exists for panchayat {1}. Open it instead (set it Active again if it was closed).").format(
					frappe.bold(cid), frappe.bold(self.gram_panchayat)
				),
				title=_("Clinic already exists"),
			)
		self.name = cid
		self.outreach_clinic_id = cid

	def validate(self):
		if self.name and not self.is_new():
			self.outreach_clinic_id = self.name
		check_chain(self)
		if self.pincode:
			self.pincode = "".join(ch for ch in str(self.pincode) if ch.isdigit())
			if len(self.pincode) != 6:
				frappe.throw(_("Pincode must have 6 digits."))
		if self.end_date and self.start_date and getdate(self.end_date) < getdate(self.start_date):
			frappe.throw(_("Outreach Clinic End Date can't be before the Start Date."))
		self.check_villages()

	def check_villages(self):
		for row in self.villages or []:
			gp = frappe.db.get_value("Village", row.village, "village_code")
			if gp and gp != self.gram_panchayat:
				frappe.throw(
					_("Village {0} is in panchayat {1}, not {2}.").format(
						frappe.bold(row.village), frappe.bold(gp), frappe.bold(self.gram_panchayat)
					)
				)

	def on_trash(self):
		for name in frappe.get_all(
			"User Permission", filters={"allow": "Outreach Clinic", "for_value": self.name}, pluck="name"
		):
			frappe.delete_doc("User Permission", name, ignore_permissions=True)

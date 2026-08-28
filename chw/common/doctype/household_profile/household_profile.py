# Copyright (c) 2026, tech4socialsector@azimpremjifoundation.org and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document
from chw.api import validate_phone_number


class Householdprofile(Document):
	def validate(self):
		validate_phone_number(self.phone_no)
		self.update_member_counts()

	def update_member_counts(self):
		self.members_added = frappe.db.count("Family members", {"hhid": self.name}) if self.name else 0
		self.pending_members = max((self.total_family_members or 0) - self.members_added, 0)


def refresh_member_counts(hhid):
	if not hhid or not frappe.db.exists("Household profile", hhid):
		return

	members_added = frappe.db.count("Family members", {"hhid": hhid})
	total_family_members = frappe.db.get_value("Household profile", hhid, "total_family_members") or 0
	pending_members = max(total_family_members - members_added, 0)

	frappe.db.set_value(
		"Household profile",
		hhid,
		{"members_added": members_added, "pending_members": pending_members},
		update_modified=False,
	)

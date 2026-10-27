import frappe

from chw.common.doctype.household_profile.household_profile import refresh_member_counts


def execute():
	"""Household profile gained its Members Added / Pending Members columns
	only now, though the code has been writing to them since the chw-lch
	merge (every Family members save failed with "Unknown column
	'members_added'"). Fill both in for the households that already exist."""
	frappe.reload_doc("common", "doctype", "household_profile")
	for hhid in frappe.get_all("Household profile", pluck="name"):
		refresh_member_counts(hhid)

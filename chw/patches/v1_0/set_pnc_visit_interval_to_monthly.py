import frappe


def execute():
	"""PNC follow-up visits changed from weekly (6 weeks) to monthly (6 months) -
	update the stored PNC Visit Interval Master value to match, since a Single
	doctype's value doesn't pick up a new JSON default once it already has one."""
	frappe.reload_doc("chw_master", "doctype", "pnc_visit_interval_master")
	frappe.db.set_single_value("PNC Visit Interval Master", "interval_days", 30)

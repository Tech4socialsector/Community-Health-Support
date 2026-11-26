import frappe

from chw.programmes import CACHE_KEY, apply_common_sections


def execute():
	"""Cancer's new "Outreach Clinic" form has a tick box in App Setting
	(use_outreach_clinic), ticked by default. Store it on existing sites -
	a never-stored Check reads as 0 in App Setting - then apply what the
	tick decides: the Outreach Clinic ID on Household profile and the
	Cancer forms, shown and required only while Cancer is on."""
	frappe.reload_doc("chw_master", "doctype", "app_setting")
	if not frappe.db.exists("Singles", {"doctype": "App Setting", "field": "use_outreach_clinic"}):
		frappe.db.set_single_value("App Setting", "use_outreach_clinic", 1)
	frappe.cache.delete_value(CACHE_KEY)
	frappe.clear_document_cache("App Setting", "App Setting")
	apply_common_sections()

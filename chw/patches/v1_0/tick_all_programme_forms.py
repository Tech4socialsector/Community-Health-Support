import frappe

from chw.programmes import CACHE_KEY, PROGRAMMES, form_field, has_form_ticks


def execute():
	"""App Setting has a tick box per programme form now (use_<form>), all
	ticked by default. Store that tick on existing sites too, so the forms
	read as on everywhere (Desk, the CHW app, the phones' offline copy), and
	drop the short-lived "App Setting Programme Form" picker table they
	replace."""
	frappe.reload_doc("chw_master", "doctype", "app_setting")
	for p in PROGRAMMES.values():
		if not has_form_ticks(p):
			continue
		for doctype in p["doctypes"]:
			field = form_field(doctype)
			# get_single_value would read a never-stored Check as 0.
			if not frappe.db.exists("Singles", {"doctype": "App Setting", "field": field}):
				frappe.db.set_single_value("App Setting", field, 1)
	if frappe.db.exists("DocType", "App Setting Programme Form"):
		frappe.delete_doc("DocType", "App Setting Programme Form", ignore_missing=True, force=True)
	frappe.cache.delete_value(CACHE_KEY)
	frappe.clear_document_cache("App Setting", "App Setting")

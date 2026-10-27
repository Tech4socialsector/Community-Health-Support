import frappe

from chw.programmes import CACHE_KEY, sync_programme_modules


def execute():
	"""App Setting -> Programmes is new, and every programme starts switched
	off. On a site that was already running before it, switch on the two
	programmes whose forms were already in the CHW app's sidebar (MCH and
	Palliative), so nothing disappears after this update. Mental Health,
	NCD and Cancer were never in the sidebar and stay off until someone
	ticks them. A fresh install doesn't run this patch, so it starts with
	everything off."""
	frappe.reload_doc("chw_master", "doctype", "app_setting")
	for field in ("enable_mch", "enable_palliative"):
		frappe.db.set_single_value("App Setting", field, 1)
	frappe.cache.delete_value(CACHE_KEY)
	frappe.clear_document_cache("App Setting", "App Setting")
	sync_programme_modules()

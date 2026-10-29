import frappe


@frappe.whitelist()
def get_print_format_html(doctype, docname, print_format):
	"""Shared by every CHW doctype's "Print" button, in both Desk (see
	public/js/print_preview.bundle.js) and the Vue app (PrintPreviewDialog.vue)
	- renders the named Print Format's HTML against the given document, the
	same way Desk's own print view does it, but through a plain dialog
	instead of a full-page navigation."""
	doc = frappe.get_doc(doctype, docname)
	doc.check_permission("read")
	pf = frappe.get_doc("Print Format", print_format)
	return frappe.render_template(pf.html, {"doc": doc.as_dict()})

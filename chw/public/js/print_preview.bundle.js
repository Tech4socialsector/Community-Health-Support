frappe.provide("chw.print_preview");

// Shared by every CHW doctype's Desk "Print" button - same mechanism as
// metta's own print_preview.bundle.js (dialog + print-only popup window),
// kept as a separate copy per app since chw and metta don't declare a
// dependency on each other.
chw.print_preview.show = function (frm, print_format, opts) {
	opts = opts || {};
	frappe.call({
		method: "chw.print_utils.get_print_format_html",
		args: {
			doctype: frm.doc.doctype,
			docname: frm.doc.name,
			print_format: print_format,
		},
		callback(r) {
			if (!r.message) {
				return;
			}
			const html = r.message;
			const dialog = new frappe.ui.Dialog({
				title: opts.title || __("Print Preview"),
				size: opts.size || "large",
				fields: [
					{
						fieldtype: "HTML",
						fieldname: "preview",
						options: html,
					},
				],
				primary_action_label: __("Print"),
				primary_action() {
					const print_window = window.open("", "_blank");
					print_window.document.write(
						`<html><head><title>${frappe.utils.escape_html(frm.doc.name)}</title></head><body>${html}</body></html>`
					);
					print_window.document.close();
					print_window.focus();
					print_window.print();
				},
			});
			dialog.show();
		},
	});
};

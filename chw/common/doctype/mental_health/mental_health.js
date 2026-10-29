// Copyright (c) 2026, tech4socialsector@azimpremjifoundation.org and contributors
// For license information, please see license.txt

frappe.ui.form.on("Mental Health", {
	refresh(frm) {
		if (!frm.is_new()) {
			frm.add_custom_button(__("Print"), () => chw.print_preview.show(frm, "Mental Health Print"));
		}
	},
});

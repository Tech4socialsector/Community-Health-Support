// Copyright (c) 2026, tech4socialsector@azimpremjifoundation.org and contributors
// For license information, please see license.txt

frappe.ui.form.on("Gram Panchayat", {
	setup(frm) {
		// Only the blocks of the district already chosen, when there is one.
		frm.set_query("taluk_block", () => (frm.doc.district ? { filters: { district: frm.doc.district } } : {}));
	},
});

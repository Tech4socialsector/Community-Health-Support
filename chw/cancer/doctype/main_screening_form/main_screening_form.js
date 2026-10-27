// Copyright (c) 2026, TFSS and contributors
// For license information, please see license.txt

frappe.ui.form.on("Main Screening Form", {
	refresh(frm) {
		// Oral Screening Questionnaire: once saved as "No", the oral screening
		// can't be reopened (main_screening_form.py enforces the same on save).
		const closed = !frm.is_new() && frm.doc.oral_examination === "No";
		frm.set_df_property("oral_examination", "read_only", closed ? 1 : 0);
	},
});

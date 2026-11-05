// Copyright (c) 2026, TFSS and contributors
// For license information, please see license.txt

frappe.ui.form.on("Main Screening Form", {
	refresh(frm) {
		// Oral Screening Questionnaire: once saved as "No", the oral screening
		// can't be reopened (main_screening_form.py enforces the same on save).
		const closed = !frm.is_new() && frm.doc.oral_examination === "No";
		frm.set_df_property("oral_examination", "read_only", closed ? 1 : 0);

		toggle_clinical_evaluation_link(frm);
	},
});

// Clinical Evaluation connection only once referred - at least one screening
// finished with Referral = Yes - or when one already exists (set in
// main_screening_form.py onload). A group or the whole Connections box left
// with nothing in it is hidden too.
function toggle_clinical_evaluation_link(frm) {
	const dashboard = frm.dashboard;
	if (!dashboard || !dashboard.transactions_area) return;
	const allowed = !!(frm.doc.__onload && frm.doc.__onload.clinical_evaluation_allowed);
	const area = dashboard.transactions_area;
	area.find('.document-link[data-doctype="Clinical Evaluation"]').toggle(allowed);
	area.find(".form-documents .col-md-4").each((i, col) => {
		$(col).toggle($(col).find(".document-link").filter((j, el) => el.style.display !== "none").length > 0);
	});
	const any_link = area.find(".document-link").filter((i, el) => el.style.display !== "none").length > 0;
	// (Desk shows the box again on its next refresh.)
	if (!any_link) dashboard.links_area.hide();
}

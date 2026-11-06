// Copyright (c) 2026, TFSS and contributors
// For license information, please see license.txt

frappe.ui.form.on("Main Screening Form", {
	onload(frm) {
		// New screening: Completed By and the consent witness are the person
		// logged in. The witness can be changed; the server fills both if empty.
		if (!frm.is_new()) return;
		const name = frappe.session.user_fullname || frappe.session.user;
		if (!frm.doc.completed_by) frm.set_value("completed_by", name);
		if (!frm.doc.consent_witness) frm.set_value("consent_witness", name);
	},
	refresh(frm) {
		// Oral Screening Questionnaire: once saved as "No", the oral screening
		// can't be reopened (main_screening_form.py enforces the same on save).
		const closed = !frm.is_new() && frm.doc.oral_examination === "No";
		frm.set_df_property("oral_examination", "read_only", closed ? 1 : 0);

		toggle_clinical_evaluation_link(frm);
		highlight_finish(frm);
	},
});

// Finish sits at the end of each screening's Referral part - boxed in amber
// so it's easy to spot.
function highlight_finish(frm) {
	["oral", "breast", "cervical"].forEach((site) => {
		const field = frm.fields_dict[`${site}_finished`];
		if (!field) return;
		field.$wrapper.css({
			background: "var(--amber-50, #fffbeb)",
			border: "1px solid var(--amber-300, #fcd34d)",
			"border-radius": "8px",
			display: "inline-block",
			width: "auto",
			padding: "8px 12px",
			"margin-top": "8px",
			"font-weight": "600",
		});
	});
}

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

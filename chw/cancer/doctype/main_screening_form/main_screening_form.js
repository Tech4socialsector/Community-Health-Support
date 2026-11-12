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
	oral_finished: (frm) => stamp_finish(frm, "oral"),
	breast_finished: (frm) => stamp_finish(frm, "breast"),
	cervical_finished: (frm) => stamp_finish(frm, "cervical"),
});

// Each screening's status, worked out as the answers change - the same rule
// as the server's set_*_screening_status (main_screening_form.py), which
// sets it again on save. Same function in the Vue app's mainScreeningForm.js.
function screening_status(d, site, not_screened, pending, referred) {
	const applies = d.consent_given === "Yes" && (site === "oral" || d.gender !== "Male");
	if (!applies) return d.consent_given === "Yes" ? "Not Applicable" : "Pending";
	const finished = !!cint(d[`${site}_finished`]);
	if (not_screened) return finished ? not_screened : "In Progress";
	if (pending) return "Pending";
	if (!finished) return "In Progress";
	return referred ? "Moved to Clinical Evaluation" : "Completed";
}

function set_screening_statuses(frm) {
	const d = frm.doc;
	const cervical_pending =
		!["Done", "Not Done"].includes(d.cervical_screening) ||
		(d.cervical_screening === "Done" &&
			[d.cervical_visual_inspection, d.hr_hpv_dna, d.cytology, d.visual_test].includes("Not now"));
	const statuses = {
		oral_screening_status: screening_status(
			d,
			"oral",
			d.oral_examination === "No" ? "Not Screened" : null,
			!["Yes", "No"].includes(d.oral_examination),
			d.refferal === "Yes"
		),
		breast_screening_status: screening_status(d, "breast", null, !["Yes", "No"].includes(d.breast_symptoms), d.breast_referral === "Yes"),
		cervical_screening_status: screening_status(
			d,
			"cervical",
			d.cervical_screening === "Not Done" ? "Not Done" : null,
			cervical_pending,
			d.cervical_referral === "Yes"
		),
	};
	Object.entries(statuses).forEach(([field, status]) => {
		if (d[field] !== status) frm.set_value(field, status);
	});
}

// Re-work the statuses whenever an answer that decides them changes.
const status_triggers = {};
[
	"consent_given", "gender", "oral_examination", "refferal", "breast_symptoms", "breast_referral",
	"cervical_screening", "cervical_visual_inspection", "hr_hpv_dna", "cytology", "visual_test", "cervical_referral",
	"oral_finished", "breast_finished", "cervical_finished",
].forEach((f) => (status_triggers[f] = set_screening_statuses));
frappe.ui.form.on("Main Screening Form", status_triggers);

// Finish ticked: Finished on / by show at once (now, the person logged in);
// unticked: cleared. The server stamps the same on save.
function stamp_finish(frm, site) {
	const ticked = !!frm.doc[`${site}_finished`];
	frm.set_value(`${site}_finished_on`, ticked ? frappe.datetime.now_datetime() : null);
	frm.set_value(`${site}_finished_by`, ticked ? frappe.session.user : null);
}

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

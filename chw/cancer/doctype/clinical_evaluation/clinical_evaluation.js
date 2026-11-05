// Copyright (c) 2026, TFSS and contributors
// For license information, please see license.txt

const SITES = ["oral", "breast", "cervical"];

frappe.ui.form.on("Clinical Evaluation", {
	setup(frm) {
		// Only referred people: at least one screening finished with
		// Referral = Yes (clinical_evaluation.py checks the same on save).
		frm.set_query("main_screening_form", () => ({
			query: "chw.cancer.queries.referred_screenings",
		}));
	},
	onload(frm) {
		// No "Create a new Main Screening Form" - a new one isn't referred yet.
		frm.set_df_property("main_screening_form", "only_select", 1);
	},
	refresh(frm) {
		// The screening may have been referred / finished since this was saved.
		set_referred_sites(frm);
	},
	main_screening_form(frm) {
		set_referred_sites(frm);
	},
});

// Only the tabs of screenings finished with Referral = Yes are shown
// (depends_on the hidden <site>_referred ticks). A tab that isn't has its
// first question set to No, as the server does on save; one that becomes
// shown starts unanswered again.
function set_referred_sites(frm) {
	if (frm.doc.docstatus !== 0) return;
	const screening = frm.doc.main_screening_form;
	const apply = (sites) => {
		if (frm.doc.main_screening_form !== screening) return;
		SITES.forEach((site) => {
			const was = cint(frm.doc[`${site}_referred`]);
			const referred = sites[site] ? 1 : 0;
			if (was !== referred) frm.set_value(`${site}_referred`, referred);
			if (!screening) return;
			const question = `${site}_clinical_evaluation`;
			if (!referred && frm.doc[question] !== "No") frm.set_value(question, "No");
			else if (referred && !was && frm.doc[question] === "No") frm.set_value(question, "");
		});
	};
	if (!screening) {
		apply({});
		return;
	}
	frappe
		.call({
			method: "chw.cancer.doctype.clinical_evaluation.clinical_evaluation.get_referred_sites",
			args: { main_screening_form: screening },
		})
		.then((r) => apply(r.message || {}));
}

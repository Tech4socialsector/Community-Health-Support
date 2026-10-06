// Copyright (c) 2026, tech4socialsector@azimpremjifoundation.org and contributors
// For license information, please see license.txt

frappe.ui.form.on("Preconception Reg and Followup", {
	followup_visits_add(frm, cdt, cdn) {
		// The CHW is filling this in because the visit is happening right
		// now, not scheduling one for later - default it to today so she
		// doesn't have to type it by hand every time, still fully editable
		// if she's logging a visit after the fact.
		const row = locals[cdt][cdn];
		if (!row.date_of_visit) {
			frappe.model.set_value(cdt, cdn, "date_of_visit", frappe.datetime.get_today());
		}
	},
});

// Height (cm) and Weight (kg), live as the CHW types either one into a
// followup row - the server's own validate() recalculates the same way as a
// backstop (Data Import/API rows), so this is purely for instant feedback
// before save.
function calculate_preconception_followup_bmi(frm, cdt, cdn) {
	const row = locals[cdt][cdn];
	let bmi = "";
	if (row.height && row.weight) {
		const height_m = flt(row.height) / 100;
		if (height_m) {
			bmi = (flt(row.weight) / (height_m * height_m)).toFixed(1);
		}
	}
	frappe.model.set_value(cdt, cdn, "bmi", bmi);
}

frappe.ui.form.on("Preconception Followup", {
	height(frm, cdt, cdn) {
		calculate_preconception_followup_bmi(frm, cdt, cdn);
	},
	weight(frm, cdt, cdn) {
		calculate_preconception_followup_bmi(frm, cdt, cdn);
	},
});

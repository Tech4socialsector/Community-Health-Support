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

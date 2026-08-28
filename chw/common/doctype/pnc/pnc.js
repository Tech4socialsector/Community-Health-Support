// Copyright (c) 2026, tech4socialsector@azimpremjifoundation.org and contributors
// For license information, please see license.txt

frappe.ui.form.on("PNC", {
	onload(frm) {
		if (frm.is_new() && !frm.doc.health_worker_name) {
			frappe.call({
				method: "chw.api.get_current_health_worker",
			}).then((r) => {
				if (r.message) {
					frm.set_value("health_worker_name", r.message);
				}
			});
		}
	},
	phone_number(frm) {
		if (frm.doc.phone_number && !/^\d*$/.test(frm.doc.phone_number)) {
			frappe.msgprint({
				title: __("Invalid Phone Number"),
				message: __("Letters are not allowed. Please enter numbers only."),
				indicator: "red",
			});
		}
	},
});

frappe.ui.form.on("PNC Followup Child", {
	date(frm) {
		calculate_next_pnc_visit_date(frm);
	},
});

frappe.ui.form.on("PNC", {
	mother_remove(frm) {
		calculate_next_pnc_visit_date(frm);
	},
});

function calculate_next_pnc_visit_date(frm) {
	const current = frm.doc.next_pnc_visit_date;
	const last_auto = frm.doc.next_pnc_visit_date_auto;
	if (current && current !== last_auto) {
		// user has manually overridden the date; leave it alone
		return;
	}

	const dated_rows = (frm.doc.mother || []).filter((row) => row.date);
	if (!dated_rows.length) {
		return;
	}

	const last_date = dated_rows.reduce((latest, row) => (row.date > latest ? row.date : latest), dated_rows[0].date);

	frappe.db.get_single_value("PNC Visit Interval Master", "interval_days").then((interval_days) => {
		const calculated_date = frappe.datetime.add_days(last_date, interval_days || 30);
		frm.set_value("next_pnc_visit_date", calculated_date);
		frm.set_value("next_pnc_visit_date_auto", calculated_date);
	});
}

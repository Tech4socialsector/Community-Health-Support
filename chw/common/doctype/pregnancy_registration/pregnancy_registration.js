// Copyright (c) 2026, tech4socialsector@azimpremjifoundation.org and contributors
// For license information, please see license.txt

frappe.ui.form.on("Pregnancy Registration", {
	setup(frm) {
		frm.set_query("familymember_id", () => ({
			filters: { gender: "Female" },
		}));
	},
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
	lmp_date(frm) {
		if (frm.doc.lmp_date) {
			frm.set_value("estimated_date_of_delivery", frappe.datetime.add_days(frm.doc.lmp_date, 281));

			const days_pregnant = frappe.datetime.get_diff(frappe.datetime.get_today(), frm.doc.lmp_date);
			const weeks = Math.floor(days_pregnant / 7);
			const days = days_pregnant % 7;
			frm.set_value("pog", `${weeks} weeks ${days} days`);
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

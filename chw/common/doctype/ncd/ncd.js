// Copyright (c) 2026, tech4socialsector@azimpremjifoundation.org and contributors
// For license information, please see license.txt

frappe.ui.form.on("NCD", {
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

		frm.set_query("familymember_id", () => {
			return {
				filters: {
					age: [">", 30],
				},
			};
		});
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
	disease(frm) {
		generate_visit_schedule(frm);
	},
	high_risk(frm) {
		generate_visit_schedule(frm);
	},
	familymember_id(frm) {
		generate_visit_schedule(frm);
	},
	ncd_followup_remove(frm) {
		calculate_next_ncd_visit_date(frm);
	},
});

frappe.ui.form.on("NCD Followup Child", {
	date(frm) {
		calculate_next_ncd_visit_date(frm);
	},
	status(frm) {
		calculate_next_ncd_visit_date(frm);
	},
});

const HIGH_RISK_INTERVAL_DAYS = 30;
const NORMAL_RISK_DEFAULT_INTERVAL_DAYS = 60;
const SCHEDULE_DURATION_DAYS = 365;

function get_interval_days(frm) {
	if (frm.doc.high_risk === "Yes") {
		return Promise.resolve(HIGH_RISK_INTERVAL_DAYS);
	}

	if (frm.doc.disease) {
		return frappe.db.get_value("NCD Disease", frm.doc.disease, "interval_days").then((r) => {
			return (r.message && r.message.interval_days) || NORMAL_RISK_DEFAULT_INTERVAL_DAYS;
		});
	}

	return Promise.resolve(NORMAL_RISK_DEFAULT_INTERVAL_DAYS);
}

function generate_visit_schedule(frm) {
	if (!frm.doc.familymember_id || (frm.doc.ncd_followup || []).length) {
		calculate_next_ncd_visit_date(frm);
		return;
	}

	get_interval_days(frm).then((interval_days) => {
		const today = frappe.datetime.get_today();
		const end_date = frappe.datetime.add_days(today, SCHEDULE_DURATION_DAYS);
		let visit_date = frappe.datetime.add_days(today, interval_days);
		while (visit_date <= end_date) {
			frm.add_child("ncd_followup", { date: visit_date, status: "Pending" });
			visit_date = frappe.datetime.add_days(visit_date, interval_days);
		}
		frm.refresh_field("ncd_followup");
		calculate_next_ncd_visit_date(frm);
	});
}

function calculate_next_ncd_visit_date(frm) {
	const current = frm.doc.next_followup_date;
	const last_auto = frm.doc.next_followup_date_auto;
	if (current && last_auto && current !== last_auto) {
		// user has manually overridden the date; leave it alone
		return;
	}

	const dated_rows = (frm.doc.ncd_followup || []).filter((row) => row.date);
	if (!dated_rows.length) {
		return;
	}

	const pending_rows = dated_rows.filter((row) => row.status !== "Completed");

	const set_next_date = (calculated_date) => {
		frm.set_value("next_followup_date", calculated_date);
		frm.set_value("next_followup_date_auto", calculated_date);
	};

	if (pending_rows.length) {
		// next visit due is the earliest visit not yet marked Completed
		const next_date = pending_rows.reduce((earliest, row) => (row.date < earliest ? row.date : earliest), pending_rows[0].date);
		set_next_date(next_date);
		return;
	}

	const last_date = dated_rows.reduce((latest, row) => (row.date > latest ? row.date : latest), dated_rows[0].date);
	get_interval_days(frm).then((interval_days) => {
		set_next_date(frappe.datetime.add_days(last_date, interval_days));
	});
}

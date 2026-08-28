// Copyright (c) 2026, tech4socialsector@azimpremjifoundation.org and contributors
// For license information, please see license.txt

frappe.ui.form.on("ANC Follow-up", {
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
	pregnant_id(frm) {
		generate_visit_schedule(frm);
	},
});

frappe.ui.form.on("ANC Followup Child", {
	date(frm) {
		calculate_next_anc_visit_date(frm);
	},
	status(frm) {
		calculate_next_anc_visit_date(frm);
	},
});

frappe.ui.form.on("ANC Follow-up", {
	anc_followup_remove(frm) {
		calculate_next_anc_visit_date(frm);
	},
});

function get_interval_days(pregnant_id) {
	return frappe.db.get_value("Pregnancy Registration", pregnant_id, "high_risk").then((r) => {
		const high_risk = (r.message && r.message.high_risk) || "No";
		return frappe.db.get_value("ANC Visit Interval Master", high_risk, "interval_days").then((res) => {
			return (res.message && res.message.interval_days) || 30;
		});
	});
}

function generate_visit_schedule(frm) {
	if (!frm.doc.pregnant_id || (frm.doc.anc_followup || []).length) {
		calculate_next_anc_visit_date(frm);
		return;
	}

	frappe.db
		.get_value("Pregnancy Registration", frm.doc.pregnant_id, ["lmp_date", "estimated_date_of_delivery"])
		.then((r) => {
			const lmp_date = r.message && r.message.lmp_date;
			const edd = r.message && r.message.estimated_date_of_delivery;
			if (!lmp_date || !edd) {
				return;
			}

			get_interval_days(frm.doc.pregnant_id).then((interval_days) => {
				let visit_date = frappe.datetime.add_days(lmp_date, interval_days);
				while (visit_date <= edd) {
					frm.add_child("anc_followup", { date: visit_date, status: "Pending" });
					visit_date = frappe.datetime.add_days(visit_date, interval_days);
				}
				frm.refresh_field("anc_followup");
				calculate_next_anc_visit_date(frm);
			});
		});
}

function calculate_next_anc_visit_date(frm) {
	if (frm.doc.status === "Closed") {
		// She's delivered - no more ANC visits are due.
		frm.set_value("next_anc_visit_date", null);
		frm.set_value("next_anc_visit_date_auto", null);
		return;
	}

	const current = frm.doc.next_anc_visit_date;
	const last_auto = frm.doc.next_anc_visit_date_auto;
	if (current && last_auto && current !== last_auto) {
		// user has manually overridden the date; leave it alone
		return;
	}

	const dated_rows = (frm.doc.anc_followup || []).filter((row) => row.date);
	if (!frm.doc.pregnant_id || !dated_rows.length) {
		return;
	}

	const pending_rows = dated_rows.filter((row) => row.status !== "Completed");

	get_interval_days(frm.doc.pregnant_id).then((interval_days) => {
		let calculated_date;
		if (pending_rows.length) {
			// next visit due is the earliest visit not yet marked Completed
			calculated_date = pending_rows.reduce(
				(earliest, row) => (row.date < earliest ? row.date : earliest),
				pending_rows[0].date
			);
		} else {
			const last_date = dated_rows.reduce((latest, row) => (row.date > latest ? row.date : latest), dated_rows[0].date);
			calculated_date = frappe.datetime.add_days(last_date, interval_days);
		}
		frm.set_value("next_anc_visit_date", calculated_date);
		frm.set_value("next_anc_visit_date_auto", calculated_date);
	});
}

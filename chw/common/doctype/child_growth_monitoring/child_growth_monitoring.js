// Copyright (c) 2026, tech4socialsector@azimpremjifoundation.org and contributors
// For license information, please see license.txt

frappe.ui.form.on("Child Growth Monitoring", {
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
					age_in_months: ["<=", 132],
				},
			};
		});
	},
	familymember_id(frm) {
		if (!frm.doc.familymember_id) {
			return;
		}

		frappe.db.get_value("Family members", frm.doc.familymember_id, "date_of_birth").then((r) => {
			const date_of_birth = r.message && r.message.date_of_birth;
			if (date_of_birth) {
				frm.set_value("date_of_birth", date_of_birth);
			}
		});
	},
	date_of_birth(frm) {
		calculate_age(frm);
		generate_visit_schedule(frm);
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
	growth_followup_remove(frm) {
		calculate_next_followup_date(frm);
	},
});

function get_care_stage(age_in_months) {
	if (age_in_months <= 6) {
		return "0-6 Months";
	}
	if (age_in_months <= 60) {
		return "6 Months to 5 Years";
	}
	if (age_in_months <= 132) {
		return "5 Years to 11 Years";
	}
	return "Above 11 Years";
}

function months_between(dob_str, date_str) {
	let dob = frappe.datetime.str_to_obj(dob_str);
	let date = frappe.datetime.str_to_obj(date_str);

	let years = date.getFullYear() - dob.getFullYear();
	let months = date.getMonth() - dob.getMonth();
	let days = date.getDate() - dob.getDate();

	if (days < 0) {
		months -= 1;
	}
	if (months < 0) {
		years -= 1;
		months += 12;
	}
	return years * 12 + months;
}

function calculate_age(frm) {
	if (!frm.doc.date_of_birth) {
		frm.set_value("age", "");
		frm.set_value("age_in_months", 0);
		frm.set_value("care_stage", "");
		return;
	}

	let dob = frappe.datetime.str_to_obj(frm.doc.date_of_birth);
	let now = frappe.datetime.str_to_obj(frappe.datetime.now_date());

	if (dob > now) {
		frappe.msgprint({
			title: __("Invalid Date of Birth"),
			message: __("Date of Birth cannot be in the future."),
			indicator: "red",
		});
		frm.set_value("date_of_birth", "");
		return;
	}

	const age_in_months = months_between(frm.doc.date_of_birth, frappe.datetime.now_date());
	frm.set_value("age", String(Math.floor(age_in_months / 12)));
	frm.set_value("age_in_months", age_in_months);
	frm.set_value("care_stage", get_care_stage(age_in_months));
}

function generate_visit_schedule(frm) {
	if (!frm.doc.date_of_birth || (frm.doc.growth_followup || []).length) {
		return;
	}

	const dob = frm.doc.date_of_birth;

	frappe.db.get_value("Malnutrition Category Master", "Normal", "interval_days").then((res) => {
		const interval_days = (res.message && res.message.interval_days) || 30;
		const end_date_0_5y = frappe.datetime.add_months(dob, 60);
		let visit_date = frappe.datetime.add_days(dob, interval_days);
		while (visit_date <= end_date_0_5y) {
			frm.add_child("growth_followup", {
				date: visit_date,
				stage: get_care_stage(months_between(dob, visit_date)),
				status: "Pending",
			});
			visit_date = frappe.datetime.add_days(visit_date, interval_days);
		}

		for (let m = 72; m <= 132; m += 12) {
			frm.add_child("growth_followup", {
				date: frappe.datetime.add_months(dob, m),
				stage: "5 Years to 11 Years",
				status: "Pending",
			});
		}

		frm.refresh_field("growth_followup");
		calculate_next_followup_date(frm);
	});
}

function calculate_next_followup_date(frm) {
	const current = frm.doc.next_followup_date;
	const last_auto = frm.doc.next_followup_date_auto;
	if (current && last_auto && current !== last_auto) {
		// user has manually overridden the date; leave it alone
		return;
	}

	const dated_rows = (frm.doc.growth_followup || []).filter((row) => row.date);
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

	const last_row = dated_rows.reduce((latest, row) => (row.date > latest.date ? row : latest), dated_rows[0]);

	if (last_row.stage === "5 Years to 11 Years") {
		set_next_date(frappe.datetime.add_months(last_row.date, 12));
		return;
	}

	if (last_row.classification) {
		frappe.db.get_value("Malnutrition Category Master", last_row.classification, "interval_days").then((r) => {
			set_next_date(frappe.datetime.add_days(last_row.date, (r.message && r.message.interval_days) || 30));
		});
	} else {
		set_next_date(frappe.datetime.add_days(last_row.date, 30));
	}
}

frappe.ui.form.on("Child Growth Followup", {
	muac(frm, cdt, cdn) {
		set_row_classification(frm, cdt, cdn);
	},
	edema(frm, cdt, cdn) {
		set_row_classification(frm, cdt, cdn);
	},
	date(frm) {
		calculate_next_followup_date(frm);
	},
	status(frm) {
		calculate_next_followup_date(frm);
	},
});

function set_row_classification(frm, cdt, cdn) {
	const row = locals[cdt][cdn];
	let classification = "";

	if (row.edema === "Yes") {
		classification = "SAM";
	} else if (row.muac !== undefined && row.muac !== null && row.muac !== "") {
		if (row.muac < 11.5) {
			classification = "SAM";
		} else if (row.muac < 12.5) {
			classification = "MAM";
		} else {
			classification = "Normal";
		}
	}

	frappe.model.set_value(cdt, cdn, "classification", classification);
	calculate_next_followup_date(frm);
}

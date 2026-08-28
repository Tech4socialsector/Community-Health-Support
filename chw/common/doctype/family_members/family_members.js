// Copyright (c) 2026, tech4socialsector@azimpremjifoundation.org and contributors
// For license information, please see license.txt

frappe.ui.form.on("Family members", {
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
	date_of_birth(frm) {
		calculate_age(frm);
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
	occupation(frm) {
		// Always reset, even when switching back to "Studying"/"Other", so a
		// stale value saved from an earlier selection never resurfaces.
		frm.set_value("education", "");
		frm.set_value("education_status", "");
		frm.set_value("other_occupation", "");
	},
	disability(frm) {
		if (frm.doc.disability !== "Yes") {
			frm.set_value("type_of_disability", "");
		}
	},
});

function calculate_age(frm) {
	if (!frm.doc.date_of_birth) {
		frm.set_value("age", "");
		frm.set_value("age_in_months", 0);
		frm.set_value("age_in_days", 0);
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
		frm.set_value("age", "");
		frm.set_value("age_in_months", 0);
		frm.set_value("age_in_days", 0);
		return;
	}

	let years = now.getFullYear() - dob.getFullYear();
	let months = now.getMonth() - dob.getMonth();
	let days = now.getDate() - dob.getDate();

	if (days < 0) {
		months -= 1;
	}
	if (months < 0) {
		years -= 1;
		months += 12;
	}

	frm.set_value("age", String(years));
	frm.set_value("age_in_months", years * 12 + months);
	frm.set_value("age_in_days", frappe.datetime.get_diff(frappe.datetime.now_date(), frm.doc.date_of_birth));
}

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
		set_cancer_eligibility(frm);
	},
	age(frm) {
		// Typed by hand only when the date of birth isn't known (Age is
		// read-only once a DOB is set). Whole years, as the server checks.
		const age = String(frm.doc.age ?? "").trim();
		if (!frm.doc.date_of_birth && age && (!/^\d+$/.test(age) || Number(age) > 120)) {
			frappe.msgprint({
				title: __("Check the age"),
				message: __("Age must be a whole number of years (0 to 120), e.g. 45."),
				indicator: "orange",
			});
		}
		set_cancer_eligibility(frm);
	},
	gender: set_cancer_eligibility,
	tobacco_user: set_cancer_eligibility,
	known_cancer_patient: set_cancer_eligibility,
	cancer_eligibility_manual: set_cancer_eligibility,
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
});

// Same result as the server's dateutil.relativedelta (family_members.py
// get_age_values): whole months are counted by stepping the birth date
// forward month by month - clamped to the month's last day (31 Jan + 1
// month = 28/29 Feb) - and the days are what's left after that. Borrowing
// "days in the previous month" instead gave a different answer near month
// ends, so the form and the saved record could disagree by a day.
function age_parts(dob, now) {
	let months = (now.getFullYear() - dob.getFullYear()) * 12 + (now.getMonth() - dob.getMonth());
	if (add_months_clamped(dob, months) > now) months -= 1;
	let anchor = add_months_clamped(dob, months);
	let days = Math.round((now - anchor) / 86400000);
	return { years: Math.floor(months / 12), months: months % 12, total_months: months, days: days };
}

function add_months_clamped(date, count) {
	let y = date.getFullYear();
	let m = date.getMonth() + count;
	let target_year = y + Math.floor(m / 12);
	let target_month = ((m % 12) + 12) % 12;
	let last_day = new Date(target_year, target_month + 1, 0).getDate();
	return new Date(target_year, target_month, Math.min(date.getDate(), last_day));
}

function calculate_age(frm) {
	if (!frm.doc.date_of_birth) {
		frm.set_value("age", "");
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
		return;
	}

	let age = age_parts(dob, now);
	frm.set_value("age", String(age.years));
}

// Cancer screening eligibility, as chw/cancer/eligibility.py works it out on
// save - shown straight away. Only while the Cancer programme is on (its
// section is hidden otherwise), and not when set by hand.
function set_cancer_eligibility(frm) {
	const section = frm.get_docfield("cancer_family_member_details_section");
	if (!section || section.hidden || frm.doc.cancer_eligibility_manual) return;
	const text = String(frm.doc.age ?? "").trim();
	const age = text ? parseInt(text, 10) : null;
	const woman = frm.doc.gender === "Female";
	let eligible = "No";
	let reason;
	if (frm.doc.known_cancer_patient === "Yes") reason = __("Known cancer patient");
	else if (woman && age != null && age >= 30 && age <= 65) eligible = "Yes";
	else if (frm.doc.tobacco_user === "Yes") eligible = "Yes";
	else if (woman) reason = age == null ? __("Age not known") : __("Age mismatch (not 30–65)");
	else reason = __("Not a woman aged 30–65 and not a tobacco user");
	frm.set_value("cancer_screening_eligible", eligible);
	frm.set_value("cancer_not_eligible_reason", eligible === "Yes" ? "" : reason);
}

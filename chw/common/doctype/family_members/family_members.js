// Copyright (c) 2026, tech4socialsector@azimpremjifoundation.org and contributors
// For license information, please see license.txt

// Mirrors family_members.py's CHARITY_CRITERIA_FIELDS - options are
// worst-need-first (score 4) down to least-need (score 1), so the score is
// just each option's position in its own list. This is only for an
// immediate on-screen preview before save; the server always recomputes the
// real value in validate(), so a mismatch here is cosmetic, not a bug.
const CHARITY_CRITERIA_FIELDS = [
	"charity_breadwinner_occupation",
	"charity_dependent_ratio",
	"charity_health_condition",
	"charity_living_conditions",
	"charity_disability_severity",
	"charity_mch_assessment",
];

// Some criteria only apply some of the time (mirrors each field's own
// depends_on) - a field hidden by its own condition must not count toward
// "every criterion answered" below, or the suggested % would never appear
// for a record that will never show that field.
const CHARITY_CRITERIA_APPLICABLE = {
	charity_disability_severity: (frm) => frm.doc.is_the_person_currently_pregnant !== "Yes",
	charity_mch_assessment: (frm) => frm.doc.does_the_person_require_palliative_care !== "Yes",
};

function applicable_charity_fields(frm) {
	return CHARITY_CRITERIA_FIELDS.filter((f) => (CHARITY_CRITERIA_APPLICABLE[f] || (() => true))(frm));
}

function charity_percentage_band(score) {
	if (score >= 20) return ">80%";
	if (score >= 17) return "60-80%";
	if (score >= 12) return "40-60%";
	if (score >= 7) return "20-40%";
	return "0-20%";
}

function preview_charity_score(frm) {
	const applicable = applicable_charity_fields(frm);
	const answered = applicable.filter((f) => frm.doc[f]);
	if (!answered.length) {
		frm.set_value("charity_assessment_score", 0);
		frm.set_value("suggested_charity_percentage", "");
		return;
	}
	let score = 0;
	answered.forEach((f) => {
		const options = frm.get_docfield(f).options.split("\n").filter(Boolean);
		const idx = options.indexOf(frm.doc[f]);
		if (idx >= 0) score += options.length - idx;
	});
	frm.set_value("charity_assessment_score", score);
	frm.set_value(
		"suggested_charity_percentage",
		answered.length === applicable.length ? charity_percentage_band(score) : ""
	);
}

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
	charity_breadwinner_occupation: preview_charity_score,
	charity_dependent_ratio: preview_charity_score,
	charity_health_condition: preview_charity_score,
	charity_living_conditions: preview_charity_score,
	charity_disability_severity: preview_charity_score,
	charity_mch_assessment: preview_charity_score,
	// These two don't carry a score themselves, but they decide whether
	// Disability Severity / MCH Assessment apply at all (depends_on) - so
	// toggling either one can complete (or reopen) the suggested % on its own.
	is_the_person_currently_pregnant: preview_charity_score,
	does_the_person_require_palliative_care: preview_charity_score,
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

// "2 years, 3 months, 10 days" - leading zero units left out ("12 days"),
// matching format_age_detail() on the server.
function format_age_detail(years, months, days) {
	let part = (n, unit) => `${n} ${unit}${n === 1 ? "" : "s"}`;
	let parts = [];
	if (years) parts.push(part(years, "year"));
	if (years || months) parts.push(part(months, "month"));
	parts.push(part(days, "day"));
	return parts.join(", ");
}

function calculate_age(frm) {
	if (!frm.doc.date_of_birth) {
		frm.set_value("age", "");
		frm.set_value("age_in_months", 0);
		frm.set_value("age_in_days", 0);
		frm.set_value("age_detail", "");
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
		frm.set_value("age_detail", "");
		return;
	}

	let age = age_parts(dob, now);
	frm.set_value("age", String(age.years));
	frm.set_value("age_in_months", age.total_months);
	frm.set_value("age_in_days", frappe.datetime.get_diff(frappe.datetime.now_date(), frm.doc.date_of_birth));
	frm.set_value("age_detail", format_age_detail(age.years, age.months, age.days));
}

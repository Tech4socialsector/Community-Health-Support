// Copyright (c) 2026, tech4socialsector@azimpremjifoundation.org and contributors
// For license information, please see license.txt

// Mirrors household_profile.py's CHARITY_CRITERIA_FIELDS - options are
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
];

function charity_percentage_band(score) {
	if (score >= 17) return ">80%";
	if (score >= 14) return "60-80%";
	if (score >= 10) return "40-60%";
	if (score >= 6) return "20-40%";
	return "0-20%";
}

function preview_charity_score(frm) {
	const answered = CHARITY_CRITERIA_FIELDS.filter((f) => frm.doc[f]);
	if (!answered.length) {
		frm.set_value("charity_assessment_score", 0);
		frm.set_value("charity_percentage_band", "");
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
		"charity_percentage_band",
		answered.length === CHARITY_CRITERIA_FIELDS.length ? charity_percentage_band(score) : ""
	);
}

frappe.ui.form.on("Household profile", {
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
	charity_breadwinner_occupation: preview_charity_score,
	charity_dependent_ratio: preview_charity_score,
	charity_health_condition: preview_charity_score,
	charity_living_conditions: preview_charity_score,
	charity_disability_severity: preview_charity_score,
	phone_no(frm) {
		if (frm.doc.phone_no && !/^\d*$/.test(frm.doc.phone_no)) {
			frappe.msgprint({
				title: __("Invalid Phone Number"),
				message: __("Letters are not allowed. Please enter numbers only."),
				indicator: "red",
			});
		}
	},
	geo_location(frm) {
		if (!frm.doc.geo_location) {
			frm.set_value("latitude", "");
			frm.set_value("longitude", "");
			return;
		}

		let geojson;
		try {
			geojson = JSON.parse(frm.doc.geo_location);
		} catch (e) {
			return;
		}

		const point = (geojson.features || []).find((f) => f.geometry && f.geometry.type === "Point");
		if (point) {
			const [lng, lat] = point.geometry.coordinates;
			frm.set_value("latitude", lat);
			frm.set_value("longitude", lng);
		}
	},
});

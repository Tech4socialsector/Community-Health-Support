// Copyright (c) 2026, tech4socialsector@azimpremjifoundation.org and contributors
// For license information, please see license.txt

// Cancer outreach (only while the Outreach Clinic ID field is in use - see
// OUTREACH form_fields in chw/programmes.py): the worker's own Active
// clinics, filled in when there's only one; the clinic fills the village
// (when it covers one), pincode and state, and the village list shows only
// its villages. The Vue app does the same in doctype-hooks/householdProfile.js.
function outreach_in_use(frm) {
	const df = frm.get_docfield("outreach_clinic");
	const section = frm.get_docfield("outreach_section");
	return df && !df.hidden && !(section && section.hidden);
}

// Place: District -> Taluk/Block -> Panchayat -> Village (optional). Each
// list shows only the places under the level above, picking a lower level
// fills the ones above, changing a level clears what no longer fits. The
// Vue app does the same in doctype-hooks/places.js; the server re-checks on
// save (chw.places.check_household_places).
const HH_LEVELS = ["district", "taluk_block", "gram_panchayat", "village"];
const HH_DOCTYPE = { district: "District", taluk_block: "Taluk Block", gram_panchayat: "Gram Panchayat", village: "Village" };

function hh_place_changed(frm, fieldname) {
	const value = frm.doc[fieldname];
	if (!value || frm.__filling) return;
	const i = HH_LEVELS.indexOf(fieldname);
	const go = i > 0
		? frappe.call({ method: "chw.places.parents_of", args: { doctype: HH_DOCTYPE[fieldname], name: value } })
		: Promise.resolve({ message: {} });
	go.then(async (r) => {
		const above = r.message || {};
		if (frm.doc[fieldname] !== value) return;
		frm.__filling = true;
		try {
			for (const f of HH_LEVELS.slice(0, i)) {
				if (above[f] && String(frm.doc[f] || "") !== String(above[f])) await frm.set_value(f, above[f]);
			}
			let cleared = false;
			for (let j = i + 1; j < HH_LEVELS.length; j++) {
				const below = HH_LEVELS[j];
				if (!frm.doc[below]) continue;
				if (cleared) {
					await frm.set_value(below, "");
					continue;
				}
				const p = await frappe.call({
					method: "chw.places.parents_of",
					args: { doctype: HH_DOCTYPE[below], name: frm.doc[below] },
				});
				const up = p.message || {};
				if (HH_LEVELS.slice(0, j).some((f) => frm.doc[f] && up[f] && String(up[f]) !== String(frm.doc[f]))) {
					await frm.set_value(below, "");
					cleared = true;
				}
			}
		} finally {
			frm.__filling = false;
		}
	});
}

frappe.ui.form.on("Household profile", {
	setup(frm) {
		frm.set_query("outreach_clinic", () => ({ query: "chw.cancer.outreach.clinic_query" }));
		frm.set_query("taluk_block", () => (frm.doc.district ? { filters: { district: frm.doc.district } } : {}));
		frm.set_query("gram_panchayat", () =>
			frm.doc.taluk_block
				? { filters: { taluk_block: frm.doc.taluk_block } }
				: frm.doc.district
				? { filters: { district: frm.doc.district } }
				: {}
		);
		frm.set_query("village", () =>
			frm.doc.outreach_clinic
				? { query: "chw.cancer.outreach.village_query", filters: { outreach_clinic: frm.doc.outreach_clinic } }
				: frm.doc.gram_panchayat
				? { filters: { village_code: frm.doc.gram_panchayat } }
				: {}
		);
	},
	refresh(frm) {
		const defaults = {
			taluk_block: () => ({ district: frm.doc.district }),
			gram_panchayat: () => ({ taluk_block: frm.doc.taluk_block }),
			village: () => ({ village_code: frm.doc.gram_panchayat }),
		};
		for (const [f, fn] of Object.entries(defaults)) {
			if (frm.fields_dict[f]) frm.fields_dict[f].get_route_options_for_new_doc = fn;
		}
	},
	district: (frm) => hh_place_changed(frm, "district"),
	taluk_block: (frm) => hh_place_changed(frm, "taluk_block"),
	gram_panchayat: (frm) => hh_place_changed(frm, "gram_panchayat"),
	village: (frm) => hh_place_changed(frm, "village"),
	outreach_clinic(frm) {
		const clinic = frm.doc.outreach_clinic;
		if (!clinic) {
			// Clinic removed: its place goes with it.
			frm.__filling = true;
			const jobs = ["district", "taluk_block", "gram_panchayat", "village"]
				.filter((f) => frm.doc[f])
				.map((f) => frm.set_value(f, ""));
			Promise.all(jobs).finally(() => (frm.__filling = false));
			return;
		}
		frappe.call({ method: "chw.cancer.outreach.clinic_details", args: { clinic } }).then((r) => {
			const d = r.message || {};
			if (frm.doc.outreach_clinic !== clinic) return;
			for (const f of ["district", "taluk_block", "gram_panchayat"]) {
				if (d[f] && String(frm.doc[f] || "") !== String(d[f])) frm.set_value(f, d[f]);
			}
			if (d.village && !frm.doc.village) frm.set_value("village", d.village);
			else if (frm.doc.village && (d.villages || []).length && !d.villages.includes(frm.doc.village))
				frm.set_value("village", d.village || "");
			if (d.pincode && !frm.doc.pin_code) frm.set_value("pin_code", cint(d.pincode));
			if (d.state && !frm.doc.state) frm.set_value("state", d.state);
		});
	},
	onload(frm) {
		if (frm.is_new() && !frm.doc.outreach_clinic && outreach_in_use(frm)) {
			frappe.call({ method: "chw.cancer.outreach.my_clinics" }).then((r) => {
				const mine = r.message || [];
				if (mine.length === 1 && !frm.doc.outreach_clinic) frm.set_value("outreach_clinic", mine[0]);
			});
		}
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

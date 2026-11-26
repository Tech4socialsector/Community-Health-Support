// Copyright (c) 2026, tech4socialsector@azimpremjifoundation.org and contributors
// For license information, please see license.txt

// State -> District -> Taluk Block -> Gram Panchayat:
//   top-down   each list shows only the places under the one above
//   bottom-up  picking a Block or Panchayat first fills the levels above
//   manual     "+ Create a new ..." opens with the levels above filled in
// A known pincode fills State / District / Block (and the Panchayat when
// it's the only one). The Vue app does the same in doctype-hooks/places.js;
// the server re-checks the chain on save.

const LEVELS = ["state", "district", "taluk_block", "gram_panchayat"];
const LEVEL_DOCTYPE = { district: "District", taluk_block: "Taluk Block", gram_panchayat: "Gram Panchayat" };

function new_doc_defaults(frm, fieldname, values) {
	const field = frm.fields_dict[fieldname];
	if (field) field.get_route_options_for_new_doc = () => values();
}

function fill_up(frm, fieldname) {
	const value = frm.doc[fieldname];
	if (!value || frm.__filling) return;
	const i = LEVELS.indexOf(fieldname);
	const go = i > 0
		? frappe.call({ method: "chw.places.parents_of", args: { doctype: LEVEL_DOCTYPE[fieldname], name: value } })
		: Promise.resolve({ message: {} });
	go.then(async (r) => {
		const above = r.message || {};
		if (frm.doc[fieldname] !== value) return;
		frm.__filling = true;
		try {
			for (const f of LEVELS.slice(0, i)) {
				if (above[f] && String(frm.doc[f] || "") !== String(above[f])) await frm.set_value(f, above[f]);
			}
			if (fieldname === "gram_panchayat" && above.pincode && !frm.doc.pincode) await frm.set_value("pincode", above.pincode);
			// Top-down: a level below that isn't inside the new pick is cleared.
			// A level goes when it isn't inside every level picked above it, or
			// when the level right above it was just cleared.
			let cleared = false;
			for (let j = i + 1; j < LEVELS.length; j++) {
				const below = LEVELS[j];
				if (!frm.doc[below]) continue;
				if (cleared) {
					await frm.set_value(below, "");
					continue;
				}
				const p = await frappe.call({
					method: "chw.places.parents_of",
					args: { doctype: LEVEL_DOCTYPE[below], name: frm.doc[below] },
				});
				const above = p.message || {};
				const wrong = LEVELS.slice(0, j).some(
					(f) => frm.doc[f] && above[f] && String(above[f]) !== String(frm.doc[f])
				);
				if (wrong) {
					await frm.set_value(below, "");
					cleared = true;
				}
			}
		} finally {
			frm.__filling = false;
		}
	});
}

// The Outreach Clinic ID builds up while the District, Block and Panchayat
// are picked: 37 -> 3707 -> 3707411 (2 + 2 + 3 digit codes), before Save.
// One clinic per panchayat - an ID already used is pointed out at once.
function preview_id(frm) {
	if (!frm.is_new()) return;
	const seq = (frm.__preview_seq = (frm.__preview_seq || 0) + 1);
	frappe
		.call({
			method: "chw.cancer.doctype.outreach_clinic.outreach_clinic.preview_id",
			args: { district: frm.doc.district, taluk_block: frm.doc.taluk_block, gram_panchayat: frm.doc.gram_panchayat },
		})
		.then((r) => {
			if (seq !== frm.__preview_seq) return;
			const m = r.message || {};
			const id = m.id || "";
			if ((frm.doc.outreach_clinic_id || "") !== id) frm.set_value("outreach_clinic_id", id);
			if (m.exists)
				frappe.show_alert({ message: __("Outreach Clinic {0} already exists for this panchayat - open it instead.", [m.exists]), indicator: "orange" });
			else if (m.missing)
				frappe.show_alert({ message: __("{0} has no code yet - give it one to complete the Outreach Clinic ID.", [__(m.missing)]), indicator: "orange" });
		});
}

frappe.ui.form.on("Outreach Clinic", {
	setup(frm) {
		frm.set_query("district", () => (frm.doc.state ? { filters: { state: frm.doc.state } } : {}));
		frm.set_query("taluk_block", () =>
			frm.doc.district ? { filters: { district: frm.doc.district } } : frm.doc.state ? { filters: { state: frm.doc.state } } : {}
		);
		frm.set_query("gram_panchayat", () =>
			frm.doc.taluk_block
				? { filters: { taluk_block: frm.doc.taluk_block } }
				: frm.doc.district
				? { filters: { district: frm.doc.district } }
				: frm.doc.state
				? { filters: { state: frm.doc.state } }
				: {}
		);
		// Table MultiSelect: the query goes on the field itself, not a grid.
		frm.set_query("villages", () =>
			frm.doc.gram_panchayat ? { filters: { village_code: frm.doc.gram_panchayat } } : {}
		);
	},
	onload(frm) {
		new_doc_defaults(frm, "district", () => ({ state: frm.doc.state }));
		new_doc_defaults(frm, "taluk_block", () => ({ district: frm.doc.district }));
		new_doc_defaults(frm, "gram_panchayat", () => ({ taluk_block: frm.doc.taluk_block, pincode: frm.doc.pincode }));
	},
	refresh: (frm) => preview_id(frm),
	state(frm) {
		fill_up(frm, "state");
		preview_id(frm);
	},
	district(frm) {
		fill_up(frm, "district");
		preview_id(frm);
	},
	taluk_block(frm) {
		fill_up(frm, "taluk_block");
		preview_id(frm);
	},
	gram_panchayat(frm) {
		fill_up(frm, "gram_panchayat");
		preview_id(frm);
		if ((frm.doc.villages || []).length) frm.set_value("villages", []);
	},
	pincode(frm) {
		const pin = String(frm.doc.pincode || "").replace(/\D/g, "");
		if (pin.length !== 6) return;
		frappe.call({ method: "chw.places.from_pincode", args: { pincode: pin } }).then(async (r) => {
			const found = r.message || {};
			frm.__filling = true;
			try {
				for (const f of LEVELS) if (found[f] && !frm.doc[f]) await frm.set_value(f, found[f]);
			} finally {
				frm.__filling = false;
			}
		});
	},
});

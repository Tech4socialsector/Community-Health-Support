// Copyright (c) 2026, tech4socialsector@azimpremjifoundation.org and contributors
// For license information, please see license.txt

frappe.ui.form.on("PNC", {
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
	refresh(frm) {
		// Small delay - the grid renders its rows just after refresh fires,
		// so styling immediately would sometimes miss rows not yet drawn.
		setTimeout(() => highlight_risk_rows(frm), 300);
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
	birth_registration_id(frm) {
		// date_of_delivery is fetched from this field a moment later.
		setTimeout(() => generate_visit_schedule(frm), 300);
	},
	date_of_delivery(frm) {
		generate_visit_schedule(frm);
	},
	high_risk(frm) {
		calculate_next_pnc_visit_date(frm);
	},
	mother_remove(frm) {
		calculate_next_pnc_visit_date(frm);
	},
	baby_remove(frm) {
		calculate_next_pnc_visit_date(frm);
	},
});

frappe.ui.form.on("PNC Followup Child", {
	status(frm) {
		calculate_next_pnc_visit_date(frm);
	},
	patient_condition(frm, cdt, cdn) {
		const row = locals[cdt][cdn];
		if (row.patient_condition === "Risk") {
			frm.set_value("high_risk", "Yes");
		}
		calculate_next_pnc_visit_date(frm);
	},
	mother_add(frm, cdt, cdn) {
		fill_new_row_date(frm, cdt, cdn, "mother");
	},
});

frappe.ui.form.on("Baby PNC Followup Child", {
	status(frm) {
		calculate_next_pnc_visit_date(frm);
	},
	baby_condition(frm, cdt, cdn) {
		const row = locals[cdt][cdn];
		if (row.baby_condition === "Risk") {
			frm.set_value("high_risk", "Yes");
		}
		calculate_next_pnc_visit_date(frm);
	},
	baby_add(frm, cdt, cdn) {
		fill_new_row_date(frm, cdt, cdn, "baby");
	},
});

// Last-resort fallback only, used if the PNC Visit Interval Master hasn't
// been configured yet - the real policy always comes from that master's
// Visit Schedule rows. (opens_day, closes_day) per visit, 1-indexed by
// position - visit 1 opens at delivery, visit 2 is the last week of a
// 6-week (42-day) postnatal period.
const DEFAULT_VISIT_SCHEDULE = [
	[0, 7],
	[35, 42],
];
const DEFAULT_RISK_ALERT_DAYS = 1;

function get_full_schedule() {
	// A child table (PNC Visit Schedule Row) has no permission rules of its
	// own, so it can't reliably be listed directly from the client - fetched
	// through a whitelisted method on the parent doc instead, which goes
	// through the master's own, already-granted permissions.
	return frappe
		.call({ method: "chw.common.doctype.pnc.pnc.get_visit_schedule" })
		.then((r) => {
			const rows = r && r.message;
			if (rows && rows.length) return rows;
			return DEFAULT_VISIT_SCHEDULE.map(([opens, closes]) => ({
				window_opens_day: opens,
				window_closes_day: closes,
				risk_alert_within_days: DEFAULT_RISK_ALERT_DAYS,
			}));
		});
}

function get_visit_window(visit_number, schedule_rows) {
	// visit_number is 1-indexed, matching row position - row 1 is visit 1,
	// row 2 is visit 2, and so on. No fixed cap - however many rows exist
	// is however many visits there are.
	if (visit_number < 1 || visit_number > schedule_rows.length) return null;
	const row = schedule_rows[visit_number - 1];
	return {
		start_offset: row.window_opens_day,
		end_offset: row.window_closes_day,
		risk_alert_within_days: row.risk_alert_within_days || DEFAULT_RISK_ALERT_DAYS,
	};
}

function fill_new_row_date(frm, cdt, cdn, table_field) {
	// A row added by hand (rather than by the bulk schedule generator
	// below) still gets its target date filled in from the delivery date -
	// the CHW should never see a blank calendar with no suggested date. A
	// row beyond however many visits are configured simply gets no
	// schedule to fill in from.
	const row = locals[cdt][cdn];
	if (row.date || !frm.doc.date_of_delivery) {
		calculate_next_pnc_visit_date(frm);
		return;
	}
	const visit_number = (frm.doc[table_field] || []).indexOf(row) + 1;
	get_full_schedule().then((schedule_rows) => {
		const window = get_visit_window(visit_number, schedule_rows);
		if (!window) return;
		const window_end = frappe.datetime.add_days(frm.doc.date_of_delivery, window.end_offset);
		frappe.model.set_value(cdt, cdn, "date", window_end);
		calculate_next_pnc_visit_date(frm);
	});
}

function generate_visit_schedule(frm) {
	// The whole schedule is known as soon as the delivery date is known -
	// so, unlike ANC's open-ended pregnancy horizon, it can be laid out at
	// once, one row per configured visit - on BOTH the mother and baby
	// tables at once, same dates, since they're checked on the same
	// household visit. Only runs once - if either table already has rows
	// (auto-generated earlier, or added by hand), leave both alone and
	// just recalculate the summary fields.
	if (!frm.doc.date_of_delivery || (frm.doc.mother || []).length || (frm.doc.baby || []).length) {
		calculate_next_pnc_visit_date(frm);
		return;
	}

	get_full_schedule().then((schedule_rows) => {
		schedule_rows.forEach((row) => {
			const window_start = frappe.datetime.add_days(frm.doc.date_of_delivery, row.window_opens_day);
			const window_end = frappe.datetime.add_days(frm.doc.date_of_delivery, row.window_closes_day);
			frm.add_child("mother", { window_start_date: window_start, date: window_end, status: "Pending" });
			frm.add_child("baby", { window_start_date: window_start, date: window_end, status: "Pending" });
		});
		frm.refresh_field("mother");
		frm.refresh_field("baby");
		calculate_next_pnc_visit_date(frm);
	});
}

function ensure_risk_alert_style() {
	if (document.getElementById("pnc-risk-alert-style")) return;
	const style = document.createElement("style");
	style.id = "pnc-risk-alert-style";
	style.textContent = `
		.form-group[data-fieldname="pnc_visit_risk_alert"] .control-value {
			color: #B91C1C !important;
		}
	`;
	document.head.appendChild(style);
}

function set_risk_alert(frm, text) {
	ensure_risk_alert_style();
	frm.set_value("pnc_visit_risk_alert", text || "");
}

// Only the currently open (Pending) urgent follow-up row gets the tint -
// not the row where Risk was originally found (already Completed, nothing
// more to do there), and not an urgent row that's itself been completed.
// Applies to both the "mother" and "baby" tables independently.
const RISK_ROW_CLASS = "pnc-risk-row";

function ensure_risk_row_style() {
	if (document.getElementById("pnc-risk-row-style")) return;
	const style = document.createElement("style");
	style.id = "pnc-risk-row-style";
	style.textContent = `
		.grid-row.${RISK_ROW_CLASS},
		.grid-row.${RISK_ROW_CLASS} .data-row,
		.grid-row.${RISK_ROW_CLASS} .row-data,
		.grid-row.${RISK_ROW_CLASS} .col,
		.grid-row.${RISK_ROW_CLASS} .static-area {
			background-color: #FEE2E2 !important;
		}
	`;
	document.head.appendChild(style);
}

function highlight_risk_rows(frm) {
	ensure_risk_row_style();
	["mother", "baby"].forEach((table_field) => {
		const grid = frm.fields_dict[table_field] && frm.fields_dict[table_field].grid;
		if (!grid || !grid.grid_rows) return;
		grid.grid_rows.forEach((grid_row) => {
			const is_risk = !!grid_row.doc.urgent_followup && grid_row.doc.status !== "Completed";
			if (grid_row.wrapper) {
				grid_row.wrapper.toggleClass(RISK_ROW_CLASS, is_risk);
			}
		});
	});
}

function sync_row_fields(frm, table_field, window_start, window_end) {
	// "Date of Next Visit" is auto-filled on the latest row only. "Next
	// Visit Window" is a plain read-only range shown on every row.
	const rows = frm.doc[table_field] || [];
	let display = "";
	if (window_start && window_end) {
		display = `${frappe.datetime.str_to_user(window_start)} to ${frappe.datetime.str_to_user(window_end)}`;
		if (rows.length) {
			const last_row = rows[rows.length - 1];
			frappe.model.set_value(last_row.doctype, last_row.name, "date_of_next_visit", window_end);
		}
	}
	rows.forEach((row) => {
		row.next_visit_window = display;
	});
	frm.refresh_field(table_field);
}

function compute_track(frm, rows, schedule_rows) {
	// An open Urgent-tagged row on this table always wins first - the
	// actual insertion of this row only happens server-side (on save), but
	// once one exists, the preview needs to respect it too instead of
	// recomputing over it.
	const pending_urgent = rows
		.filter((row) => row.urgent_followup && row.status !== "Completed")
		.sort((a, b) => (a.date > b.date ? 1 : -1))[0];
	if (pending_urgent) {
		const trigger_row_index = rows.indexOf(pending_urgent) - 1;
		const trigger_date = trigger_row_index >= 0 ? rows[trigger_row_index].date : pending_urgent.date;
		return {
			next_date: pending_urgent.date,
			window_start: trigger_date,
			window_end: pending_urgent.date,
			risk_alert: "",
			is_urgent: true,
		};
	}

	// Each visit's window is a direct row lookup from the master's Visit
	// Schedule table - not a repeating interval from the last visit.
	const completed_count = rows.filter((row) => row.status === "Completed").length;
	const window = get_visit_window(completed_count + 1, schedule_rows);
	if (!window) {
		// every visit on this table has been completed
		return { next_date: null, window_start: null, window_end: null, risk_alert: "", is_urgent: false };
	}

	const window_start = frappe.datetime.add_days(frm.doc.date_of_delivery, window.start_offset);
	const window_end = frappe.datetime.add_days(frm.doc.date_of_delivery, window.end_offset);

	// High Risk only, shown in red - a nudge to visit early within the
	// window (from window_start, not window_end). Blank otherwise; the
	// window/due date above are unaffected either way.
	const risk_alert =
		frm.doc.high_risk === "Yes"
			? `Visit by ${frappe.datetime.str_to_user(frappe.datetime.add_days(window_start, window.risk_alert_within_days))}`
			: "";
	return { next_date: window_end, window_start, window_end, risk_alert, is_urgent: false };
}

function calculate_next_pnc_visit_date(frm) {
	if (!frm.doc.date_of_delivery) return;

	get_full_schedule().then((schedule_rows) => {
		// Mother and baby are tracked independently - each gets its own
		// effective next-visit date (an open urgent row if either table has
		// one, otherwise the normal schedule lookup) - but they share the
		// exact same Visit Schedule master, since both are checked on the
		// same household visit. The single shared "Next PNC Visit Date"
		// field always shows whichever of the two tracks is due sooner.
		const mother_track = compute_track(frm, frm.doc.mother || [], schedule_rows);
		const baby_track = compute_track(frm, frm.doc.baby || [], schedule_rows);

		sync_row_fields(frm, "mother", mother_track.window_start, mother_track.window_end);
		sync_row_fields(frm, "baby", baby_track.window_start, baby_track.window_end);

		const candidates = [mother_track, baby_track].filter((t) => t.next_date);
		if (!candidates.length) {
			// every scheduled visit, for both mother and baby, is complete
			frm.set_value("next_pnc_visit_date", null);
			frm.set_value("next_pnc_visit_date_auto", null);
			set_risk_alert(frm, "");
			highlight_risk_rows(frm);
			return;
		}

		// An open urgent row on EITHER track always outranks an ordinary due
		// date on the other, even if that ordinary date is sooner - only
		// once neither track has an open urgent row does "whichever is due
		// sooner" decide it.
		const urgent_candidates = candidates.filter((t) => t.is_urgent);
		const winner = (urgent_candidates.length ? urgent_candidates : candidates).sort((a, b) => (a.next_date > b.next_date ? 1 : -1))[0];
		frm.set_value("next_pnc_visit_date", winner.next_date);
		frm.set_value("next_pnc_visit_date_auto", winner.next_date);
		set_risk_alert(frm, winner.risk_alert);
		highlight_risk_rows(frm);
	});
}

// Copyright (c) 2026, tech4socialsector@azimpremjifoundation.org and contributors
// For license information, please see license.txt

frappe.ui.form.on("Postpartum Reg and Followup", {
	refresh(frm) {
		// Small delay - the grid renders its rows just after refresh fires,
		// so styling immediately would sometimes miss rows not yet drawn.
		setTimeout(() => highlight_risk_rows(frm), 300);
	},
	delivery_date(frm) {
		generate_visit_schedule(frm);
	},
	followup_visits_remove(frm) {
		calculate_next_visit_date(frm);
	},
	followup_visits_add(frm, cdt, cdn) {
		// A row added by hand (rather than by the bulk schedule generator
		// below) still gets its target date filled in from the delivery
		// date - the CHW should never see a blank calendar with no
		// suggested date. A row beyond however many visits are configured
		// simply gets no schedule to fill in from.
		const row = locals[cdt][cdn];
		if (row.date_of_visit || !frm.doc.delivery_date) {
			calculate_next_visit_date(frm);
			return;
		}
		const visit_number = (frm.doc.followup_visits || []).indexOf(row) + 1;
		get_full_schedule().then((schedule_rows) => {
			const window = get_visit_window(visit_number, schedule_rows);
			if (!window) return;
			const window_end = frappe.datetime.add_days(frm.doc.delivery_date, window.end_offset);
			frappe.model.set_value(cdt, cdn, "date_of_visit", window_end);
			calculate_next_visit_date(frm);
		});
	},
});

frappe.ui.form.on("Postpartum Followup", {
	status(frm) {
		calculate_next_visit_date(frm);
	},
	mother_condition(frm) {
		highlight_risk_rows(frm);
	},
	baby_condition(frm) {
		highlight_risk_rows(frm);
	},
});

// Last-resort fallback only, used if the Postpartum Visit Interval Master
// hasn't been configured yet - the real policy always comes from that
// master's Visit Schedule rows. (opens_day, closes_day) per visit,
// 1-indexed by position - visit 1 opens at delivery, visit 2 is the last
// week of a 6-week (42-day) postpartum period.
const DEFAULT_VISIT_SCHEDULE = [
	[0, 7],
	[35, 42],
];
const DEFAULT_RISK_ALERT_DAYS = 1;

function get_full_schedule() {
	// A child table (Postpartum Visit Schedule Row) has no permission rules
	// of its own, so it can't reliably be listed directly from the client -
	// fetched through a whitelisted method on the parent doc instead, which
	// goes through the master's own, already-granted permissions.
	return frappe
		.call({ method: "chw.common.doctype.postpartum_reg_and_followup.postpartum_reg_and_followup.get_visit_schedule" })
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

function generate_visit_schedule(frm) {
	// The whole schedule is known as soon as the delivery date is known -
	// one row per configured visit. Only runs once - if rows already exist
	// (auto-generated earlier, or added by hand), leave them alone and just
	// recalculate the summary fields.
	if (!frm.doc.delivery_date || (frm.doc.followup_visits || []).length) {
		calculate_next_visit_date(frm);
		return;
	}

	get_full_schedule().then((schedule_rows) => {
		schedule_rows.forEach((row) => {
			const window_end = frappe.datetime.add_days(frm.doc.delivery_date, row.window_closes_day);
			frm.add_child("followup_visits", { date_of_visit: window_end, status: "Pending" });
		});
		frm.refresh_field("followup_visits");
		calculate_next_visit_date(frm);
	});
}

function ensure_risk_alert_style() {
	if (document.getElementById("postpartum-risk-alert-style")) return;
	const style = document.createElement("style");
	style.id = "postpartum-risk-alert-style";
	style.textContent = `
		.form-group[data-fieldname="postpartum_risk_alert"] .control-value {
			color: #B91C1C !important;
		}
	`;
	document.head.appendChild(style);
}

function set_risk_alert(frm, text) {
	ensure_risk_alert_style();
	frm.set_value("postpartum_risk_alert", text || "");
}

// Only the currently open (Pending) urgent follow-up row gets the tint -
// not the row where Risk was originally found (already Completed, nothing
// more to do there), and not an urgent row that's itself been completed.
const RISK_ROW_CLASS = "postpartum-risk-row";

function ensure_risk_row_style() {
	if (document.getElementById("postpartum-risk-row-style")) return;
	const style = document.createElement("style");
	style.id = "postpartum-risk-row-style";
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
	const grid = frm.fields_dict.followup_visits && frm.fields_dict.followup_visits.grid;
	if (!grid || !grid.grid_rows) return;
	grid.grid_rows.forEach((grid_row) => {
		const is_risk = !!grid_row.doc.urgent_followup && grid_row.doc.status !== "Completed";
		if (grid_row.wrapper) {
			grid_row.wrapper.toggleClass(RISK_ROW_CLASS, is_risk);
		}
	});
}

function sync_row_fields(frm, window_start, window_end) {
	// "Date of Next Visit" is auto-filled on the latest row only. "Next
	// Visit Window" is a plain read-only range shown on every row.
	const rows = frm.doc.followup_visits || [];
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
	frm.refresh_field("followup_visits");
}

function currently_high_risk(rows) {
	// Live, not sticky - reflects only the most recently COMPLETED visit's
	// own condition, mirroring the server-side calculation exactly.
	const completed = rows.filter((row) => row.status === "Completed");
	if (!completed.length) return false;
	const latest = completed.sort((a, b) => (a.date_of_visit > b.date_of_visit ? 1 : -1))[completed.length - 1];
	return latest.mother_condition === "Risk" || latest.baby_condition === "Risk";
}

function calculate_next_visit_date(frm) {
	if (!frm.doc.delivery_date) return;

	const rows = frm.doc.followup_visits || [];

	// An open Urgent-tagged row always wins first - the actual insertion of
	// this row only happens server-side (on save), but once one exists,
	// the preview needs to respect it too instead of recomputing over it.
	const pending_urgent = rows
		.filter((row) => row.urgent_followup && row.status !== "Completed")
		.sort((a, b) => (a.date_of_visit > b.date_of_visit ? 1 : -1))[0];
	if (pending_urgent) {
		const trigger_row_index = rows.indexOf(pending_urgent) - 1;
		const trigger_date = trigger_row_index >= 0 ? rows[trigger_row_index].date_of_visit : pending_urgent.date_of_visit;
		frm.set_value("next_visit_date", pending_urgent.date_of_visit);
		frm.set_value("next_visit_date_auto", pending_urgent.date_of_visit);
		// The urgent date itself already IS the early-visit signal - no
		// separate alert needed on top of it.
		set_risk_alert(frm, "");
		sync_row_fields(frm, trigger_date, pending_urgent.date_of_visit);
		highlight_risk_rows(frm);
		return;
	}

	const high_risk = currently_high_risk(rows);
	const completed_count = rows.filter((row) => row.status === "Completed").length;
	const visit_number = completed_count + 1;

	get_full_schedule().then((schedule_rows) => {
		const window = get_visit_window(visit_number, schedule_rows);
		if (!window) {
			// every scheduled visit has been completed
			frm.set_value("next_visit_date", null);
			frm.set_value("next_visit_date_auto", null);
			set_risk_alert(frm, "");
			sync_row_fields(frm, null, null);
			highlight_risk_rows(frm);
			return;
		}

		const window_start = frappe.datetime.add_days(frm.doc.delivery_date, window.start_offset);
		const window_end = frappe.datetime.add_days(frm.doc.delivery_date, window.end_offset);

		frm.set_value("next_visit_date", window_end);
		frm.set_value("next_visit_date_auto", window_end);

		// High Risk only, shown in red - a nudge to visit early within the
		// window (from window_start, not window_end). Blank otherwise; the
		// window/due date above are unaffected either way.
		const risk_alert = high_risk
			? `Visit by ${frappe.datetime.str_to_user(frappe.datetime.add_days(window_start, window.risk_alert_within_days))}`
			: "";
		set_risk_alert(frm, risk_alert);
		sync_row_fields(frm, window_start, window_end);
		highlight_risk_rows(frm);
	});
}

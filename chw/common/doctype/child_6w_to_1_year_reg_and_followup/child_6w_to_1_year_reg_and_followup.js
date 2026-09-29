// Copyright (c) 2026, tech4socialsector@azimpremjifoundation.org and contributors
// For license information, please see license.txt

frappe.ui.form.on("Child 6w to 1 Year Reg and Followup", {
	refresh(frm) {
		// Date of Visit defaults to "Today" - a field default doesn't fire
		// the date_of_visit change event below (Frappe only fires that for
		// an actual edit), so a brand new record would otherwise never
		// trigger the bulk schedule generation at all. generate_visit_schedule
		// itself is a safe no-op once rows already exist, so calling it on
		// every refresh is fine - it only ever does something the one time
		// it's actually needed.
		generate_visit_schedule(frm);
		// Small delay - the grid renders its rows just after refresh fires,
		// so styling immediately would sometimes miss rows not yet drawn.
		setTimeout(() => highlight_risk_rows(frm), 300);
	},
	date_of_visit(frm) {
		generate_visit_schedule(frm);
	},
	followup_visits_remove(frm) {
		calculate_next_visit_date(frm);
	},
	followup_visits_add(frm) {
		// Extra rows added by hand beyond the auto-generated schedule don't
		// have an unambiguous "next window" by table position alone (this
		// program's window can start mid-way in for late registration), so
		// - same as ANC - no per-row date guess here, just keep the
		// highlighting current.
		highlight_risk_rows(frm);
	},
});

frappe.ui.form.on("Child 6w to 1 Year Followup", {
	date_of_visit(frm, cdt, cdn) {
		calculate_next_visit_date(frm);
	},
	status(frm) {
		calculate_next_visit_date(frm);
	},
	baby_condition(frm) {
		highlight_risk_rows(frm);
	},
});

function get_window_policy() {
	return frappe.db
		.get_value("Child 6w-1y Visit Interval Master", "Child 6w-1y Visit Interval Master", [
			"interval_days",
			"visits_required_per_window",
			"risk_alert_within_days",
			"automatic_window_count",
		])
		.then((r) => {
			const msg = (r && r.message) || {};
			return {
				window_days: msg.interval_days || 30,
				visits_per_window: msg.visits_required_per_window || 1,
				alert_within_days: msg.risk_alert_within_days || 7,
				automatic_window_count: msg.automatic_window_count || 10,
			};
		});
}

function get_window_index(reference_date, anchor_date, window_days) {
	const days_elapsed = frappe.datetime.get_diff(reference_date, anchor_date);
	if (days_elapsed < 0) return 1;
	return Math.floor(days_elapsed / window_days) + 1;
}

function get_current_window(starting_window, completed_count, visits_per_window) {
	let window = starting_window;
	let remaining = completed_count;
	while (remaining >= visits_per_window) {
		remaining -= visits_per_window;
		window += 1;
	}
	return window;
}

function generate_visit_schedule(frm) {
	if (!frm.doc.date_of_visit || (frm.doc.followup_visits || []).length) {
		calculate_next_visit_date(frm);
		return;
	}

	get_window_policy().then(({ window_days, automatic_window_count }) => {
		const today = frappe.datetime.get_today();
		const starting_window = get_window_index(today, frm.doc.date_of_visit, window_days);

		// Only the remaining automatic-phase windows are pre-filled - a
		// child registered late (already past some windows) gets none of
		// those already-passed ones; the schedule starts from whichever
		// window she's actually in right now.
		for (let idx = starting_window; idx <= automatic_window_count; idx++) {
			const window_start = frappe.datetime.add_days(frm.doc.date_of_visit, (idx - 1) * window_days);
			const window_end = frappe.datetime.add_days(window_start, window_days);
			frm.add_child("followup_visits", {
				date_of_visit: window_end,
				status: "Pending",
			});
		}
		frm.refresh_field("followup_visits");
		calculate_next_visit_date(frm);
	});
}

function ensure_risk_alert_style() {
	if (document.getElementById("child6w1y-risk-alert-style")) return;
	const style = document.createElement("style");
	style.id = "child6w1y-risk-alert-style";
	style.textContent = `
		.form-group[data-fieldname="child_risk_alert"] .control-value {
			color: #B91C1C !important;
		}
	`;
	document.head.appendChild(style);
}

function set_risk_alert(frm, text) {
	ensure_risk_alert_style();
	frm.set_value("child_risk_alert", text || "");
}

// Only the currently open (Pending) urgent follow-up row gets the tint -
// not the row where Risk was originally found (already Completed, nothing
// more to do there), and not an urgent row that's itself been completed.
const RISK_ROW_CLASS = "child6w1y-risk-row";

function ensure_risk_row_style() {
	if (document.getElementById("child6w1y-risk-row-style")) return;
	const style = document.createElement("style");
	style.id = "child6w1y-risk-row-style";
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
	// own Baby Condition, mirroring the server-side calculation exactly.
	const completed = rows.filter((row) => row.status === "Completed");
	if (!completed.length) return false;
	const latest = completed.sort((a, b) => (a.date_of_visit > b.date_of_visit ? 1 : -1))[completed.length - 1];
	return latest.baby_condition === "Risk";
}

function calculate_next_visit_date(frm) {
	if (!frm.doc.date_of_visit) return;

	const rows = frm.doc.followup_visits || [];

	// An open Urgent-tagged row always wins first - the actual insertion of
	// this row only happens server-side (on save), but once one exists,
	// the preview needs to respect it too instead of recomputing over it.
	const pending_urgent = rows
		.filter((row) => row.urgent_followup && row.status !== "Completed")
		.sort((a, b) => (a.date_of_visit > b.date_of_visit ? 1 : -1))[0];
	if (pending_urgent) {
		const trigger_row_index = rows.indexOf(pending_urgent) - 1;
		const trigger_date =
			trigger_row_index >= 0 ? rows[trigger_row_index].date_of_visit : pending_urgent.date_of_visit;
		frm.set_value("next_visit_date", pending_urgent.date_of_visit);
		frm.set_value("next_visit_date_auto", pending_urgent.date_of_visit);
		// The urgent date itself already IS the early-visit signal - no
		// separate alert needed on top of it.
		set_risk_alert(frm, "");
		sync_row_fields(frm, trigger_date, pending_urgent.date_of_visit);
		highlight_risk_rows(frm);
		return;
	}

	get_window_policy().then(({ window_days, visits_per_window, alert_within_days, automatic_window_count }) => {
		const completed_count = rows.filter((row) => row.status === "Completed").length;
		const starting_window = get_window_index(
			frm.doc.creation || frappe.datetime.get_today(),
			frm.doc.date_of_visit,
			window_days
		);
		const current_window = get_current_window(starting_window, completed_count, visits_per_window);

		if (current_window > automatic_window_count) {
			// Every configured window has been covered - done for this child.
			frm.set_value("next_visit_date", null);
			frm.set_value("next_visit_date_auto", null);
			set_risk_alert(frm, "");
			sync_row_fields(frm, null, null);
			highlight_risk_rows(frm);
			return;
		}

		const window_start = frappe.datetime.add_days(frm.doc.date_of_visit, (current_window - 1) * window_days);
		const window_end = frappe.datetime.add_days(window_start, window_days);

		frm.set_value("next_visit_date", window_end);
		frm.set_value("next_visit_date_auto", window_end);

		// High Risk only, shown in red - a nudge to visit early within the
		// window (from window_start, not window_end). Blank otherwise; the
		// window/due date above are unaffected either way.
		const high_risk = currently_high_risk(rows);
		const risk_alert = high_risk
			? `Visit by ${frappe.datetime.str_to_user(frappe.datetime.add_days(window_start, alert_within_days))}`
			: "";
		set_risk_alert(frm, risk_alert);
		sync_row_fields(frm, window_start, window_end);
		highlight_risk_rows(frm);
	});
}

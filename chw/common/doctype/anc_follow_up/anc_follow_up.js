// Copyright (c) 2026, tech4socialsector@azimpremjifoundation.org and contributors
// For license information, please see license.txt

// The three follow-up tables all describe the same patient, just recorded
// by a different staff type. LMP/POG sync and risk-row highlighting apply
// across all three - but the continuous monthly-window SCHEDULE (bulk row
// generation, Next ANC Visit Date, risk alert, urgent follow-up chain) is
// driven by the Nurse table alone. Volunteer and Doctor are open-ended,
// manual logs: Add Row any time, current date/LMP/POG auto-fill, but no
// calculated cadence and no Work Order List connection of their own.
const FOLLOWUP_TABLE_FIELDS = ["anc_followup", "anc_followup_for_nurse", "anc_followup_for_docter"];
const NURSE_TABLE_FIELD = "anc_followup_for_nurse";

// calculate_next_anc_visit_date is triggered from several places (a Nurse
// row's date/status changing, pregnant_id changing) and each run kicks off
// an unawaited chain of async server calls. If it's triggered again before
// an earlier run's chain has resolved, the OLDER call can finish AFTER the
// newer one - overwriting an already-correct, already-saved value with a
// stale result and marking the form dirty again right after a save. This
// token makes only the most recently triggered call actually allowed to
// apply its result; every earlier one quietly no-ops once it resolves.
let anc_visit_date_calc_token = 0;

frappe.ui.form.on("ANC Follow-up", {
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
	pregnant_id(frm) {
		generate_visit_schedule(frm);
	},
	// Volunteer and Doctor are open-ended logs - adding/removing a row there
	// never recalculates the schedule, just keeps the highlight current.
	anc_followup_remove(frm) {
		highlight_risk_rows(frm);
	},
	anc_followup_add(frm, cdt, cdn) {
		fill_new_row_pregnancy_info(frm, cdt, cdn, "anc_followup");
		highlight_risk_rows(frm);
	},
	anc_followup_for_nurse_remove(frm) {
		calculate_next_anc_visit_date(frm);
	},
	anc_followup_for_nurse_add(frm) {
		highlight_risk_rows(frm);
	},
	anc_followup_for_docter_remove(frm) {
		highlight_risk_rows(frm);
	},
	anc_followup_for_docter_add(frm, cdt, cdn) {
		fill_new_row_pregnancy_info(frm, cdt, cdn, "anc_followup_for_docter");
		highlight_risk_rows(frm);
	},
});

function fill_new_row_pregnancy_info(frm, cdt, cdn, table_field) {
	// Volunteer/Doctor rows rely on Date's own field-level "Today" default
	// to auto-fill (a default doesn't fire Date's change event, so
	// sync_row_pog never runs on its own for a freshly added row) - so LMP
	// Date and POG are filled in directly here instead, the moment the row
	// is added, exactly like Nurse's bulk-generated rows already get them.
	if (!frm.doc.pregnant_id) return;
	const row = locals[cdt][cdn];
	get_pregnancy_info(frm.doc.pregnant_id).then((info) => {
		if (!info.lmp_date) return;
		const as_of_date = row.date || frappe.datetime.get_today();
		// Mutate the row object directly and force a full grid re-render -
		// frappe.model.set_value's own change-event/trigger chain wasn't
		// reliably repainting these particular (read-only) grid cells, so
		// this bypasses that entirely instead of depending on it.
		row.lmp_date = info.lmp_date;
		row.pog_weeks = calculate_pog(info.lmp_date, as_of_date);
		frm.refresh_field(table_field);
	});
}

const CHILD_DOCTYPE_TO_TABLE_FIELD = {
	"ANC Followup Child": "anc_followup",
	"ANC Followup Nurse": "anc_followup_for_nurse",
	"ANC Followup Docter": "anc_followup_for_docter",
};

function register_followup_table_events(child_doctype, drives_schedule) {
	const table_field = CHILD_DOCTYPE_TO_TABLE_FIELD[child_doctype];
	frappe.ui.form.on(child_doctype, {
		date(frm, cdt, cdn) {
			sync_row_pog(frm, cdt, cdn, drives_schedule, table_field);
		},
		status(frm) {
			if (drives_schedule) calculate_next_anc_visit_date(frm);
		},
		patient_condition(frm) {
			highlight_risk_rows(frm);
		},
	});
}

register_followup_table_events("ANC Followup Child", false);
register_followup_table_events("ANC Followup Nurse", true);
register_followup_table_events("ANC Followup Docter", false);

// Only the currently open (Pending) urgent follow-up row gets the tint -
// not the row where Risk was originally found (already Completed, nothing
// more to do there), and not an urgent row that's itself been completed.
// Only the Nurse table ever actually has an urgent row now, but this stays
// general across all three tables so nothing breaks if that ever changes.
const RISK_ROW_CLASS = "anc-risk-row";

function ensure_risk_row_style() {
	if (document.getElementById("anc-risk-row-style")) return;
	const style = document.createElement("style");
	style.id = "anc-risk-row-style";
	// Several nested cells inside a grid row paint their own background
	// (notably the last column, and each cell's static-display area), which
	// would otherwise sit on top of a plain row-level background and hide
	// it - so every layer that can paint white gets overridden here too,
	// except actual open input/select controls (leave those alone so an
	// actively edited cell doesn't look broken).
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
	FOLLOWUP_TABLE_FIELDS.forEach((table_field) => {
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

function get_pregnancy_info(pregnant_id) {
	return frappe.db.get_value("Pregnancy Registration", pregnant_id, ["lmp_date", "high_risk"]).then((r) => r.message || {});
}

function get_window_policy() {
	// ANC Visit Interval Master is a one-time-setup Single - one policy,
	// the same for every patient regardless of High Risk status (that
	// field only controls whether the Risk Alert nudge is shown, not which
	// cadence applies).
	return frappe.db
		.get_value("ANC Visit Interval Master", "ANC Visit Interval Master", [
			"interval_days",
			"visits_required_per_window",
			"risk_alert_within_days",
			"automatic_window_count",
		])
		.then((r) => {
			const msg = r.message || {};
			return {
				window_days: msg.interval_days || 30,
				visits_per_window: msg.visits_required_per_window || 1,
				alert_within_days: msg.risk_alert_within_days || 7,
				automatic_window_count: msg.automatic_window_count || 6,
			};
		});
}

function get_window_index(reference_date, lmp_date, window_days) {
	const days_elapsed = frappe.datetime.get_diff(reference_date, lmp_date);
	if (days_elapsed < 0) return 1;
	return Math.floor(days_elapsed / window_days) + 1;
}

function get_current_window(starting_window, completed_count, visits_per_window) {
	// A window only closes once its quota of completed visits is met.
	let window = starting_window;
	let remaining = completed_count;
	while (remaining >= visits_per_window) {
		remaining -= visits_per_window;
		window += 1;
	}
	return window;
}

function calculate_pog(lmp_date, as_of_date) {
	const days_pregnant = frappe.datetime.get_diff(as_of_date, lmp_date);
	if (days_pregnant < 0) return "";
	const weeks = Math.floor(days_pregnant / 7);
	const days = days_pregnant % 7;
	return `${weeks} weeks ${days} days`;
}

function sync_row_pog(frm, cdt, cdn, drives_schedule, table_field) {
	const row = locals[cdt][cdn];
	if (!frm.doc.pregnant_id) return;

	get_pregnancy_info(frm.doc.pregnant_id).then((info) => {
		if (!info.lmp_date) return;
		// See fill_new_row_pregnancy_info - mutate the row directly and
		// force a re-render, rather than relying on frappe.model.set_value's
		// own trigger chain to repaint these read-only grid cells.
		row.lmp_date = info.lmp_date;
		row.pog_weeks = row.date ? calculate_pog(info.lmp_date, row.date) : "";
		frm.refresh_field(table_field);
	});
	if (drives_schedule) calculate_next_anc_visit_date(frm);
}

function generate_visit_schedule(frm) {
	const nurse_field = frm.fields_dict[NURSE_TABLE_FIELD];
	// If an org has hidden the Nurse table too (unusual, but possible via
	// Customize Form), there's no schedule to generate at all.
	const nurse_hidden = !nurse_field || nurse_field.df.hidden;
	const already_has_rows = (frm.doc[NURSE_TABLE_FIELD] || []).length;
	if (!frm.doc.pregnant_id || nurse_hidden || already_has_rows) {
		calculate_next_anc_visit_date(frm);
		return;
	}

	get_pregnancy_info(frm.doc.pregnant_id).then((info) => {
		if (!info.lmp_date) return;

		get_window_policy().then(({ window_days, automatic_window_count }) => {
			const today = frappe.datetime.get_today();
			const starting_window = get_window_index(today, info.lmp_date, window_days);

			// Only the remaining automatic-phase windows are pre-filled - a
			// patient who registers late (already past the automatic window
			// count) gets none of these; she starts straight in the manual
			// phase instead.
			for (let idx = starting_window; idx <= automatic_window_count; idx++) {
				const window_start = frappe.datetime.add_days(info.lmp_date, (idx - 1) * window_days);
				const window_end = frappe.datetime.add_days(window_start, window_days);
				frm.add_child(NURSE_TABLE_FIELD, {
					window_start_date: window_start,
					date: window_end,
					status: "Pending",
					lmp_date: info.lmp_date,
					pog_weeks: calculate_pog(info.lmp_date, window_end),
				});
			}
			frm.refresh_field(NURSE_TABLE_FIELD);
			calculate_next_anc_visit_date(frm);
		});
	});
}

function ensure_risk_alert_style() {
	if (document.getElementById("anc-risk-alert-style")) return;
	const style = document.createElement("style");
	style.id = "anc-risk-alert-style";
	style.textContent = `
		.form-group[data-fieldname="next_anc_visit_risk_alert"] .control-value {
			color: #B91C1C !important;
		}
	`;
	document.head.appendChild(style);
}

function set_risk_alert(frm, text) {
	ensure_risk_alert_style();
	frm.set_value("next_anc_visit_risk_alert", text || "");
}

function sync_child_row_fields(frm, window_start, window_end) {
	// "Date of Next Visit" and "Next Visit Window" are auto-filled on the
	// Nurse table only - Volunteer's and Doctor's own "Date of Next Visit"
	// fields (where present) are left purely to manual entry.
	let display = "";
	if (window_start && window_end) {
		display = `${frappe.datetime.str_to_user(window_start)} to ${frappe.datetime.str_to_user(window_end)}`;
	}

	const rows = frm.doc[NURSE_TABLE_FIELD] || [];
	if (window_start && window_end && rows.length) {
		const last_row = rows[rows.length - 1];
		frappe.model.set_value(last_row.doctype, last_row.name, "date_of_next_visit", window_end);
	}
	rows.forEach((row) => {
		row.next_visit_window = display;
	});
	frm.refresh_field(NURSE_TABLE_FIELD);
}

function get_pending_urgent(frm) {
	// An open Urgent-tagged row always wins first - the actual insertion of
	// this row only happens server-side (on save), but once one exists, the
	// preview needs to respect it too instead of recomputing over it. Only
	// the Nurse table ever gets one.
	const rows = frm.doc[NURSE_TABLE_FIELD] || [];
	const pending_urgent = rows
		.filter((row) => row.urgent_followup && row.status !== "Completed")
		.sort((a, b) => (a.date > b.date ? 1 : -1))[0];
	if (!pending_urgent) return null;

	const trigger_row_index = rows.indexOf(pending_urgent) - 1;
	const trigger_date = trigger_row_index >= 0 ? rows[trigger_row_index].date : pending_urgent.date;
	return { date: pending_urgent.date, trigger_date };
}

function calculate_next_anc_visit_date(frm) {
	const my_token = ++anc_visit_date_calc_token;

	if (frm.doc.status === "Closed") {
		// She's delivered - no more ANC visits are due.
		frm.set_value("next_anc_visit_date", null);
		frm.set_value("next_anc_visit_date_auto", null);
		set_risk_alert(frm, "");
		sync_child_row_fields(frm, null, null);
		return;
	}
	if (!frm.doc.pregnant_id) return;

	const pending_urgent = get_pending_urgent(frm);
	if (pending_urgent) {
		frm.set_value("next_anc_visit_date", pending_urgent.date);
		frm.set_value("next_anc_visit_date_auto", pending_urgent.date);
		// The urgent date itself already IS the early-visit signal - no
		// separate alert needed on top of it.
		set_risk_alert(frm, "");
		sync_child_row_fields(frm, pending_urgent.trigger_date, pending_urgent.date);
		return;
	}

	get_pregnancy_info(frm.doc.pregnant_id).then((info) => {
		if (!info.lmp_date) return;

		get_window_policy().then(({ window_days, visits_per_window, alert_within_days, automatic_window_count }) => {
			// A newer call to this function has started since this chain
			// began - let that one's result stand instead of overwriting it
			// with this now-stale one.
			if (my_token !== anc_visit_date_calc_token) return;

			const completed_count = (frm.doc[NURSE_TABLE_FIELD] || []).filter((row) => row.status === "Completed").length;
			const starting_window = get_window_index(
				frm.doc.creation || frappe.datetime.get_today(),
				info.lmp_date,
				window_days
			);
			const current_window = get_current_window(starting_window, completed_count, visits_per_window);
			const window_start = frappe.datetime.add_days(info.lmp_date, (current_window - 1) * window_days);
			const window_end = frappe.datetime.add_days(window_start, window_days);

			// High Risk only, shown in red - a nudge to visit early within
			// the window. Blank for Normal patients; the window/due date
			// above are unaffected either way.
			const risk_alert =
				info.high_risk === "Yes"
					? `Visit by ${frappe.datetime.str_to_user(frappe.datetime.add_days(window_start, alert_within_days))}`
					: "";

			if (current_window <= automatic_window_count) {
				frm.set_value("next_anc_visit_date", window_end);
				frm.set_value("next_anc_visit_date_auto", window_end);
				set_risk_alert(frm, risk_alert);
				sync_child_row_fields(frm, window_start, window_end);
				return;
			}

			// Manual phase - whichever Nurse row has the most recently
			// visited date's "Date of Next Visit" wins. Until she has
			// actually recorded one, never leave this blank - show her
			// current month's window (from LMP) as a starting suggestion.
			const current = frm.doc.next_anc_visit_date;
			const last_auto = frm.doc.next_anc_visit_date_auto;
			if (current && last_auto && current !== last_auto) {
				// user has manually overridden the date; leave it alone - it's
				// no longer a calculated window, so there's no range or alert
				// to show.
				set_risk_alert(frm, "");
				sync_child_row_fields(frm, null, null);
				return;
			}

			const manual_rows = (frm.doc[NURSE_TABLE_FIELD] || []).filter((row) => row.date_of_next_visit);
			if (!manual_rows.length) {
				frm.set_value("next_anc_visit_date", window_end);
				frm.set_value("next_anc_visit_date_auto", window_end);
				set_risk_alert(frm, risk_alert);
				sync_child_row_fields(frm, window_start, window_end);
				return;
			}

			const latest_row = manual_rows.sort((a, b) => (a.date > b.date ? 1 : -1))[manual_rows.length - 1];
			frm.set_value("next_anc_visit_date", latest_row.date_of_next_visit);
			frm.set_value("next_anc_visit_date_auto", latest_row.date_of_next_visit);
			// A manually typed date isn't a calculated window either.
			set_risk_alert(frm, "");
			sync_child_row_fields(frm, null, null);
		});
	});
}

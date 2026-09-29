// Copyright (c) 2026, tech4socialsector@azimpremjifoundation.org and contributors
// For license information, please see license.txt

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
});

frappe.ui.form.on("ANC Followup Child", {
	date(frm, cdt, cdn) {
		sync_row_pog(frm, cdt, cdn);
	},
	status(frm) {
		calculate_next_anc_visit_date(frm);
	},
	patient_condition(frm) {
		highlight_risk_rows(frm);
	},
});

frappe.ui.form.on("ANC Follow-up", {
	anc_followup_remove(frm) {
		calculate_next_anc_visit_date(frm);
	},
	anc_followup_add(frm) {
		highlight_risk_rows(frm);
	},
});

// Only the currently open (Pending) urgent follow-up row gets the tint -
// not the row where Risk was originally found (already Completed, nothing
// more to do there), and not an urgent row that's itself been completed. If
// that completed urgent row also found Risk again, a new urgent row chains
// off it and the highlight moves there - never two rows lit up at once.
// Applies uniformly across the whole table, automatic phase or manual.
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
	const grid = frm.fields_dict.anc_followup && frm.fields_dict.anc_followup.grid;
	if (!grid || !grid.grid_rows) return;

	grid.grid_rows.forEach((grid_row) => {
		const is_risk = !!grid_row.doc.urgent_followup && grid_row.doc.status !== "Completed";
		if (grid_row.wrapper) {
			grid_row.wrapper.toggleClass(RISK_ROW_CLASS, is_risk);
		}
	});
}

function get_pregnancy_info(pregnant_id) {
	return frappe.db.get_value("Pregnancy Registration", pregnant_id, ["lmp_date", "high_risk"]).then((r) => r.message || {});
}

function get_window_policy(high_risk) {
	return frappe.db
		.get_value("ANC Visit Interval Master", high_risk || "No", [
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

function sync_row_pog(frm, cdt, cdn) {
	const row = locals[cdt][cdn];
	if (!frm.doc.pregnant_id) return;

	get_pregnancy_info(frm.doc.pregnant_id).then((info) => {
		if (!info.lmp_date) return;
		frappe.model.set_value(cdt, cdn, "lmp_date", info.lmp_date);
		frappe.model.set_value(cdt, cdn, "pog_weeks", row.date ? calculate_pog(info.lmp_date, row.date) : "");
	});
	calculate_next_anc_visit_date(frm);
}

function generate_visit_schedule(frm) {
	if (!frm.doc.pregnant_id || (frm.doc.anc_followup || []).length) {
		calculate_next_anc_visit_date(frm);
		return;
	}

	get_pregnancy_info(frm.doc.pregnant_id).then((info) => {
		if (!info.lmp_date) return;

		get_window_policy(info.high_risk).then(({ window_days, automatic_window_count }) => {
			const today = frappe.datetime.get_today();
			const starting_window = get_window_index(today, info.lmp_date, window_days);

			// Only the remaining automatic-phase windows are pre-filled - a
			// patient who registers late (already past the automatic window
			// count) gets none of these; she starts straight in the manual
			// phase instead.
			for (let idx = starting_window; idx <= automatic_window_count; idx++) {
				const window_start = frappe.datetime.add_days(info.lmp_date, (idx - 1) * window_days);
				const window_end = frappe.datetime.add_days(window_start, window_days);
				frm.add_child("anc_followup", {
					date: window_end,
					status: "Pending",
					lmp_date: info.lmp_date,
					pog_weeks: calculate_pog(info.lmp_date, window_end),
				});
			}
			frm.refresh_field("anc_followup");
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
	// "Date of Next Visit" is auto-filled on the latest row only - a genuine
	// manual entry on an earlier row, or a fresh row she adds herself later,
	// is never overwritten by this. "Next Visit Window" is a plain read-only
	// range shown on every row.
	const rows = frm.doc.anc_followup || [];
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
	frm.refresh_field("anc_followup");
}

function calculate_next_anc_visit_date(frm) {
	if (frm.doc.status === "Closed") {
		// She's delivered - no more ANC visits are due.
		frm.set_value("next_anc_visit_date", null);
		frm.set_value("next_anc_visit_date_auto", null);
		set_risk_alert(frm, "");
		sync_child_row_fields(frm, null, null);
		return;
	}
	if (!frm.doc.pregnant_id) return;

	// An open Urgent-tagged row always wins first - the actual insertion of
	// this row only happens server-side (on save), but once one exists,
	// the preview needs to respect it too instead of recomputing over it.
	const rows = frm.doc.anc_followup || [];
	const pending_urgent = rows
		.filter((row) => row.urgent_followup && row.status !== "Completed")
		.sort((a, b) => (a.date > b.date ? 1 : -1))[0];
	if (pending_urgent) {
		const trigger_row_index = rows.indexOf(pending_urgent) - 1;
		const trigger_date = trigger_row_index >= 0 ? rows[trigger_row_index].date : pending_urgent.date;
		frm.set_value("next_anc_visit_date", pending_urgent.date);
		frm.set_value("next_anc_visit_date_auto", pending_urgent.date);
		// The urgent date itself already IS the early-visit signal - no
		// separate alert needed on top of it.
		set_risk_alert(frm, "");
		sync_child_row_fields(frm, trigger_date, pending_urgent.date);
		return;
	}

	get_pregnancy_info(frm.doc.pregnant_id).then((info) => {
		if (!info.lmp_date) return;

		get_window_policy(info.high_risk).then(({ window_days, visits_per_window, alert_within_days, automatic_window_count }) => {
			const completed_count = (frm.doc.anc_followup || []).filter((row) => row.status === "Completed").length;
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

			// Manual phase - the CHW's own "Date of Next Visit" on the latest
			// dated row wins, same as the original design. Until she's
			// actually recorded one, never leave this blank - show her
			// current month's window (from POG) as a starting suggestion.
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

			const manual_rows = (frm.doc.anc_followup || []).filter((row) => row.date_of_next_visit);
			if (!manual_rows.length) {
				frm.set_value("next_anc_visit_date", window_end);
				frm.set_value("next_anc_visit_date_auto", window_end);
				set_risk_alert(frm, risk_alert);
				sync_child_row_fields(frm, window_start, window_end);
				return;
			}

			const calculated_date = manual_rows[manual_rows.length - 1].date_of_next_visit;
			frm.set_value("next_anc_visit_date", calculated_date);
			frm.set_value("next_anc_visit_date_auto", calculated_date);
			// The CHW's own manually typed date isn't a calculated window either.
			set_risk_alert(frm, "");
			sync_child_row_fields(frm, null, null);
		});
	});
}

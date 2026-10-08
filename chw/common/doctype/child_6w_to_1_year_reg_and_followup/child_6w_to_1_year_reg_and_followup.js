// Copyright (c) 2026, tech4socialsector@azimpremjifoundation.org and contributors
// For license information, please see license.txt

frappe.ui.form.on("Child 6w to 1 Year Reg and Followup", {
	refresh(frm) {
		// date_of_birth is a fetch_from field - fetches don't fire their
		// own change event (Frappe only fires that for an actual typed
		// edit), so a brand new record would otherwise never trigger the
		// bulk schedule generation at all. generate_visit_schedule itself
		// is a safe no-op once rows already exist, so calling it on every
		// refresh is fine - it only ever does something the one time it's
		// actually needed.
		generate_visit_schedule(frm);
		// Small delay - the grid renders its rows just after refresh fires,
		// so styling immediately would sometimes miss rows not yet drawn.
		setTimeout(() => highlight_risk_rows(frm), 300);
	},
	birth_registration_id(frm) {
		// date_of_birth is fetched from this field a moment later.
		setTimeout(() => generate_visit_schedule(frm), 300);
	},
	date_of_birth(frm) {
		generate_visit_schedule(frm);
	},
	delivery_date(frm) {
		// The schedule's fallback anchor whenever no Birth Registration is
		// linked - see get_birth_date() below.
		generate_visit_schedule(frm);
	},
	followup_visits_remove(frm) {
		calculate_next_visit_date(frm);
	},
	followup_visits_add(frm, cdt, cdn) {
		// A row added by hand (rather than by the bulk schedule generator
		// below) still gets its target date and milestone label filled in
		// from the child's date of birth, matching whichever position it
		// lands in - the CHW should never see a blank calendar with no
		// suggested date.
		fill_new_row_date(frm, cdt, cdn);
	},
});

frappe.ui.form.on("Child 6w to 1 Year Followup", {
	date_of_visit(frm, cdt, cdn) {
		calculate_row_baby_age(frm, cdt, cdn);
		calculate_next_visit_date(frm);
	},
	status(frm) {
		calculate_next_visit_date(frm);
	},
	baby_condition(frm) {
		highlight_risk_rows(frm);
	},
});

// Last-resort fallback only, used if Child 6w-1y Visit Interval Master
// hasn't been configured yet - the real policy always comes from that
// master's Visit Schedule rows. (label, opens_day, closes_day), counted
// from the child's own date of birth (birth day itself = 0).
const DEFAULT_VISIT_SCHEDULE = [
	["6th Week", 35, 42],
	["10th Week", 63, 70],
	["12th Week", 77, 84],
	["14th Week", 91, 98],
	["6th Month", 150, 180],
	["9th Month", 240, 270],
	["12th Month", 330, 360],
	["18th Month", 510, 540],
];
const DEFAULT_RISK_ALERT_DAYS = 7;

function get_full_schedule() {
	// A child table (Child 6w-1y Visit Schedule Row) has no permission
	// rules of its own, so it can't reliably be listed directly from the
	// client - fetched through a whitelisted method on the parent doc here,
	// which goes through the master's own, already-granted permissions.
	return frappe
		.call({
			method:
				"chw.common.doctype.child_6w_to_1_year_reg_and_followup.child_6w_to_1_year_reg_and_followup.get_visit_schedule",
		})
		.then((r) => {
			const rows = r && r.message;
			if (rows && rows.length) return rows;
			return DEFAULT_VISIT_SCHEDULE.map(([label, opens, closes]) => ({
				milestone_label: label,
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
		milestone_label: row.milestone_label,
		start_offset: row.window_opens_day,
		end_offset: row.window_closes_day,
		risk_alert_within_days: row.risk_alert_within_days || DEFAULT_RISK_ALERT_DAYS,
	};
}

function get_birth_date(frm) {
	// Date of Birth (fetched from a linked Birth Registration) is the
	// preferred source, but it's optional - Delivery Date, already a plain
	// manual field on this form, works just as well as the schedule's
	// anchor whenever no Birth Registration is linked.
	return frm.doc.date_of_birth || frm.doc.delivery_date;
}

function calculate_row_baby_age(frm, cdt, cdn) {
	// "X months Y days" as of this row's own Visit Ending Date, counted
	// from the child's actual Date of Birth - a month counted as 30 days,
	// same flat convention used everywhere else in this app (visit windows,
	// POG). The server recalculates this again on save as a backstop.
	const row = locals[cdt][cdn];
	const birth_date = get_birth_date(frm);
	if (!birth_date || !row.date_of_visit) {
		frappe.model.set_value(cdt, cdn, "baby_age", "");
		return;
	}
	const total_days = frappe.datetime.get_diff(row.date_of_visit, birth_date);
	if (total_days < 0) {
		frappe.model.set_value(cdt, cdn, "baby_age", "");
		return;
	}
	const months = Math.floor(total_days / 30);
	const days = total_days % 30;
	frappe.model.set_value(cdt, cdn, "baby_age", `${months} months ${days} days`);
}

function fill_new_row_date(frm, cdt, cdn) {
	const row = locals[cdt][cdn];
	const birth_date = get_birth_date(frm);
	if (row.date_of_visit || !birth_date) {
		calculate_next_visit_date(frm);
		return;
	}
	const visit_number = (frm.doc.followup_visits || []).indexOf(row) + 1;
	get_full_schedule().then((schedule_rows) => {
		const window = get_visit_window(visit_number, schedule_rows);
		if (!window) return;
		const window_start = frappe.datetime.add_days(birth_date, window.start_offset);
		const window_end = frappe.datetime.add_days(birth_date, window.end_offset);
		frappe.model.set_value(cdt, cdn, "window_start_date", window_start);
		frappe.model.set_value(cdt, cdn, "date_of_visit", window_end);
		frappe.model.set_value(cdt, cdn, "milestone_label", window.milestone_label);
		calculate_next_visit_date(frm);
	});
}

function generate_visit_schedule(frm) {
	// The whole schedule is known as soon as the birth date is known - so,
	// like PNC, it can be laid out at once, one row per configured visit.
	// Only runs once - if the table already has rows (auto-generated
	// earlier, or added by hand), leave it alone and just recalculate the
	// summary fields.
	const birth_date = get_birth_date(frm);
	if (!birth_date || (frm.doc.followup_visits || []).length) {
		calculate_next_visit_date(frm);
		return;
	}

	get_full_schedule().then((schedule_rows) => {
		schedule_rows.forEach((row) => {
			const window_start = frappe.datetime.add_days(birth_date, row.window_opens_day);
			const window_end = frappe.datetime.add_days(birth_date, row.window_closes_day);
			// frm.add_child() doesn't fire field change events (unlike
			// frappe.model.set_value), so baby_age is computed inline here
			// rather than relying on the date_of_visit trigger above.
			const total_days = frappe.datetime.get_diff(window_end, birth_date);
			const baby_age = `${Math.floor(total_days / 30)} months ${total_days % 30} days`;
			frm.add_child("followup_visits", {
				milestone_label: row.milestone_label,
				window_start_date: window_start,
				date_of_visit: window_end,
				baby_age: baby_age,
				status: "Pending",
			});
		});
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
	const birth_date = get_birth_date(frm);
	if (!birth_date) return;

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

	get_full_schedule().then((schedule_rows) => {
		const completed_count = rows.filter((row) => row.status === "Completed").length;
		const window = get_visit_window(completed_count + 1, schedule_rows);

		if (!window) {
			// Every configured visit has been completed - done for this child.
			frm.set_value("next_visit_date", null);
			frm.set_value("next_visit_date_auto", null);
			set_risk_alert(frm, "");
			sync_row_fields(frm, null, null);
			highlight_risk_rows(frm);
			return;
		}

		const window_start = frappe.datetime.add_days(birth_date, window.start_offset);
		const window_end = frappe.datetime.add_days(birth_date, window.end_offset);

		frm.set_value("next_visit_date", window_end);
		frm.set_value("next_visit_date_auto", window_end);

		// High Risk only, shown in red - a nudge to visit early within the
		// window (from window_start, not window_end). Blank otherwise; the
		// window/due date above are unaffected either way.
		const high_risk = currently_high_risk(rows);
		const risk_alert = high_risk
			? `Visit by ${frappe.datetime.str_to_user(frappe.datetime.add_days(window_start, window.risk_alert_within_days))}`
			: "";
		set_risk_alert(frm, risk_alert);
		sync_row_fields(frm, window_start, window_end);
		highlight_risk_rows(frm);
	});
}

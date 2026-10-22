// Copyright (c) 2026, tech4socialsector@azimpremjifoundation.org and contributors
// For license information, please see license.txt

// The three follow-up tables all describe the same patient, just recorded
// by a different staff type. LMP/POG sync and risk-row highlighting apply
// across all three - but the continuous monthly-window SCHEDULE (bulk row
// generation, Next ANC Visit Date, risk alert, urgent follow-up chain) is
// driven by the Volunteer table alone. Nurse and Doctor are open-ended,
// manual logs: Add Row any time, current date/LMP/POG auto-fill, but no
// calculated cadence and no My Work connection of their own.
const FOLLOWUP_TABLE_FIELDS = ["anc_followup", "anc_followup_for_nurse", "anc_followup_for_docter"];
const VOLUNTEER_TABLE_FIELD = "anc_followup";

// Lab Investigations lives only on Nurse's and Doctor's rows (never
// Volunteer's) - filled once per trimester, by whichever of the two gets
// there first, then mirrored onto every row of both tables so it reads the
// same everywhere and is locked from further edits for the rest of that
// trimester. Mirrors chw.common.doctype.anc_follow_up.anc_follow_up's own
// sync_lab_investigations() - the server re-derives the same thing on save
// regardless, this just keeps the live preview in step with it (same thing
// the Vue app's ancFollowUp.js hook does).
const LAB_INVESTIGATION_TABLE_FIELDS = ["anc_followup_for_nurse", "anc_followup_for_docter"];
const LAB_INVESTIGATION_GROUPS = [
	{
		trimester: 1,
		fields: ["hb", "blood_group", "platelet_count", "hiv", "hbsag", "hcv", "vdrl", "hba1c__grbs", "tsh", "urine_r__e"],
		status_field: "lab_1st_trimester_status",
		filled_by_field: "lab_1st_trimester_filled_by",
	},
	{ trimester: 2, fields: ["hb_2nd", "bs", "urine"], status_field: "lab_2nd_trimester_status", filled_by_field: "lab_2nd_trimester_filled_by" },
	{ trimester: 3, fields: ["hb_3rd", "bs_3rd", "grbs_3rd"], status_field: "lab_3rd_trimester_status", filled_by_field: "lab_3rd_trimester_filled_by" },
];

// Scan Investigations - same mirror-and-lock mechanic as Lab Investigations,
// minus the trimester gate: every group is open from the start, since each
// scan happens at its own point in the pregnancy, not along trimester lines.
const SCAN_INVESTIGATION_GROUPS = [
	{ fields: ["date_of_scan", "ga_us", "ga_at_scan", "edd_by_us"], status_field: "scan_dating_status", filled_by_field: "scan_dating_filled_by" },
	{ fields: ["d_o_s", "ga", "normal_or_abnormal", "if_abnormal"], status_field: "scan_nt_status", filled_by_field: "scan_nt_filled_by" },
	{ fields: ["date_of_scan_copy", "ga_copy", "normal_or_abnormal_copy", "if_abnormal_copy"], status_field: "scan_anatomy_status", filled_by_field: "scan_anatomy_filled_by" },
	{
		fields: ["date_of_scan_copy_copy", "ga_copy_copy", "position", "cephalic", "growth", "if_abnormal_copy_copy"],
		status_field: "scan_growth_status",
		filled_by_field: "scan_growth_filled_by",
	},
];

// calculate_next_anc_visit_date is triggered from several places (a
// Volunteer row's date/status changing, pregnant_id changing) and each run
// kicks off
// an unawaited chain of async server calls. If it's triggered again before
// an earlier run's chain has resolved, the OLDER call can finish AFTER the
// newer one - overwriting an already-correct, already-saved value with a
// stale result and marking the form dirty again right after a save. This
// token makes only the most recently triggered call actually allowed to
// apply its result; every earlier one quietly no-ops once it resolves.
let anc_visit_date_calc_token = 0;

frappe.ui.form.on("ANC Follow-up", {
	setup(frm) {
		// Only pregnancies registered for a family member - Pregnancy
		// Registration only accepts women, so this lists women only.
		frm.set_query("pregnant_id", () => ({
			filters: { familymember_id: ["is", "set"] },
		}));
	},
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
		// A new record opened from Pregnancy Registration's own "New ANC
		// Follow-up" link arrives with Pregnant ID already filled in via the
		// route - which never fires the pregnant_id(frm) handler below, so
		// without this the Volunteer schedule would never get generated.
		if (frm.is_new() && frm.doc.pregnant_id && !(frm.doc[VOLUNTEER_TABLE_FIELD] || []).length) {
			generate_visit_schedule(frm);
		}
	},
	refresh(frm) {
		// Small delay - the grid renders its rows just after refresh fires,
		// so styling immediately would sometimes miss rows not yet drawn.
		setTimeout(() => highlight_risk_rows(frm), 300);

		if (!frm.is_new()) {
			frm.add_custom_button(__("Investigation Status"), () => show_investigation_status(frm));
		}
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
		sync_lab_investigations(frm);
		sync_scan_investigations(frm);
	},
	// Nurse and Doctor are open-ended logs - adding/removing a row there
	// never recalculates the schedule, just keeps the highlight current.
	anc_followup_remove(frm) {
		calculate_next_anc_visit_date(frm);
	},
	anc_followup_add(frm, cdt, cdn) {
		// Only reached in the manual phase (bulk auto-generation already
		// fills every automatic-phase row itself) - Window Start is read-only
		// and has no DB default, so unlike Nurse/Doctor it would otherwise
		// stay blank forever on a hand-added row.
		const row = locals[cdt][cdn];
		row.window_start_date = frappe.datetime.get_today();
		frm.refresh_field(VOLUNTEER_TABLE_FIELD);
		fill_new_row_pregnancy_info(frm, cdt, cdn, VOLUNTEER_TABLE_FIELD);
		highlight_risk_rows(frm);
	},
	anc_followup_for_nurse_remove(frm) {
		highlight_risk_rows(frm);
	},
	anc_followup_for_nurse_add(frm, cdt, cdn) {
		fill_new_row_pregnancy_info(frm, cdt, cdn, "anc_followup_for_nurse");
		sync_lab_investigations(frm);
		sync_scan_investigations(frm);
		highlight_risk_rows(frm);
	},
	anc_followup_for_docter_remove(frm) {
		highlight_risk_rows(frm);
	},
	anc_followup_for_docter_add(frm, cdt, cdn) {
		fill_new_row_pregnancy_info(frm, cdt, cdn, "anc_followup_for_docter");
		sync_lab_investigations(frm);
		sync_scan_investigations(frm);
		highlight_risk_rows(frm);
	},
});

function fill_new_row_pregnancy_info(frm, cdt, cdn, table_field) {
	// Nurse/Doctor rows rely on Date's own field-level "Today" default to
	// auto-fill (a default doesn't fire Date's change event, so sync_row_pog
	// never runs on its own for a freshly added row) - so LMP Date and POG
	// are filled in directly here instead, the moment the row is added.
	// Volunteer's own Date has no default at all (it's either calculated by
	// the schedule or typed in by hand), so this also covers that case.
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
	const handlers = {
		date(frm, cdt, cdn) {
			sync_row_pog(frm, cdt, cdn, drives_schedule, table_field);
		},
		status(frm) {
			if (drives_schedule) calculate_next_anc_visit_date(frm);
		},
		patient_condition(frm) {
			highlight_risk_rows(frm);
		},
	};
	// Live preview of the Lab/Scan Investigation lock/mirror, same as the
	// Vue app's hook - Nurse and Doctor only, never Volunteer.
	if (LAB_INVESTIGATION_TABLE_FIELDS.includes(table_field)) {
		LAB_INVESTIGATION_GROUPS.forEach((group) => {
			group.fields.forEach((fieldname) => {
				handlers[fieldname] = (frm) => sync_lab_investigations(frm);
			});
		});
		SCAN_INVESTIGATION_GROUPS.forEach((group) => {
			group.fields.forEach((fieldname) => {
				handlers[fieldname] = (frm) => sync_scan_investigations(frm);
			});
		});
	}
	frappe.ui.form.on(child_doctype, handlers);
}

register_followup_table_events("ANC Followup Child", true);
register_followup_table_events("ANC Followup Nurse", false);
register_followup_table_events("ANC Followup Docter", false);

// Only the currently open (Pending) urgent follow-up row gets the tint -
// not the row where Risk was originally found (already Completed, nothing
// more to do there), and not an urgent row that's itself been completed.
// Only the Volunteer table ever actually has an urgent row now, but this
// stays general across all three tables so nothing breaks if that ever
// changes.
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

// Shared by both sections of the Investigation Status popup - a label (row
// title), status, who filled it, and (once Completed) its values expand on
// tap. idx_prefix keeps the two sections' toggle keys from colliding.
function render_investigation_rows(rows, idx_prefix) {
	if (!rows.length) {
		return `<div style="padding: 8px 0; color: #888;">${__("Nothing recorded yet.")}</div>`;
	}
	return rows.map((row, i) => {
		const idx = `${idx_prefix}${i}`;
		const status_text =
			row.status === "Completed"
				? __("Completed by {0}", [frappe.utils.escape_html(row.filled_by)])
				: row.status === "Not Yet Due"
				? __("Not yet due")
				: __("Pending");
		const expandable = row.status === "Completed" && (row.values || []).length;
		const values_html = (row.values || [])
			.map(
				(v) =>
					`<div style="padding: 2px 0 2px 14px;">${frappe.utils.escape_html(v.label)}: <b>${frappe.utils.escape_html(v.value)}</b></div>`
			)
			.join("");
		return `
			<div style="padding: 8px 0; border-bottom: 1px solid #e0e0e0;">
				<div class="${expandable ? "investigation-toggle" : ""}" data-idx="${idx}" style="${expandable ? "cursor: pointer;" : ""}">
					<b>${frappe.utils.escape_html(row.label)}:</b> ${status_text}
					${expandable ? ' <span style="color: #888; font-size: 85%;">(' + __("tap to view values") + ")</span>" : ""}
				</div>
				<div class="investigation-values" data-idx="${idx}" style="display: none; margin-top: 4px;">${values_html}</div>
			</div>
		`;
	}).join("");
}

function show_investigation_status(frm) {
	// One shared button for Volunteer, Nurse and Doctor alike - a live
	// snapshot of every Lab Investigation (trimester-gated) and Scan
	// Investigation (open at any time) panel, computed fresh from Nurse's
	// and Doctor's rows every click. Nothing is stored just for this; it's
	// the same Status/Filled By/value fields already mirrored onto every
	// Nurse/Doctor row, just read back in one place - a Completed row
	// expands to its actual values on tap, so Volunteer in particular
	// never has to go find Nurse's or Doctor's own rows just to see a
	// result.
	frappe.call({
		method: "chw.common.doctype.anc_follow_up.anc_follow_up.get_investigation_summary",
		args: { name: frm.doc.name },
	}).then((r) => {
		const summary = r.message || {};
		const html = `
			<div style="margin-bottom: 6px; font-weight: 600;">${__("Lab Investigations")}</div>
			${render_investigation_rows(summary.trimester || [], "t")}
			<div style="margin: 14px 0 6px; font-weight: 600;">${__("Scan Investigations")}</div>
			${render_investigation_rows(summary.scan || [], "s")}
		`;

		const dialog = new frappe.ui.Dialog({
			title: __("Investigation Status"),
			size: "large",
			fields: [{ fieldtype: "HTML", fieldname: "investigation_status_html", options: html }],
		});
		dialog.show();
		dialog.$wrapper.find(".investigation-toggle").on("click", function () {
			dialog.$wrapper.find(`.investigation-values[data-idx="${$(this).data("idx")}"]`).toggle();
		});
	});
}

// Same thresholds as the server's _trimester_number(), just expressed as
// 1/2/3 for Nurse's and Doctor's current_trimester_no field.
function trimester_number(lmp_date) {
	const days_pregnant = frappe.datetime.get_diff(frappe.datetime.get_today(), lmp_date);
	const weeks = Math.floor(Math.max(days_pregnant, 0) / 7);
	if (weeks <= 13) return 1;
	if (weeks <= 27) return 2;
	return 3;
}

// Not re-fetched after the first call in this form session - the logged-in
// user doesn't change mid-edit.
let current_user_full_name_promise = null;
function get_current_user_full_name() {
	if (!current_user_full_name_promise) {
		current_user_full_name_promise = frappe
			.call({
				method: "frappe.client.get_value",
				args: { doctype: "User", filters: frappe.session.user, fieldname: "full_name" },
			})
			.then((r) => (r.message && r.message.full_name) || frappe.session.user)
			.catch(() => frappe.session.user);
	}
	return current_user_full_name_promise;
}

// Setting a child row's field directly (row.x = y) updates the underlying
// doc, but doesn't reliably repaint an already-open grid row form - Desk's
// own supported way to change a field from another field's trigger (and
// have it actually show up on screen) is frappe.model.set_value, which both
// updates the doc and refreshes whatever widget is currently rendered for
// it. Skipping the call when nothing actually changed also avoids a loop,
// since set_value re-fires that field's own trigger (sync_lab_investigations
// itself, for every one of these fields) when it touches a value.
function set_row_value_if_changed(row, fieldname, value) {
	if (row[fieldname] === value) return;
	frappe.model.set_value(row.doctype, row.name, fieldname, value);
}

// Shared by sync_lab_investigations and sync_scan_investigations: for each
// group, find the first row (by idx, Nurse before Doctor on a tie) with any
// of its fields filled, and mirror its values + status + filled-by onto
// every row of every table.
function apply_investigation_groups(rows_by_table, groups, full_name) {
	groups.forEach((group) => {
		const candidates = [];
		Object.values(rows_by_table).forEach((rows) => {
			rows.forEach((row) => {
				if (group.fields.some((f) => row[f])) candidates.push(row);
			});
		});
		if (!candidates.length) return;

		// Same tie-break as the server: earliest row by idx, Nurse before
		// Doctor on a tie (table iteration order above).
		candidates.sort((a, b) => (a.idx || 0) - (b.idx || 0));
		const source = candidates[0];
		const group_values = {};
		group.fields.forEach((f) => {
			group_values[f] = source[f];
		});
		const filled_by = source[group.filled_by_field] || full_name;

		Object.values(rows_by_table).forEach((rows) => {
			rows.forEach((row) => {
				Object.entries(group_values).forEach(([f, v]) => set_row_value_if_changed(row, f, v));
				set_row_value_if_changed(row, group.status_field, "Completed");
				set_row_value_if_changed(row, group.filled_by_field, filled_by);
			});
		});
	});
}

function sync_lab_investigations(frm) {
	if (!frm.doc.pregnant_id) return;
	Promise.all([get_pregnancy_info(frm.doc.pregnant_id), get_current_user_full_name()]).then(([info, full_name]) => {
		if (!info.lmp_date) return;
		const current_trimester_no = trimester_number(info.lmp_date);

		const rows_by_table = {};
		LAB_INVESTIGATION_TABLE_FIELDS.forEach((table_field) => {
			rows_by_table[table_field] = frm.doc[table_field] || [];
		});
		Object.values(rows_by_table).forEach((rows) => {
			rows.forEach((row) => set_row_value_if_changed(row, "current_trimester_no", current_trimester_no));
		});

		const due_groups = LAB_INVESTIGATION_GROUPS.filter((g) => g.trimester <= current_trimester_no);
		apply_investigation_groups(rows_by_table, due_groups, full_name);

		LAB_INVESTIGATION_TABLE_FIELDS.forEach((table_field) => frm.refresh_field(table_field));
	});
}

function sync_scan_investigations(frm) {
	// Per-visit, not shared across rows: each row's own Status/Filled By
	// reflect only that same row's own fields - no scanning other rows, no
	// mirroring, no locking. A freshly added row has nothing in it, so
	// it's simply Pending until that visit's own fields get filled.
	let full_name_promise = null;
	LAB_INVESTIGATION_TABLE_FIELDS.forEach((table_field) => {
		(frm.doc[table_field] || []).forEach((row) => {
			SCAN_INVESTIGATION_GROUPS.forEach((group) => {
				const is_filled = group.fields.some((f) => row[f]);
				if (!is_filled) {
					set_row_value_if_changed(row, group.status_field, "Pending");
					set_row_value_if_changed(row, group.filled_by_field, null);
					return;
				}
				if (row[group.status_field] !== "Completed") {
					if (!row[group.filled_by_field]) {
						full_name_promise = full_name_promise || get_current_user_full_name();
						full_name_promise.then((full_name) => set_row_value_if_changed(row, group.filled_by_field, full_name));
					}
					set_row_value_if_changed(row, group.status_field, "Completed");
				}
			});
		});
	});
	LAB_INVESTIGATION_TABLE_FIELDS.forEach((table_field) => frm.refresh_field(table_field));
}

function get_pregnancy_info(pregnant_id) {
	return frappe.db.get_value("Pregnancy Registration", pregnant_id, ["lmp_date", "high_risk"]).then((r) => r.message || {});
}

function get_window_policy(high_risk) {
	// Reads from the shared Visit Schedule Master (Applies To = "ANC
	// Follow-up") instead of ANC's own separate master - see
	// chw.chw_master.visit_schedule. High Risk picks which configured row
	// applies; if only one row is configured (or none), the same policy
	// applies to every patient, exactly as before.
	return frappe
		.call({
			method: "chw.common.doctype.anc_follow_up.anc_follow_up.get_window_policy_for_js",
			args: { high_risk: high_risk || "No" },
		})
		.then((r) => {
			const msg = r.message || {};
			return {
				window_days: msg.window_days || 30,
				alert_within_days: msg.alert_within_days || 7,
				automatic_window_count: msg.automatic_window_count || 6,
			};
		});
}

function get_window_index(reference_date, lmp_date, window_days) {
	const days_elapsed = frappe.datetime.get_diff(reference_date, lmp_date);
	if (days_elapsed < 0) return 1;
	return Math.floor(days_elapsed / window_days) + 1;
}

function get_current_window(starting_window, completed_count) {
	// Every completed visit closes its own window and advances to the next
	// one - one visit always closes one window.
	return starting_window + completed_count;
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
	const volunteer_field = frm.fields_dict[VOLUNTEER_TABLE_FIELD];
	// If an org has hidden the Volunteer table too (unusual, but possible
	// via Customize Form), there's no schedule to generate at all.
	const volunteer_hidden = !volunteer_field || volunteer_field.df.hidden;
	const already_has_rows = (frm.doc[VOLUNTEER_TABLE_FIELD] || []).length;
	if (!frm.doc.pregnant_id || volunteer_hidden || already_has_rows) {
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
				frm.add_child(VOLUNTEER_TABLE_FIELD, {
					window_start_date: window_start,
					date: window_end,
					status: "Pending",
					lmp_date: info.lmp_date,
					pog_weeks: calculate_pog(info.lmp_date, window_end),
				});
			}
			frm.refresh_field(VOLUNTEER_TABLE_FIELD);
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
	// Volunteer table only - Nurse's and Doctor's own "Date of Next Visit"
	// fields (where present) are left purely to manual entry.
	let display = "";
	if (window_start && window_end) {
		display = `${frappe.datetime.str_to_user(window_start)} to ${frappe.datetime.str_to_user(window_end)}`;
	}

	const rows = frm.doc[VOLUNTEER_TABLE_FIELD] || [];
	if (window_start && window_end && rows.length) {
		const last_row = rows[rows.length - 1];
		frappe.model.set_value(last_row.doctype, last_row.name, "date_of_next_visit", window_end);
	}
	rows.forEach((row) => {
		row.next_visit_window = display;
	});
	frm.refresh_field(VOLUNTEER_TABLE_FIELD);
}

function get_pending_urgent(frm) {
	// An open Urgent-tagged row always wins first - the actual insertion of
	// this row only happens server-side (on save), but once one exists, the
	// preview needs to respect it too instead of recomputing over it. Only
	// the Volunteer table ever gets one.
	const rows = frm.doc[VOLUNTEER_TABLE_FIELD] || [];
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

		get_window_policy(info.high_risk).then(({ window_days, alert_within_days, automatic_window_count }) => {
			// A newer call to this function has started since this chain
			// began - let that one's result stand instead of overwriting it
			// with this now-stale one.
			if (my_token !== anc_visit_date_calc_token) return;

			const completed_count = (frm.doc[VOLUNTEER_TABLE_FIELD] || []).filter((row) => row.status === "Completed").length;
			const starting_window = get_window_index(
				frm.doc.creation || frappe.datetime.get_today(),
				info.lmp_date,
				window_days
			);
			const current_window = get_current_window(starting_window, completed_count);
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

			// Manual phase - whichever Volunteer row has the most recently
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

			const manual_rows = (frm.doc[VOLUNTEER_TABLE_FIELD] || []).filter((row) => row.date_of_next_visit);
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

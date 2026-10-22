# Copyright (c) 2026, tech4socialsector@azimpremjifoundation.org and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document
from frappe.utils import add_days, getdate
from chw.api import sync_next_visit_todo, validate_phone_number
from chw.chw_master import visit_schedule

DEFAULT_ANC_WINDOW_DAYS = 30
DEFAULT_RISK_ALERT_DAYS = 7
# Last-resort fallback only, if the Visit Schedule Master has no ANC rows
# configured - the real number always comes from that master's own field.
DEFAULT_AUTOMATIC_WINDOW_COUNT = 6

# The three follow-up tables all describe the same patient, just recorded by
# a different staff type. Some organizations only use one or two of these -
# LMP/POG sync and the shared risk flag still apply across all three. The
# continuous monthly-window SCHEDULE, however, is driven by the Volunteer
# table alone - Nurse and Doctor are open-ended, manual logs with no
# calculated cadence, no urgent chain, and no My Work connection of their
# own (see VOLUNTEER_TABLE_FIELD below).
FOLLOWUP_TABLE_FIELDS = ["anc_followup", "anc_followup_for_nurse", "anc_followup_for_docter"]
VOLUNTEER_TABLE_FIELD = "anc_followup"

# Every Volunteer row field except the ones this module (or the schedule
# generator) fills in itself - once any one of these actually holds
# something, the visit has been recorded, so Status flips to Completed on
# its own instead of also asking the volunteer to flip the dropdown by hand.
# Clearing a field back to blank doesn't walk Completed back - that's an
# edit to a recorded visit, not an undone one. Mirrored in anc_follow_up.js
# (Desk) and the Vue app's ancFollowUp.js hook, so all three stay in step.
VOLUNTEER_VISIT_CONTENT_FIELDS = [
	"month", "bp", "weight", "anemia", "edema", "grbs", "tt", "hemoglobin_level", "monthly_checkup", "ironcal",
	"any_other_complaitsremark", "hr", "rr", "temp", "height", "bmi", "mch_nurse_noti_ed_of_abnormal_vital_signs",
	"feeling_well", "good_energy", "pink_tongue", "good_fetal_movement", "vaginal_bleeding", "leaking_fluid",
	"severe_abdominal_pain", "severe_headacheblurred_vision", "swelling_of_handsface", "fever",
	"extreme_dizziness_or_fatigue", "reduced_fetal_movement", "itching_of_palms_or_soles_of_feet_especially_at_night",
	"palpitations", "mch_nurse_notified_of_danger_signs", "problems_identified", "support_care_provided",
	"folic_acid_counseling_1st_trimester", "trimester_specific_care_handout", "pregnancy_exercises_handout",
	"nutrition_counseling__my_pregnancy_plate_handout", "iron_and_calcium_2nd_and_3rd_trimester",
	"plan_for_delivery_facility_delivery_encouragement", "kegel_exercises_pregnancy_and_postnatal",
	"family_planning_teaching_and_handout", "exclusive_breastfeeding", "postpartum_depression_handout",
	"refferal_needed", "refferal_need", "referral_clinic_type", "care_plan_created",
	"reports_or_info_sent_to_mch_nurse", "place", "signature_of_mch_nurse", "date_reffe", "patient_condition",
	"vitamins", "anemia__11gm",
]

# Lab Investigations lives only on Nurse's and Doctor's rows (never
# Volunteer's) - filled once per trimester, by whichever of the two gets
# there first, then mirrored onto every row of both tables so it reads the
# same everywhere and is locked from further edits for the rest of that
# trimester. Each group's own fields + its Status/Filled By fields are
# identical, field-for-field, across both row doctypes.
LAB_INVESTIGATION_TABLE_FIELDS = ["anc_followup_for_nurse", "anc_followup_for_docter"]
LAB_INVESTIGATION_GROUPS = [
	{
		"trimester": 1,
		"label": "1st Trimester",
		"fields": ["hb", "blood_group", "platelet_count", "hiv", "hbsag", "hcv", "vdrl", "hba1c__grbs", "tsh", "urine_r__e"],
		"status_field": "lab_1st_trimester_status",
		"filled_by_field": "lab_1st_trimester_filled_by",
	},
	{
		"trimester": 2,
		"label": "2nd Trimester",
		"fields": ["hb_2nd", "bs", "urine"],
		"status_field": "lab_2nd_trimester_status",
		"filled_by_field": "lab_2nd_trimester_filled_by",
	},
	{
		"trimester": 3,
		"label": "3rd Trimester",
		"fields": ["hb_3rd", "bs_3rd", "grbs_3rd"],
		"status_field": "lab_3rd_trimester_status",
		"filled_by_field": "lab_3rd_trimester_filled_by",
	},
]

# Scan Investigations - unlike Lab Investigations, this is per-VISIT, not
# shared/locked across the whole pregnancy: each Nurse/Doctor row has its
# own independent set of scan results, never mirrored onto any other row,
# never locked, and a freshly added row always starts empty. Status/Filled
# By still exist, but are set from that same row's own fields only - purely
# a per-row "is this visit's panel filled in, and by whom" indicator, not a
# cross-row lock. Lives only on Nurse's and Doctor's rows, same as Lab
# Investigations - never Volunteer's.
SCAN_INVESTIGATION_GROUPS = [
	{
		"label": "Dating Ultrasounds",
		"fields": ["date_of_scan", "ga_us", "ga_at_scan", "edd_by_us"],
		"status_field": "scan_dating_status",
		"filled_by_field": "scan_dating_filled_by",
	},
	{
		"label": "NT Scan",
		"fields": ["d_o_s", "ga", "normal_or_abnormal", "if_abnormal"],
		"status_field": "scan_nt_status",
		"filled_by_field": "scan_nt_filled_by",
	},
	{
		"label": "Anatomy Scan",
		"fields": ["date_of_scan_copy", "ga_copy", "normal_or_abnormal_copy", "if_abnormal_copy"],
		"status_field": "scan_anatomy_status",
		"filled_by_field": "scan_anatomy_filled_by",
	},
	{
		"label": "Growth Scan",
		"fields": ["date_of_scan_copy_copy", "ga_copy_copy", "position", "cephalic", "growth", "if_abnormal_copy_copy"],
		"status_field": "scan_growth_status",
		"filled_by_field": "scan_growth_filled_by",
	},
]


def _sync_investigation_groups(rows_by_table, groups):
	"""Shared by sync_lab_investigations and sync_scan_investigations: for
	each group, find the first row (by idx, Nurse before Doctor on a tie)
	with any of its fields filled, and mirror its values + status +
	filled-by onto every row of every table. Already-filled groups just
	keep re-confirming the same answer, which also means every newly added
	row immediately picks up whatever's already been filled."""
	full_name = None
	for group in groups:
		candidates = [
			row
			for rows in rows_by_table.values()
			for row in rows
			if any(row.get(f) for f in group["fields"])
		]
		if not candidates:
			continue

		source_row = min(candidates, key=lambda row: (row.idx or 0))
		values = {f: source_row.get(f) for f in group["fields"]}
		existing_filled_by = source_row.get(group["filled_by_field"])
		if not existing_filled_by and full_name is None:
			full_name = frappe.utils.get_fullname(frappe.session.user)
		filled_by = existing_filled_by or full_name

		for rows in rows_by_table.values():
			for row in rows:
				for fieldname, value in values.items():
					row.set(fieldname, value)
				row.set(group["status_field"], "Completed")
				row.set(group["filled_by_field"], filled_by)


def _trimester_number(lmp_date, as_of_date=None):
	# Same thresholds as refresh_pregnancy_pog_and_trimester's own First/
	# Second/Third trimester split, just expressed as 1/2/3 for Nurse's and
	# Doctor's current_trimester_no (which drives their Lab Investigation
	# depends_on/read_only_depends_on conditions client-side).
	days_pregnant = (getdate(as_of_date or getdate()) - getdate(lmp_date)).days
	weeks = max(days_pregnant, 0) // 7
	if weeks <= 13:
		return 1
	if weeks <= 27:
		return 2
	return 3


@frappe.whitelist()
def get_window_policy_for_js(high_risk=None):
	"""For anc_follow_up.js's live preview - a CHW Health Worker isn't
	granted Desk access to Visit Schedule Master itself, so the client
	fetches through this whitelisted method (which reads ignoring
	permissions) instead of reading the master directly."""
	return visit_schedule.get_continue_policy(
		"ANC Follow-up",
		high_risk,
		defaults={
			"window_days": DEFAULT_ANC_WINDOW_DAYS,
			"alert_within_days": DEFAULT_RISK_ALERT_DAYS,
			"automatic_window_count": DEFAULT_AUTOMATIC_WINDOW_COUNT,
		},
	)


def _summarize_investigation_group(group, rows, field_labels):
	filled_row = next((row for row in rows if row.get(group["status_field"]) == "Completed"), None)
	values = []
	if filled_row:
		for fieldname in group["fields"]:
			value = filled_row.get(fieldname)
			if value:
				values.append({"label": field_labels.get(fieldname, fieldname), "value": value})
	return {
		"label": group["label"],
		"status": "Completed" if filled_row else "Pending",
		"filled_by": filled_row.get(group["filled_by_field"]) if filled_row else None,
		"values": values,
	}


@frappe.whitelist()
def get_investigation_summary(name):
	"""The one button Volunteer, Nurse and Doctor all share: a live, read-
	only snapshot of every Lab Investigation (trimester-gated) and Scan
	Investigation (open at any time) panel - status, who filled it, and
	(once Completed) the actual values, so Volunteer in particular never
	needs to go find Nurse's or Doctor's own rows just to see a result.
	Computed fresh from Nurse's and Doctor's rows every time it's clicked,
	nothing pre-stored to go stale."""
	doc = frappe.get_doc("ANC Follow-up", name)
	reg = (
		frappe.db.get_value("Pregnancy Registration", doc.pregnant_id, "lmp_date")
		if doc.pregnant_id
		else None
	)
	current_trimester_no = _trimester_number(reg) if reg else 0

	rows = [row for table_field in LAB_INVESTIGATION_TABLE_FIELDS for row in doc.get(table_field)]
	field_labels = {
		f.fieldname: f.label for f in frappe.get_meta("ANC Followup Nurse").fields
	}

	trimester_summary = []
	for group in LAB_INVESTIGATION_GROUPS:
		if group["trimester"] > current_trimester_no:
			trimester_summary.append({"label": group["label"], "status": "Not Yet Due", "filled_by": None, "values": []})
			continue
		trimester_summary.append(_summarize_investigation_group(group, rows, field_labels))

	# Scan Investigations is per-visit, not shared across rows - one summary
	# entry per visit where a scan was actually filled in, not one entry
	# per scan type. A visit with nothing filled in just doesn't appear.
	scan_table_labels = {"anc_followup_for_nurse": "Nurse", "anc_followup_for_docter": "Doctor"}
	scan_summary = []
	for table_field in LAB_INVESTIGATION_TABLE_FIELDS:
		for row in doc.get(table_field):
			for group in SCAN_INVESTIGATION_GROUPS:
				if row.get(group["status_field"]) != "Completed":
					continue
				values = []
				for fieldname in group["fields"]:
					value = row.get(fieldname)
					if value:
						values.append({"label": field_labels.get(fieldname, fieldname), "value": value})
				visit_date = frappe.utils.formatdate(row.date) if row.date else None
				scan_summary.append({
					"key": f"{table_field}-{row.name}-{group['status_field']}",
					"label": "{0} - {1} visit{2}".format(
						group["label"],
						scan_table_labels.get(table_field, ""),
						f" ({visit_date})" if visit_date else "",
					),
					"status": "Completed",
					"filled_by": row.get(group["filled_by_field"]),
					"values": values,
					"sort_date": row.date or "",
				})
	scan_summary.sort(key=lambda r: r.pop("sort_date"), reverse=True)

	# TT Status is per-visit too, Nurse's and Doctor's rows only - one entry
	# per visit where it was actually filled in, newest first.
	tt_summary = []
	for table_field in LAB_INVESTIGATION_TABLE_FIELDS:
		for row in doc.get(table_field):
			if not row.tt_status:
				continue
			visit_date = frappe.utils.formatdate(row.date) if row.date else None
			tt_summary.append({
				"key": f"{table_field}-{row.name}-tt_status",
				"label": "TT Status - {0} visit{1}".format(
					scan_table_labels.get(table_field, ""), f" ({visit_date})" if visit_date else ""
				),
				"status": "Completed",
				"filled_by": row.tt_status_filled_by,
				"values": [{"label": "TT Status", "value": row.tt_status}],
				"sort_date": row.date or "",
			})
	tt_summary.sort(key=lambda r: r.pop("sort_date"), reverse=True)

	# Risk is per-visit, across all three tables - Volunteer, Nurse and
	# Doctor can each independently flag a visit as Risk.
	risk_table_labels = {"anc_followup": "Volunteer", **scan_table_labels}
	risk_summary = []
	for table_field in FOLLOWUP_TABLE_FIELDS:
		for row in doc.get(table_field):
			if row.patient_condition != "Risk":
				continue
			values = [{"label": "Patient Condition", "value": "Risk"}]
			detail = row.get("if_patient_condition_is_risk")
			if detail:
				values.append({"label": "If Patient Condition is Risk", "value": detail})
			visit_date = frappe.utils.formatdate(row.date) if row.date else None
			risk_summary.append({
				"key": f"{table_field}-{row.name}-risk",
				"label": "Risk - {0} visit{1}".format(
					risk_table_labels.get(table_field, ""), f" ({visit_date})" if visit_date else ""
				),
				"status": "Completed",
				"filled_by": row.risk_filled_by,
				"values": values,
				"sort_date": row.date or "",
			})
	risk_summary.sort(key=lambda r: r.pop("sort_date"), reverse=True)

	return {
		"trimester": trimester_summary,
		"scan": scan_summary,
		"tt_status": tt_summary,
		"risk": risk_summary,
	}


class ANCFollowup(Document):
	def validate_pregnancy_is_for_woman(self):
		# Same rule as the form's dropdown: a pregnancy registered for a family
		# member who is a woman. Checked on new records and when the Pregnant
		# ID changes, so older records still save.
		if not self.pregnant_id or not (self.is_new() or self.has_value_changed("pregnant_id")):
			return
		member = frappe.db.get_value("Pregnancy Registration", self.pregnant_id, "familymember_id")
		gender = frappe.db.get_value("Family members", member, "gender") if member else None
		if gender != "Female":
			frappe.throw(
				frappe._("ANC Follow-up is only for a pregnancy registered for a woman. {0} is not linked to a female family member.").format(
					frappe.bold(self.pregnant_id)
				)
			)

	def validate(self):
		self.validate_pregnancy_is_for_woman()
		validate_phone_number(self.phone_number)
		self.sync_followup_rows_with_pregnancy()
		self.close_on_delivery_or_abortion()
		if self.status == "Closed":
			# She's delivered - no more ANC visits are due, regardless of what's
			# still sitting on the last row's Date of Next Visit.
			self.next_anc_visit_date = None
			self.next_anc_visit_date_auto = None
			self.next_anc_visit_risk_alert = ""
		else:
			self.set_next_anc_visit_date()

	def on_update(self):
		sync_next_visit_todo(
			self,
			"next_anc_visit_date",
			f"ANC follow-up visit due for {self.first_name or self.pregnant_id}",
		)

	def close_on_delivery_or_abortion(self):
		# Two independent signals can close this record, whichever arrives
		# first - Birth Registration (handled separately, in chw.api's
		# close_anc_followup_from_birth_registration) is the guaranteed eventual
		# backstop, but it's a different document that may not get created
		# until well after the delivery itself. Delivery Status / Aboration
		# Status set directly here close it immediately instead of waiting.
		# One-way only - never reopens a closed record if these are later
		# edited back to "No" by mistake.
		if self.delivery_status == "Yes" or self.aboration_status == "Yes":
			self.status = "Closed"

	def sync_followup_rows_with_pregnancy(self):
		# LMP Date and POG (how far along she was at that specific visit) are
		# reference info for the staff member, not something they should have
		# to type - both are derived straight from the pregnancy's own LMP
		# date, across every follow-up table in use, Volunteer and Doctor
		# included (this is pure convenience auto-fill, unrelated to
		# scheduling).
		if not self.pregnant_id:
			return
		lmp_date = frappe.db.get_value("Pregnancy Registration", self.pregnant_id, "lmp_date")
		if not lmp_date:
			return

		for table_field in FOLLOWUP_TABLE_FIELDS:
			for row in self.get(table_field):
				row.lmp_date = lmp_date
				row.pog_weeks = self.calculate_pog(lmp_date, row.date) if row.date else ""

		self.auto_complete_volunteer_rows()
		self.sync_patient_condition_to_pregnancy()
		self.refresh_pregnancy_pog_and_trimester(lmp_date)
		self.sync_lab_investigations(lmp_date)
		self.sync_scan_investigations()
		self.sync_tt_status()
		self.sync_risk_filled_by()
		self.insert_urgent_followups_for_risk_rows()

	def auto_complete_volunteer_rows(self):
		for row in self.get(VOLUNTEER_TABLE_FIELD):
			if row.status == "Completed":
				continue
			if any(row.get(f) for f in VOLUNTEER_VISIT_CONTENT_FIELDS):
				row.status = "Completed"

	def sync_lab_investigations(self, lmp_date):
		current_trimester_no = _trimester_number(lmp_date)
		rows_by_table = {
			table_field: self.get(table_field) for table_field in LAB_INVESTIGATION_TABLE_FIELDS
		}

		for rows in rows_by_table.values():
			for row in rows:
				row.current_trimester_no = current_trimester_no

		due_groups = [g for g in LAB_INVESTIGATION_GROUPS if g["trimester"] <= current_trimester_no]
		_sync_investigation_groups(rows_by_table, due_groups)

	def sync_scan_investigations(self):
		# Per-visit, not shared across rows: each row's own Status/Filled By
		# reflect only that same row's own fields - no scanning other rows,
		# no mirroring, no locking. A freshly added row has nothing in it,
		# so it's simply Pending until that visit's own fields get filled.
		full_name = None
		for table_field in LAB_INVESTIGATION_TABLE_FIELDS:
			for row in self.get(table_field):
				for group in SCAN_INVESTIGATION_GROUPS:
					is_filled = any(row.get(f) for f in group["fields"])
					if not is_filled:
						row.set(group["status_field"], "Pending")
						row.set(group["filled_by_field"], None)
						continue
					if row.get(group["status_field"]) != "Completed":
						if not row.get(group["filled_by_field"]):
							if full_name is None:
								full_name = frappe.utils.get_fullname(frappe.session.user)
							row.set(group["filled_by_field"], full_name)
						row.set(group["status_field"], "Completed")

	def sync_tt_status(self):
		# Per-visit, like Scan Investigations - Nurse's and Doctor's rows each
		# stand on their own, no mirroring, no locking. Whoever first types a
		# value into that row's own TT Status is stamped there; clearing it
		# back out clears the stamp too, so it never shows someone's name
		# against a value they didn't actually enter.
		full_name = None
		for table_field in LAB_INVESTIGATION_TABLE_FIELDS:
			for row in self.get(table_field):
				if not row.tt_status:
					row.tt_status_filled_by = None
					continue
				if not row.tt_status_filled_by:
					if full_name is None:
						full_name = frappe.utils.get_fullname(frappe.session.user)
					row.tt_status_filled_by = full_name

	def sync_risk_filled_by(self):
		# Same per-visit treatment, across all three tables - Volunteer,
		# Nurse and Doctor can each independently flag a visit as Risk.
		full_name = None
		for table_field in FOLLOWUP_TABLE_FIELDS:
			for row in self.get(table_field):
				if row.patient_condition != "Risk":
					row.risk_filled_by = None
					continue
				if not row.risk_filled_by:
					if full_name is None:
						full_name = frappe.utils.get_fullname(frappe.session.user)
					row.risk_filled_by = full_name

	def refresh_pregnancy_pog_and_trimester(self, lmp_date):
		today = getdate()
		days_pregnant = (today - getdate(lmp_date)).days
		weeks, days = divmod(days_pregnant, 7)
		pog = f"{weeks} weeks {days} days"

		if weeks <= 13:
			trimester = "First trimester"
		elif weeks <= 27:
			trimester = "Second trimester"
		else:
			trimester = "Third trimester"

		frappe.db.set_value("Pregnancy Registration", self.pregnant_id, {"pog": pog, "trimester": trimester})

	def sync_patient_condition_to_pregnancy(self):
		
		any_risk = any(
			row.patient_condition == "Risk"
			for table_field in FOLLOWUP_TABLE_FIELDS
			for row in self.get(table_field)
		)
		if any_risk:
			frappe.db.set_value("Pregnancy Registration", self.pregnant_id, "high_risk", "Yes")

	def insert_urgent_followups_for_risk_rows(self):
		high_risk = (
			frappe.db.get_value("Pregnancy Registration", self.pregnant_id, "high_risk") if self.pregnant_id else None
		)
		_, alert_within_days, _ = self.get_window_policy(high_risk)
		self._insert_urgent_followups(VOLUNTEER_TABLE_FIELD, alert_within_days)

	def _insert_urgent_followups(self, table_field, alert_within_days):
		table = self.get(table_field)
		i = 0
		while i < len(table):
			row = table[i]
			if row.status == "Completed" and row.patient_condition == "Risk":
				next_row = table[i + 1] if i + 1 < len(table) else None
				already_inserted = next_row and next_row.urgent_followup
				if not already_inserted:
					urgent_date = add_days(getdate(row.date), alert_within_days)
					next_row_too_soon = next_row and getdate(next_row.date) <= urgent_date
					if not next_row_too_soon:
						new_row = self.append(table_field, {})
						new_row.window_start_date = row.date
						new_row.date = urgent_date
						new_row.status = "Pending"
						new_row.urgent_followup = 1
						new_row.lmp_date = row.lmp_date
						new_row.pog_weeks = self.calculate_pog(row.lmp_date, urgent_date) if row.lmp_date else ""
						table.remove(new_row)
						table.insert(i + 1, new_row)
						for idx, r in enumerate(table):
							r.idx = idx + 1
			i += 1

	@staticmethod
	def calculate_pog(lmp_date, as_of_date):
		days_pregnant = (getdate(as_of_date) - getdate(lmp_date)).days
		if days_pregnant < 0:
			return ""
		weeks, days = divmod(days_pregnant, 7)
		return f"{weeks} weeks {days} days"

	def set_next_anc_visit_date(self):
		
		if not self.pregnant_id:
			return

		reg = frappe.db.get_value(
			"Pregnancy Registration", self.pregnant_id, ["lmp_date", "high_risk"], as_dict=True
		)
		if not reg or not reg.lmp_date:
			return
		urgent = self.get_pending_urgent_followup()
		if urgent:
			self.next_anc_visit_date = urgent.date
			self.next_anc_visit_date_auto = urgent.date
			self.next_anc_visit_risk_alert = ""
			self.sync_child_row_fields(urgent.trigger_date, urgent.date)
			return

		high_risk = reg.high_risk or "No"
		window_days, alert_within_days, automatic_window_count = self.get_window_policy(high_risk)
		completed_count = len([row for row in self.get(VOLUNTEER_TABLE_FIELD) if row.status == "Completed"])
		starting_window = self.get_window_index(self.creation or getdate(), reg.lmp_date, window_days)
		current_window = self.get_current_window(starting_window, completed_count)

		window_start = add_days(getdate(reg.lmp_date), (current_window - 1) * window_days)
		window_end = add_days(window_start, window_days)

		# High Risk only, shown in red on the main form - a nudge to visit
		# early within the window. Blank for Normal patients, and the
		# window/due date above are unaffected either way.
		risk_alert = (
			"Visit by {0}".format(frappe.utils.formatdate(add_days(window_start, alert_within_days)))
			if high_risk == "Yes"
			else ""
		)

		if current_window <= automatic_window_count:
			# Automatic phase - locked to the calculation, no manual override.
			self.next_anc_visit_date = window_end
			self.next_anc_visit_date_auto = window_end
			self.next_anc_visit_risk_alert = risk_alert
			self.sync_child_row_fields(window_start, window_end)
			return

		# Manual phase from here on - whichever Volunteer row carries the most
		# recently visited date's "Date of Next Visit" is the real answer.
		# Until she has actually recorded one, never leave this blank - show
		# her current month's window (from LMP) as a starting suggestion
		# instead.
		manual_rows = [row for row in self.get(VOLUNTEER_TABLE_FIELD) if row.get("date_of_next_visit")]
		if not manual_rows:
			self.next_anc_visit_date = window_end
			self.next_anc_visit_date_auto = window_end
			self.next_anc_visit_risk_alert = risk_alert
			self.sync_child_row_fields(window_start, window_end)
			return

		current = getdate(self.next_anc_visit_date) if self.next_anc_visit_date else None
		last_auto = getdate(self.next_anc_visit_date_auto) if self.next_anc_visit_date_auto else None
		if current and last_auto and current != last_auto:
			# user has manually overridden the date; leave it alone - it's no
			# longer a calculated window, so there's no range or alert to show.
			self.next_anc_visit_risk_alert = ""
			self.sync_child_row_fields(None, None)
			return

		latest_row = max(manual_rows, key=lambda r: getdate(r.date))
		calculated_date = getdate(latest_row.get("date_of_next_visit"))
		self.next_anc_visit_date = calculated_date
		self.next_anc_visit_date_auto = calculated_date
		# A manually typed date isn't a calculated window either.
		self.next_anc_visit_risk_alert = ""
		self.sync_child_row_fields(None, None)

	def sync_child_row_fields(self, window_start, window_end):
		# "Date of Next Visit" and "Next Visit Window" are auto-filled on the
		# Volunteer table only - Nurse's and Doctor's own "Date of Next
		# Visit" fields (where present) are left purely to manual entry,
		# never overwritten by this calculation.
		if window_start and window_end:
			display = "{0} to {1}".format(frappe.utils.formatdate(window_start), frappe.utils.formatdate(window_end))
		else:
			display = ""

		table = self.get(VOLUNTEER_TABLE_FIELD)
		if window_start and window_end and table:
			table[-1].date_of_next_visit = window_end
		for row in table:
			row.next_visit_window = display

	def get_pending_urgent_followup(self):
		return self._pending_urgent_in(self.get(VOLUNTEER_TABLE_FIELD))

	@staticmethod
	def _pending_urgent_in(table):
		urgent_rows = [
			(i, row) for i, row in enumerate(table)
			if row.urgent_followup and row.status != "Completed"
		]
		if not urgent_rows:
			return None

		i, earliest = min(urgent_rows, key=lambda pair: getdate(pair[1].date))
		trigger_row = table[i - 1] if i > 0 else None
		trigger_date = getdate(trigger_row.date) if trigger_row else getdate(earliest.date)
		return frappe._dict(date=getdate(earliest.date), trigger_date=trigger_date)

	@staticmethod
	def get_window_policy(high_risk=None):
		# Reads from the shared Visit Schedule Master (Applies To = "ANC
		# Follow-up", Schedule Type = Continue) instead of ANC's own separate
		# Single - see chw.chw_master.visit_schedule. High Risk picks which
		# configured row applies; if only one row is configured (or none),
		# the same policy applies to every patient, exactly as before.
		policy = visit_schedule.get_continue_policy(
			"ANC Follow-up",
			high_risk,
			defaults={
				"window_days": DEFAULT_ANC_WINDOW_DAYS,
				"alert_within_days": DEFAULT_RISK_ALERT_DAYS,
				"automatic_window_count": DEFAULT_AUTOMATIC_WINDOW_COUNT,
			},
		)
		return policy.window_days, policy.alert_within_days, policy.automatic_window_count

	@staticmethod
	def get_window_index(reference_date, lmp_date, window_days):
		days_elapsed = (getdate(reference_date) - getdate(lmp_date)).days
		if days_elapsed < 0:
			return 1
		return (days_elapsed // window_days) + 1

	@staticmethod
	def get_current_window(starting_window, completed_count):
		# Every completed visit closes its own window and advances to the
		# next one - one visit always closes one window.
		return starting_window + completed_count

import frappe


def execute():
	"""Consolidate the 4 separate Visit Interval Masters (ANC, PNC, Postpartum,
	Child 6w-1y) into one shared Visit Schedule Master doctype - a normal,
	searchable list, one record per program (Continue-style programs get one
	flat record per High Risk value; Specific-style programs get one record
	per program, with every numbered visit as a row in its own Visit
	Schedule table) - so every program's cadence lives in one place and
	reads through one shared lookup (chw.chw_master.visit_schedule) instead
	of 4 copy-pasted ones. The old masters are left in place, untouched, as
	historical data - nothing reads from them any more after this patch."""
	frappe.reload_doc("chw_master", "doctype", "visit_schedule_program")
	frappe.reload_doc("chw_master", "doctype", "visit_schedule_row")
	frappe.reload_doc("chw_master", "doctype", "visit_schedule_master")

	_seed_programs()

	if frappe.db.count("Visit Schedule Master"):
		return

	_seed_anc()
	# PNC's old rows used different Urgent Visit Within Days per visit (2 for
	# visit 1, 5 for visit 2) - now shares the program's single Risk Alert
	# Within Days for that purpose too (same pattern ANC already used), per
	# explicit instruction: 3 days.
	_seed_specific("PNC", "PNC Visit Interval Master", risk_alert_within_days=3)
	_seed_specific("Postpartum Reg and Followup", "Postpartum Visit Interval Master")
	_seed_specific("Child 6w to 1 Year Reg and Followup", "Child 6w-1y Visit Interval Master")


def _seed_programs():
	# Applies To is a Link into this registry rather than a hardcoded list,
	# so a future program (e.g. NCD) can be made selectable just by adding a
	# record here - no code change - once its own doctype is also wired to
	# call chw.chw_master.visit_schedule.
	for doctype in (
		"ANC Follow-up", "PNC", "Postpartum Reg and Followup", "Child 6w to 1 Year Reg and Followup",
	):
		if not frappe.db.exists("Visit Schedule Program", doctype):
			frappe.get_doc({"doctype": "Visit Schedule Program", "target_doctype": doctype}).insert(
				ignore_permissions=True
			)


def _seed_anc():
	# ANC Visit Interval Master is a flat Single (no child table) - one
	# policy, the same regardless of risk today. High Risk left blank so it
	# keeps applying to every patient exactly as before; add a separate
	# High Risk = Yes record later if a shorter risk cadence is wanted.
	if not frappe.db.exists("DocType", "ANC Visit Interval Master"):
		return
	anc = frappe.get_single("ANC Visit Interval Master")
	frappe.get_doc({
		"doctype": "Visit Schedule Master",
		"applies_to": "ANC Follow-up",
		"schedule_type": "Continue",
		"window_opens_day": anc.interval_days or 30,
		"risk_alert_within_days": anc.risk_alert_within_days or 7,
		"automatic_window_count": anc.automatic_window_count or 6,
	}).insert(ignore_permissions=True)


def _seed_specific(applies_to, old_master_doctype, risk_alert_within_days=None):
	"""Risk Alert Within Days moves from being repeated on every row to one
	shared value per program, and now also covers the urgent re-visit gap
	(previously a separate Urgent Visit Within Days field) - the old rows'
	Risk Alert was already identical across every row for all 3 programs,
	so the first row's value carries straight over, unless the caller
	passes an explicit override (needed for PNC, whose old Urgent Visit
	value actually differed per row: 2 then 5)."""
	if not frappe.db.exists("DocType", old_master_doctype):
		return
	old_master = frappe.get_single(old_master_doctype)
	if not old_master.visit_schedule:
		return

	first_row = old_master.visit_schedule[0]
	doc = frappe.get_doc({
		"doctype": "Visit Schedule Master",
		"applies_to": applies_to,
		"schedule_type": "Specific",
		"risk_alert_within_days": (
			risk_alert_within_days if risk_alert_within_days is not None else first_row.risk_alert_within_days
		),
	})
	for i, row in enumerate(old_master.visit_schedule, start=1):
		doc.append("visit_rows", {
			"visit_number": i,
			"window_opens_day": row.window_opens_day,
			"window_closes_day": row.window_closes_day,
			"milestone_label": row.get("milestone_label"),
		})
	doc.insert(ignore_permissions=True)

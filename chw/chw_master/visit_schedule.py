# Shared lookup for the one unified "Visit Schedule Master" - every program
# (ANC Follow-up, PNC, Postpartum Reg and Followup, Child 6w to 1 Year Reg
# and Followup) reads its own cadence from here instead of its own separate
# master, filtered by Applies To. Each program's own doctype keeps its own
# static methods (get_window_policy/get_visit_window/
# get_urgent_visit_within_days) with the same names and call signatures as
# before - they just delegate here now, so nothing calling them (chw/api.py,
# each doctype's own .js) needed to change.
#
# Continue-style programs are one flat record per High Risk value. Specific-
# style programs are one record per program, holding every numbered visit
# as a row in its own Visit Schedule child table - so "find my rows" means
# two different lookups depending on schedule_type.

import frappe

CONTINUE_FIELDS = [
	"name", "high_risk", "window_opens_day", "risk_alert_within_days", "automatic_window_count",
]


def _continue_rows_for(applies_to):
	# ignore_permissions: this is read-only scheduling config every program
	# needs to compute its own due dates, regardless of whether the
	# currently logged-in user (e.g. a CHW Health Worker saving their own
	# follow-up record) has been granted Desk access to edit the master
	# itself - editing is still restricted via Visit Schedule Master's own
	# DocPerms, this is just the read path every save relies on.
	return frappe.get_all(
		"Visit Schedule Master",
		filters={"applies_to": applies_to, "schedule_type": "Continue"},
		fields=CONTINUE_FIELDS,
		ignore_permissions=True,
	)


def _specific_parent_for(applies_to):
	"""The one Specific-type record for this program - its Risk Alert/Urgent
	Visit Within Days are shared across every row in its own Visit Schedule
	table, entered once rather than per visit."""
	name = frappe.db.get_value(
		"Visit Schedule Master", {"applies_to": applies_to, "schedule_type": "Specific"}, "name"
	)
	if not name:
		return None
	# get_doc (unlike get_all) doesn't filter by the current user's
	# permissions unless explicitly asked to - same reasoning as above.
	return frappe.get_doc("Visit Schedule Master", name)


def _specific_rows_for(applies_to):
	parent = _specific_parent_for(applies_to)
	if not parent:
		return []
	return sorted(parent.visit_rows, key=lambda row: row.visit_number)


def get_continue_policy(applies_to, high_risk, defaults):
	"""Continue-style programs (currently just ANC): the interval and
	structural settings (Repeat Every / Automatic Window Count) always come
	from the No/blank record - the normal cadence keeps running in the
	background regardless of risk, it never changes on its own. A separate
	High Risk = Yes record, if one exists, only ever contributes its own
	Risk Alert Within Days - which drives the early on-screen nudge AND the
	automatic urgent-visit insertion once a followup is completed and found
	Risk (see each doctype's own insert_urgent_followups_for_risk_rows).
	Falls back to `defaults` if this program has no Continue records
	configured yet."""
	rows = _continue_rows_for(applies_to)
	if not rows:
		return frappe._dict(defaults)

	base_row = (
		next((r for r in rows if not r.high_risk), None)
		or next((r for r in rows if r.high_risk == "No"), None)
		or rows[0]
	)
	risk_row = next((r for r in rows if r.high_risk == "Yes"), None)
	alert_row = risk_row if ((high_risk or "No") == "Yes" and risk_row) else base_row

	return frappe._dict(
		window_days=base_row.window_opens_day or defaults["window_days"],
		alert_within_days=alert_row.risk_alert_within_days or defaults["alert_within_days"],
		automatic_window_count=base_row.automatic_window_count or defaults["automatic_window_count"],
	)


def get_visit_window(applies_to, visit_number, default_schedule, default_risk_alert_days):
	"""Specific-style programs (PNC/Postpartum/Child 6w-1y): row matched by
	its own Visit Number field within that program's one Visit Schedule
	table. Returns None once visit_number has no matching row - same
	"schedule complete" signal as before. Risk Alert Within Days is shared
	across every visit for this program (one value on the parent record,
	not entered per row). Falls back to `default_schedule` - a list of
	(start, end) or (label, start, end) tuples, 1-indexed by position - only
	if this program has no Specific record configured yet."""
	parent = _specific_parent_for(applies_to)
	if parent:
		row = next((r for r in parent.visit_rows if r.visit_number == visit_number), None)
		if not row:
			return None
		return frappe._dict(
			milestone_label=row.milestone_label,
			start_offset=row.window_opens_day,
			end_offset=row.window_closes_day,
			risk_alert_within_days=parent.risk_alert_within_days or default_risk_alert_days,
		)

	if visit_number < 1 or visit_number > len(default_schedule):
		return None
	entry = default_schedule[visit_number - 1]
	if len(entry) == 3:
		label, start_offset, end_offset = entry
	else:
		label = None
		start_offset, end_offset = entry
	return frappe._dict(
		milestone_label=label, start_offset=start_offset, end_offset=end_offset,
		risk_alert_within_days=default_risk_alert_days,
	)


def get_urgent_visit_within_days(applies_to, default_days):
	"""Reuses the program's one shared Risk Alert Within Days for the urgent
	re-visit gap too - mirroring ANC's own Continue-style policy, which has
	always used a single alert_within_days value for both the early nudge
	and the urgent-insertion gap. Same number, same meaning, regardless of
	which visit found the patient at Risk."""
	parent = _specific_parent_for(applies_to)
	if not parent:
		return default_days
	return parent.risk_alert_within_days or default_days


@frappe.whitelist()
def get_visit_schedule_rows(applies_to):
	"""For each program's own .js live-preview to call through - a CHW
	Health Worker filling out a form isn't granted Desk access to Visit
	Schedule Master itself, so the client fetches through this whitelisted
	method (which reads ignoring permissions) instead of listing it
	directly. Risk Alert Within Days is duplicated onto every returned row
	(even though it's stored once, shared, on the parent) so the existing
	per-row client-side preview code doesn't need to change."""
	parent = _specific_parent_for(applies_to)
	if not parent:
		return []
	return [
		{
			"milestone_label": row.milestone_label,
			"window_opens_day": row.window_opens_day,
			"window_closes_day": row.window_closes_day,
			"risk_alert_within_days": parent.risk_alert_within_days,
		}
		for row in sorted(parent.visit_rows, key=lambda r: r.visit_number)
	]


@frappe.whitelist()
def get_continue_policy_for_js(applies_to, high_risk=None, window_days=30, alert_within_days=7, automatic_window_count=6):
	return get_continue_policy(
		applies_to,
		high_risk,
		defaults={
			"window_days": frappe.utils.cint(window_days),
			"alert_within_days": frappe.utils.cint(alert_within_days),
			"automatic_window_count": frappe.utils.cint(automatic_window_count),
		},
	)

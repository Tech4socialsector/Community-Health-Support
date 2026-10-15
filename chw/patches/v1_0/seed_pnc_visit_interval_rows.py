import frappe


def execute():
	"""PNC Visit Interval Master moved to a per-visit-row table - one row per
	visit (Window Opens/Closes/Risk Alert in days from delivery), so any
	protocol shape (a gap between visits, back-to-back weeks, irregular
	spacing, any number of visits) is just data, never a code change. Seed
	the default 2-row schedule (week 1, week 6) so existing sites keep
	working without manual setup."""
	frappe.reload_doc("chw_master", "doctype", "pnc_visit_schedule_row")
	frappe.reload_doc("chw_master", "doctype", "pnc_visit_interval_master")

	master = frappe.get_single("PNC Visit Interval Master")
	if master.visit_schedule:
		return

	master.append("visit_schedule", {"window_opens_day": 0, "window_closes_day": 7, "risk_alert_within_days": 1})
	master.append("visit_schedule", {"window_opens_day": 35, "window_closes_day": 42, "risk_alert_within_days": 1})
	master.save()

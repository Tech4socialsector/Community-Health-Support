import frappe


def execute():
	"""Seed CHW App Settings.dashboard_cards with the app's default Dashboard
	stat cards, so the Vue app's Dashboard page has something to show out of
	the box instead of an empty list until someone configures it from the
	desk."""
	frappe.reload_doc("chw_master", "doctype", "chw_dashboard_card")
	frappe.reload_doc("chw_master", "doctype", "chw_app_settings")

	settings = frappe.get_single("CHW App Settings")
	if settings.get("dashboard_cards"):
		return

	defaults = [
		{"stat_key": "scheduled_count", "label": "Pending Visits", "icon": "clock", "color": "blue"},
		{"stat_key": "backlog_count", "label": "Missed / Backlog Visits", "icon": "alert-triangle", "color": "red"},
		{"stat_key": "recent_registrations", "label": "Recent Registrations", "icon": "user-plus", "color": "purple"},
		{"stat_key": "total_registrations", "label": "Total Registrations", "icon": "users", "color": "gray"},
		{"stat_key": "normal_children", "label": "Normal Growth", "icon": "smile", "color": "green"},
		{"stat_key": "mam_children", "label": "MAM (Moderate)", "icon": "alert-circle", "color": "orange"},
		{"stat_key": "sam_children", "label": "SAM (Severe)", "icon": "alert-octagon", "color": "red"},
		{"stat_key": "exit_women_anc", "label": "Exited ANC Care", "icon": "check-circle", "color": "gray"},
		{"stat_key": "exit_women_pnc", "label": "Exited PNC Care", "icon": "check-circle", "color": "gray"},
	]
	for row in defaults:
		settings.append("dashboard_cards", {"enabled": 1, **row})
	settings.save(ignore_permissions=True)
	frappe.db.commit()

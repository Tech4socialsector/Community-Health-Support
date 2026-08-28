import frappe


def execute():
	"""New AI Assistant fields on the App Setting Single doctype - a Single's
	own row already existed before this migration, so their `default` never
	applied (Frappe only applies field defaults on insert, not to an
	already-existing row). Backfill sane defaults directly."""
	frappe.reload_doc("chw_master", "doctype", "app_setting")
	settings = frappe.get_single("App Setting")
	changed = False
	if not settings.ai_bot_name:
		settings.ai_bot_name = "Assistant"
		changed = True
	if not settings.ai_daily_message_limit:
		settings.ai_daily_message_limit = 50
		changed = True
	if not settings.ai_provider:
		settings.ai_provider = "Custom"
		changed = True
	if changed:
		settings.save(ignore_permissions=True)

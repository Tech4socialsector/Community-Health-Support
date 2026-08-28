import frappe
import frappe.sessions

# The CSRF token below is per-session - if this page were cached (Frappe's
# default for website pages), the very first visitor's token would get
# baked into the cached HTML and served to every session afterward,
# defeating the whole point of a per-session token. frappe.www.desk sets
# the same flag for the same reason.
no_cache = 1


def get_context(context):
	"""The generic website boot data (frappe.website.utils.get_boot_data)
	deliberately excludes the CSRF token - it's a desk-only concern in
	Frappe core. But frappe-ui's frappeRequest sends every API call as a
	POST (regardless of the underlying method), which Frappe's CSRF check
	then validates against the session's saved token whenever one already
	exists (e.g. the user visited /desk first, which does save one) - so a
	logged-in user opening this app without a matching X-Frappe-CSRF-Token
	header hits a CSRFTokenError. Adding it here is exactly what
	frappe.www.desk's own get_context does for the same reason.
	"""
	if context.boot is None:
		context.boot = {}
	context.boot["csrf_token"] = frappe.sessions.get_csrf_token()
	return context

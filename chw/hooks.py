app_name = "chw"
app_title = "CHW"
app_publisher = "tech4socialsector@azimpremjifoundation.org"
app_description = "Community Health Worker Application"
app_email = "tech4socialsector@azimpremjifoundation.org"
app_license = "mit"

# Apps
# ------------------

# required_apps = []

# Each item in the list will be shown as an app in the apps page
add_to_apps_screen = [
	{
		"name": "chw",
		"logo": "/assets/chw/frontend/favicon.png",
		"title": "CHW",
		"route": "/chw",
	}
]

# Includes in <head>
# ------------------

# include js, css files in header of desk.html
app_include_css = "/assets/chw/css/chw_desk.css"
# app_include_js = "/assets/chw/js/chw.js"

# include js, css files in header of web template
# web_include_css = "/assets/chw/css/chw.css"
# web_include_js = "/assets/chw/js/chw.js"

# include custom scss in every website theme (without file extension ".scss")
# website_theme_scss = "chw/public/scss/website"

# include js, css files in header of web form
# webform_include_js = {"doctype": "public/js/doctype.js"}
# webform_include_css = {"doctype": "public/css/doctype.css"}

# include js in page
# page_js = {"page" : "public/js/file.js"}

# include js in doctype views
# doctype_js = {"doctype" : "public/js/doctype.js"}
# doctype_list_js = {"doctype" : "public/js/doctype_list.js"}
# doctype_tree_js = {"doctype" : "public/js/doctype_tree.js"}
# doctype_calendar_js = {"doctype" : "public/js/doctype_calendar.js"}

# Svg Icons
# ------------------
# include app icons in desk
# app_include_icons = "chw/public/icons.svg"

# Website Route Rules
# --------------------
# Client-side routes for the CHW Vue app (frontend/) all render the same
# www/chw.html shell; vue-router then handles the sub-path in the browser.

website_route_rules = [
	{"from_route": "/chw/<path:app_path>", "to_route": "chw"},
]

# Serves the built service worker (and its workbox chunk) at /chw/sw.js
# instead of their real build location under /assets/chw/frontend/ - a
# service worker can only control paths at-or-below wherever it's served
# from, so it has to live at the app's own route for `scope: '/chw/'`
# registration to be accepted by the browser. Runs before website_route_rules
# is even consulted, so it isn't shadowed by the catch-all above.
page_renderer = ["chw.website.sw_renderer.ServiceWorkerRenderer"]

# Home Pages
# ----------

# application home page (will override Website Settings)
# home_page = "login"

# website user home page (by Role)
# role_home_page = {
# 	"Role": "home_page"
# }

# Generators
# ----------

# automatically create page for each record of this doctype
# website_generators = ["Web Page"]

# automatically load and sync documents of this doctype from downstream apps
# importable_doctypes = [doctype_1]

# Jinja
# ----------

# add methods and filters to jinja environment
# jinja = {
# 	"methods": "chw.utils.jinja_methods",
# 	"filters": "chw.utils.jinja_filters"
# }

# Installation
# ------------

# before_install = "chw.install.before_install"
# after_install = "chw.install.after_install"

# Uninstallation
# ------------

# before_uninstall = "chw.uninstall.before_uninstall"
# after_uninstall = "chw.uninstall.after_uninstall"

# Integration Setup
# ------------------
# To set up dependencies/integrations with other apps
# Name of the app being installed is passed as an argument

# before_app_install = "chw.utils.before_app_install"
# after_app_install = "chw.utils.after_app_install"

# Integration Cleanup
# -------------------
# To clean up dependencies/integrations with other apps
# Name of the app being uninstalled is passed as an argument

# before_app_uninstall = "chw.utils.before_app_uninstall"
# after_app_uninstall = "chw.utils.after_app_uninstall"

# Build
# ------------------
# To hook into the build process

# after_build = "chw.build.after_build"

# Desk Notifications
# ------------------
# See frappe.core.notifications.get_notification_config

# notification_config = "chw.notifications.get_notification_config"

# Permissions
# -----------
# Permissions evaluated in scripted ways

# permission_query_conditions = {
# 	"Event": "frappe.desk.doctype.event.event.get_permission_query_conditions",
# }
#
# has_permission = {
# 	"Event": "frappe.desk.doctype.event.event.has_permission",
# }

# Document Events
# ---------------
# Hook on document methods and events

doc_events = {
	"Birth Registration": {
		"after_insert": "chw.api.create_pnc_from_birth_registration"
	}
}

# Scheduled Tasks
# ---------------

scheduler_events = {
	"daily": [
		"chw.tasks.refresh_child_growth_ages",
		"chw.tasks.snapshot_dashboard_stats"
	],
}

# Testing
# -------

# before_tests = "chw.install.before_tests"

# Extend DocType Class
# ------------------------------
#
# Specify custom mixins to extend the standard doctype controller.
# extend_doctype_class = {
# 	"Task": "chw.custom.task.CustomTaskMixin"
# }

# Overriding Methods
# ------------------------------
#
# override_whitelisted_methods = {
# 	"frappe.desk.doctype.event.event.get_events": "chw.event.get_events"
# }
#
# each overriding function accepts a `data` argument;
# generated from the base implementation of the doctype dashboard,
# along with any modifications made in other Frappe apps
# override_doctype_dashboards = {
# 	"Task": "chw.task.get_dashboard_data"
# }

# exempt linked doctypes from being automatically cancelled
#
# auto_cancel_exempted_doctypes = ["Auto Repeat"]

# Ignore links to specified DocTypes when deleting documents
# -----------------------------------------------------------

# ignore_links_on_delete = ["Communication", "ToDo"]

# Request Events
# ----------------
# before_request = ["chw.utils.before_request"]
# after_request = ["chw.utils.after_request"]

# Job Events
# ----------
# before_job = ["chw.utils.before_job"]
# after_job = ["chw.utils.after_job"]

# User Data Protection
# --------------------

# user_data_fields = [
# 	{
# 		"doctype": "{doctype_1}",
# 		"filter_by": "{filter_by}",
# 		"redact_fields": ["{field_1}", "{field_2}"],
# 		"partial": 1,
# 	},
# 	{
# 		"doctype": "{doctype_2}",
# 		"filter_by": "{filter_by}",
# 		"partial": 1,
# 	},
# 	{
# 		"doctype": "{doctype_3}",
# 		"strict": False,
# 	},
# 	{
# 		"doctype": "{doctype_4}"
# 	}
# ]

# Authentication and authorization
# --------------------------------

# auth_hooks = [
# 	"chw.auth.validate"
# ]

# Automatically update python controller files with type annotations for this app.
# export_python_type_annotations = True

# default_log_clearing_doctypes = {
# 	"Logging DocType Name": 30  # days to retain logs
# }

# Translation
# ------------
# List of apps whose translatable strings should be excluded from this app's translations.
# ignore_translatable_strings_from = []


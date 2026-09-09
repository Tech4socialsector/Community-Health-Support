import frappe

# Sits alongside the existing "Program Coordinator" and "CHW Health Worker"
# roles (created earlier, outside any patch) rather than reusing/renaming
# either - these four are net-new, distinct roles for the app's other
# personas (data collection, area coordination, program-level oversight,
# and read-only reporting access).
NEW_ROLES = [
	"Data Collector",
	"Coordinator",
	"Program Manager",
	"Report Viewer",
]


def execute():
	for role_name in NEW_ROLES:
		if frappe.db.exists("Role", role_name):
			continue
		frappe.get_doc({
			"doctype": "Role",
			"role_name": role_name,
			# Matches the existing CHW Health Worker / Program Coordinator
			# roles' own desk_access=1 - without it a user with only this
			# role couldn't log into /app at all, which would block e.g. a
			# Report Viewer from ever opening a report.
			"desk_access": 1,
		}).insert(ignore_permissions=True)
	frappe.db.commit()

import frappe


def execute():
	"""The "CHW App" tile on the Desk home page (a Desktop Icon, not the
	Workspace of the same name) had link_type "Workspace Sidebar" with no
	link configured, so clicking it opened an empty desk workspace instead
	of the actual Vue frontend. Desktop Icon supports link_type "External"
	precisely for pointing a tile at an arbitrary URL - see get_route() in
	frappe/desk/page/desktop/desktop.js, which routes to
	`window.location.origin + link` for that link_type."""
	if not frappe.db.exists("Desktop Icon", "CHW App"):
		return
	frappe.db.set_value(
		"Desktop Icon",
		"CHW App",
		{
			"link_type": "External",
			"link": "/chw",
		},
	)

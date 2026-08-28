import frappe


def execute():
	"""The "CHW App" workspace tile on the Desk home page opened its own
	(empty) workspace content instead of the actual Vue frontend - there was
	no shortcut from Desk into the app users actually work in. Workspace
	supports a `type: "URL"` mode (external_link) precisely for turning a
	tile into a plain redirect instead of a content page, so point it at
	/chw rather than building a separate app-switcher entry point."""
	if not frappe.db.exists("Workspace", "CHW App"):
		return
	frappe.db.set_value(
		"Workspace",
		"CHW App",
		{
			"type": "URL",
			"external_link": "/chw",
		},
	)

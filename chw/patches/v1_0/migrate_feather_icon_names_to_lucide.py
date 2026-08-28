import frappe

# App Module Setting, App Module DocType Item, CHW Dashboard Card, and CHW
# App Module's icon fields switched from a Feather-icon Select to Frappe's
# native Icon fieldtype (Lucide-based, so the Desk gets the real grid+search
# icon picker instead of a plain dropdown). Most Feather names carried over
# unchanged, but Lucide renamed roughly 45 of them during its fork - this
# rewrites any already-stored value using one of those old names to its
# Lucide equivalent, so existing configuration keeps rendering the icon it
# was set up with instead of silently falling back to a blank circle.
# Mirrors frontend/src/data/legacyIconNames.js - keep the two in sync.
LEGACY_ICON_NAME_MAP = {
	"alert-circle": "circle-alert",
	"alert-octagon": "octagon-alert",
	"alert-triangle": "triangle-alert",
	"align-center": "align-horizontal-justify-center",
	"align-justify": "text-align-justify",
	"align-left": "align-horizontal-justify-start",
	"align-right": "align-horizontal-justify-end",
	"arrow-down-circle": "circle-arrow-down",
	"arrow-left-circle": "circle-arrow-left",
	"arrow-right-circle": "circle-arrow-right",
	"arrow-up-circle": "circle-arrow-up",
	"bar-chart": "chart-bar",
	"bar-chart-2": "chart-bar-big",
	"check-circle": "circle-check",
	"check-square": "square-check",
	"columns": "columns-3",
	"divide-circle": "circle-divide",
	"divide-square": "square-divide",
	"download-cloud": "cloud-download",
	"edit": "pencil",
	"edit-2": "pencil",
	"edit-3": "pen-line",
	"filter": "list-filter",
	"git-commit": "git-commit-vertical",
	"grid": "grid-3x3",
	"help-circle": "circle-question-mark",
	"home": "house",
	"layout": "layout-panel-left",
	"minus-circle": "circle-minus",
	"minus-square": "square-minus",
	"more-horizontal": "ellipsis",
	"more-vertical": "ellipsis-vertical",
	"pause-circle": "circle-pause",
	"pie-chart": "chart-pie",
	"play-circle": "circle-play",
	"plus-circle": "circle-plus",
	"plus-square": "square-plus",
	"sidebar": "panel-left",
	"sliders": "sliders-vertical",
	"stop-circle": "circle-stop",
	"tool": "wrench",
	"unlock": "lock-open",
	"upload-cloud": "cloud-upload",
	"x-circle": "circle-x",
	"x-octagon": "octagon-x",
	"x-square": "square-x",
}

DOCTYPES = [
	"App Module Setting",
	"App Module DocType Item",
	"CHW Dashboard Card",
	"CHW App Module",
]


def execute():
	for doctype in DOCTYPES:
		if not frappe.db.exists("DocType", doctype):
			continue
		rows = frappe.get_all(doctype, fields=["name", "icon"])
		for row in rows:
			new_name = LEGACY_ICON_NAME_MAP.get(row.icon)
			if new_name:
				frappe.db.set_value(doctype, row.name, "icon", new_name, update_modified=False)
	frappe.db.commit()

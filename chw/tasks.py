import frappe
from dateutil.relativedelta import relativedelta
from frappe.utils import getdate, today

from chw.common.doctype.child_growth_monitoring.child_growth_monitoring import get_care_stage

# Same keys chw.api.chw_visit_summary() returns and CHW Dashboard Snapshot stores.
DASHBOARD_SNAPSHOT_STAT_KEYS = [
	"scheduled_count",
	"backlog_count",
	"recent_registrations",
	"recent_visits",
	"total_registrations",
	"normal_children",
	"mam_children",
	"sam_children",
	"exit_women_anc",
	"exit_women_pnc",
]


def refresh_child_growth_ages():
	"""Recalculate age/age_in_months/care_stage on every Child Growth Monitoring
	record from today's date, so a child's age and care stage move forward on
	their birthday even if nobody opens or saves the record."""
	today_date = getdate(today())
	records = frappe.get_all(
		"Child Growth Monitoring",
		fields=["name", "date_of_birth", "age", "age_in_months", "care_stage"],
	)

	for record in records:
		if not record.date_of_birth:
			continue

		dob = getdate(record.date_of_birth)
		delta = relativedelta(today_date, dob)
		age = str(delta.years)
		age_in_months = delta.years * 12 + delta.months
		care_stage = get_care_stage(age_in_months)

		if (
			age == record.age
			and age_in_months == record.age_in_months
			and care_stage == record.care_stage
		):
			continue

		frappe.db.set_value(
			"Child Growth Monitoring",
			record.name,
			{"age": age, "age_in_months": age_in_months, "care_stage": care_stage},
			update_modified=False,
		)

	frappe.db.commit()


def snapshot_dashboard_stats():
	"""Record today's program-wide dashboard stats (chw.api.chw_visit_summary,
	called unscoped so it returns global totals) so the Vue app's Dashboard can
	chart a real trend over time instead of only ever showing a single
	point-in-time number."""
	from chw.api import chw_visit_summary

	today_date = getdate(today())
	summary = chw_visit_summary()

	values = {key: summary.get(key, 0) for key in DASHBOARD_SNAPSHOT_STAT_KEYS}

	existing_name = frappe.db.exists("CHW Dashboard Snapshot", {"snapshot_date": today_date})
	if existing_name:
		frappe.db.set_value("CHW Dashboard Snapshot", existing_name, values, update_modified=False)
	else:
		frappe.get_doc({
			"doctype": "CHW Dashboard Snapshot",
			"snapshot_date": today_date,
			**values,
		}).insert(ignore_permissions=True)

	frappe.db.commit()

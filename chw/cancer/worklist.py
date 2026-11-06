"""Clinic worklist: everyone who has moved to Clinical Evaluation, with where
their evaluation stands. The Vue app opens this page from the Clinical
Evaluation tile (pages/ClinicalWorklist.vue)."""

import frappe
from frappe import _
from frappe.desk.reportview import get_match_cond
from frappe.utils import getdate

from chw.cancer.doctype.main_screening_form.main_screening_form import REFERRAL_FIELDS, referred_condition

SITES = tuple(REFERRAL_FIELDS)


def referred_count():
	"""The Home tile's number for Clinical Evaluation: everyone referred (the
	worklist's Total referred), not only the evaluations started so far.
	Same rule and permissions as get_clinical_worklist."""
	if not frappe.has_permission("Main Screening Form", "read"):
		return None
	return frappe.db.sql(
		f"""select count(*) from `tabMain Screening Form`
		where {referred_condition()} {get_match_cond("Main Screening Form")}"""
	)[0][0]


@frappe.whitelist()
def get_clinical_worklist():
	"""Every Main Screening Form with at least one screening finished with
	Referral = Yes (the rule the Clinical Evaluation form uses), and its
	evaluation's status:

	- to_evaluate: no Clinical Evaluation yet (or only cancelled ones)
	- in_progress: saved, not submitted
	- completed: submitted

	The user's own read permissions on both forms apply. Filtering and
	counting happen in the page."""
	if not frappe.has_permission("Clinical Evaluation", "read") or not frappe.has_permission(
		"Main Screening Form", "read"
	):
		frappe.throw(_("You don't have access to Clinical Evaluation."), frappe.PermissionError)

	site_columns = ", ".join(f"`{site}_finished`, `{site}_finished_on`, `{field}`" for site, field in REFERRAL_FIELDS.items())
	screenings = frappe.db.sql(
		f"""select name, name1, age, gender, mobile_number, village, owner, {site_columns}
		from `tabMain Screening Form`
		where {referred_condition()}
			{get_match_cond("Main Screening Form")}""",
		as_dict=True,
	)
	if not screenings:
		return []

	evaluations = {}
	for evaluation in frappe.get_all(
		"Clinical Evaluation",
		filters={"main_screening_form": ["in", [s.name for s in screenings]], "docstatus": ["<", 2]},
		fields=["name", "main_screening_form", "docstatus"],
		order_by="creation asc",
	):
		evaluations[evaluation.main_screening_form] = evaluation

	owners = {s.owner for s in screenings}
	full_names = {
		u.name: u.full_name or u.name
		for u in frappe.get_all("User", filters={"name": ["in", list(owners)]}, fields=["name", "full_name"])
	}

	rows = []
	for s in screenings:
		sites = [site for site, field in REFERRAL_FIELDS.items() if s.get(field) == "Yes" and s.get(f"{site}_finished")]
		finished_on = [getdate(s.get(f"{site}_finished_on")) for site in sites if s.get(f"{site}_finished_on")]
		evaluation = evaluations.get(s.name)
		if not evaluation:
			status = "to_evaluate"
		elif evaluation.docstatus == 1:
			status = "completed"
		else:
			status = "in_progress"
		rows.append(
			{
				"screening": s.name,
				"patient_name": s.name1,
				"age": s.age,
				"gender": s.gender,
				"mobile_number": s.mobile_number,
				"village": s.village,
				"screened_by": full_names.get(s.owner, s.owner),
				"sites": sites,
				"referred_on": str(min(finished_on)) if finished_on else None,
				"status": status,
				"evaluation": evaluation.name if evaluation else None,
			}
		)
	# Oldest referral first - the one waiting longest is at the top.
	rows.sort(key=lambda r: (r["referred_on"] or "9999-99-99", r["screening"]))
	return rows

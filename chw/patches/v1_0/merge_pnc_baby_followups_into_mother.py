import frappe

# PNC used to keep the baby in three tables of its own (Volunteer, Nurse,
# Doctor). Mother and baby are now recorded together (user, 2026-10-29): the
# baby's fields live on the mother's rows as baby_* fields. This moves any
# existing baby rows onto the mother row of the same visit date, or adds a
# row for that date when the mother has none, so no baby record is lost.
# The old baby tables are no longer on PNC; their rows are left in place.

# Baby PNC Followup Child field -> PNC Followup Child field.
VOLUNTEER = {
	"feeding": "baby_feeding",
	"jaundice": "baby_jaundice",
	"umbilical_cord": "baby_umbilical_cord",
	"weight_gain": "baby_weight_gain",
	"immunization": "baby_immunization",
	"any_other_complaintsremarks": "baby_any_other_complaintsremarks",
	"baby_condition": "baby_condition",
	"feeding_if_other": "baby_feeding_if_other",
	"if_other_feedong_problem": "baby_if_other_feedong_problem",
	"babys_current_age": "babys_current_age",
	"baby_skin_condition": "baby_skin_condition",
	"rr": "baby_rr",
	"hr": "baby_hr",
	"temp": "baby_temp",
	"birth_weight_populate": "baby_birth_weight_populate",
	"current_weight": "baby_current_weight",
	"current_length": "baby_current_length",
	"babys_general_condition": "babys_general_condition",
	"if_unwell": "baby_if_unwell",
	"if_baby_general_condition_is_other": "baby_if_baby_general_condition_is_other",
	"mch_nurse_notified_of_danger_signs": "baby_mch_nurse_notified_of_danger_signs",
	"immunisation_up_to_date": "baby_immunisation_up_to_date",
	"which_ones_are_missing": "baby_which_ones_are_missing",
	"care_provided_recomendations_given": "baby_care_provided_recomendations_given",
}
VOLUNTEER_SHARED = ("window_start_date", "date", "status", "date_of_next_visit", "next_visit_window", "urgent_followup")

# Nurse / Doctor notes: the baby's own vitals and notes.
NOTES = {f: "baby_" + f for f in ("hr", "rr", "temp", "height", "weight", "o2sat", "subjective", "objective", "assessment", "plan")}

TABLES = (
	# old baby table, old PNC field, mother table, PNC field, field map, date field, shared fields
	("Baby PNC Followup Child", "baby", "PNC Followup Child", "mother", VOLUNTEER, "date", VOLUNTEER_SHARED),
	("PNC Child Followup Nurse Notes", "baby_followup_nurse_notes", "PNC Followup Mother Nurse Notes", "mother_folloup_nurse_notes", NOTES, "visit_date", ("visit_date",)),
	("PNC Child Followup Docter Notes", "baby_followup_docter_notes", "PNC Followup Mother Docter Notes", "mother_followup_docter_notes", NOTES, "visit_date", ("visit_date",)),
)


def execute():
	for old_dt, old_field, new_dt, new_field, fields, date_field, shared in TABLES:
		if not frappe.db.table_exists(old_dt):
			continue
		for baby in frappe.db.get_all(old_dt, filters={"parenttype": "PNC", "parentfield": old_field}, fields=["*"], order_by="parent, idx"):
			values = {new: baby.get(old) for old, new in fields.items() if baby.get(old) not in (None, "")}
			if not values:
				continue
			match = frappe.db.get_value(
				new_dt, {"parent": baby.parent, "parentfield": new_field, date_field: baby.get(date_field)}, "name"
			)
			if match:
				frappe.db.set_value(new_dt, match, values, update_modified=False)
				continue
			idx = (frappe.db.count(new_dt, {"parent": baby.parent, "parentfield": new_field}) or 0) + 1
			row = frappe.get_doc(
				{
					"doctype": new_dt,
					"parent": baby.parent,
					"parenttype": "PNC",
					"parentfield": new_field,
					"idx": idx,
					**{f: baby.get(f) for f in shared},
					**values,
				}
			)
			row.db_insert()

import frappe

# The single-choice symptom list (yesoral) became one tick box per symptom.
SYMPTOM_CHECKS = {
	"Ulcer in the mouth": "symptom_ulcer_in_the_mouth",
	"Swelling – neck/oral cavity": "symptom_swelling_neck_oral_cavity",
	"Difficulty in swallowing": "symptom_difficulty_in_swallowing",
	"Change in voice": "symptom_change_in_voice",
	"Sharp teeth/ denture if yes (a open field to enter details)": "symptom_sharp_teeth_denture",
	"Others": "symptom_others",
}


def execute():
	"""Main Screening Form's Oral Screening tab now follows the Oral Screening
	Questionnaire. Move answers saved in the old layout to the new one:
	- Oral Examination "Not Known" -> "Not now";
	- the old single symptom choice -> its tick box;
	- Leukoplakia's "Site"/"Size" dropdown choice is gone (Site and Size are
	  both text boxes now and already hold the values) - cleared;
	- single-lesion "Erythro- Leukoplakia" -> Heterogenous + Erythro- Leukoplakia;
	- Oral Screening Status worked out for every record."""
	frappe.reload_doc("cancer", "doctype", "main_screening_form")
	dt = "Main Screening Form"

	frappe.db.set_value(dt, {"oral_examination": "Not Known"}, "oral_examination", "Not now", update_modified=False)

	for name, choice in frappe.get_all(dt, filters={"yesoral": ["is", "set"]}, fields=["name", "yesoral"], as_list=True):
		if field := SYMPTOM_CHECKS.get(choice):
			frappe.db.set_value(dt, name, {"symptoms": "Yes", field: 1}, update_modified=False)

	frappe.db.set_value(dt, {"if_leukoplakia__is_yes": ["in", ["Site", "Size"]]}, "if_leukoplakia__is_yes", "", update_modified=False)
	frappe.db.set_value(
		dt,
		{"if_single_lesion": "Erythro- Leukoplakia"},
		{"if_single_lesion": "Heterogenous", "if_heterogenous": "Erythro- Leukoplakia"},
		update_modified=False,
	)

	for name in frappe.get_all(dt, pluck="name"):
		doc = frappe.get_doc(dt, name)
		doc.set_oral_screening_status()
		frappe.db.set_value(dt, name, "oral_screening_status", doc.oral_screening_status, update_modified=False)

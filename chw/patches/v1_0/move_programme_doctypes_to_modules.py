import frappe

# Each programme's forms, child tables and masters, by the module they now
# live in. They used to sit in Common (forms, child tables) and CHW Master
# (masters). Household profile, Family members and the common masters stay.
MOVES = {
	"MCH": [
		"ANC Follow-up",
		"ANC Followup Child",
		"ANC Followup Docter",
		"ANC Followup Nurse",
		"ANC Visit Interval Master",
		"Baby PNC Followup Child",
		"Birth Registration",
		"Child 6w to 1 Year Followup",
		"Child 6w to 1 Year Reg and Followup",
		"Child 6w to 1y Followup Docter",
		"Child 6w to 1y Nurse Followup",
		"Child 6w-1y Visit Interval Master",
		"Child 6w-1y Visit Schedule Row",
		"Child Growth Followup",
		"Child Growth Monitoring",
		"MCH Volunteer Intake Form Postpartum",
		"Malnutrition Category Master",
		"PNC",
		"PNC Child Followup Docter Notes",
		"PNC Child Followup Nurse Notes",
		"PNC Followup Child",
		"PNC Followup Mother Docter Notes",
		"PNC Followup Mother Nurse Notes",
		"PNC Visit Interval Master",
		"PNC Visit Schedule Row",
		"Postpartum Followup",
		"Postpartum Reg and Followup",
		"Postpartum Visit Interval Master",
		"Postpartum Visit Schedule Row",
		"Preconception Delivery History",
		"Preconception Docter Notes",
		"Preconception Followup",
		"Preconception Nurse Notes",
		"Preconception Reg and Followup",
		"Pregancy",
		"Pregnancy High Risk Master",
		"Pregnancy Registration",
		"Previous ANC Visits for Mother",
		"Risk Child",
	],
	"Palliative Care": [
		"Are pressure sores present",
		"Assessment Summary Child",
		"CHW APF",
		"Cardiovascular",
		"Cardiovascular child",
		"Does the patient need",
		"Does the patient need Child",
		"Gastrointestinal",
		"Gastrointestinal Child",
		"Genitourinary",
		"Genitourinary Child",
		"Medical Followup Form",
		"Musculatory System",
		"Musculatory System Child",
		"Neurological",
		"Neurological child",
		"Pain Child",
		"Palliative Care Initial Assessment Form",
		"Palliative care followup",
		"Past Medical History Child",
		"Past Medical History Master",
		"Pressure Sore",
		"Primary Caregiver child",
		"Respiratory",
		"Respiratory Child",
		"Symptoms",
		"Symptoms Child",
	],
	"Mental Health Care": [
		"Medicine and frequency",
		"Mental Health",
		"Mental Health Followup Child",
		"Mental Health Symptom",
		"Mental Health Symptom Master",
	],
	"NCD Care": [
		"NCD",
		"NCD Complications",
		"NCD Disease",
		"NCD Followup Child",
	],
}


def execute():
	"""Point the moved DocTypes at their new module before the model sync.

	The folders moved in the code (chw/common/doctype/pnc ->
	chw/mch/doctype/pnc, ...). The sync that follows this patch reads each
	DocType's JSON from its new folder, but Frappe finds a DocType's
	controller and form script through the `module` stored on the site, so
	that has to say MCH, Palliative Care, ... first. Only the `module`
	column changes: no table, field, record or DocType name is touched.

	The new Module Def rows already exist by now - migrate registers modules
	declared in modules.txt before running any patch."""
	for module, doctypes in MOVES.items():
		frappe.db.set_value("DocType", {"name": ["in", doctypes]}, "module", module, update_modified=False)
	frappe.clear_cache()

	# The model sync right after this patch walks the module folders it finds
	# in the cached app -> modules map, which was built from modules.txt
	# before the four new modules were added to it. Rebuild it now, or this
	# migrate skips their workspaces and sidebars and only the next one picks
	# them up.
	frappe.cache.delete_value("app_modules")
	frappe.client_cache.delete_value("installed_app_modules")
	frappe.setup_module_map()

import frappe

# Categories as per the Rights of Persons with Disabilities (RPWD) Act, 2016
TYPES_OF_DISABILITY = [
	"Locomotor Disability",
	"Visual Impairment",
	"Low Vision",
	"Hearing Impairment (Deaf/Hard of Hearing)",
	"Speech and Language Disability",
	"Intellectual Disability",
	"Specific Learning Disability",
	"Autism Spectrum Disorder",
	"Mental Illness",
	"Cerebral Palsy",
	"Muscular Dystrophy",
	"Chronic Neurological Conditions",
	"Multiple Sclerosis",
	"Dwarfism",
	"Acid Attack Victim",
	"Thalassemia",
	"Hemophilia",
	"Sickle Cell Disease",
	"Multiple Disabilities",
]


def execute():
	frappe.reload_doc("chw_master", "doctype", "type_of_disability")
	for disability_type in TYPES_OF_DISABILITY:
		if not frappe.db.exists("Type Of Disability", disability_type):
			frappe.get_doc({
				"doctype": "Type Of Disability",
				"name": disability_type,
			}).insert(ignore_permissions=True)

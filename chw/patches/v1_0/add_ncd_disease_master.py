import frappe

# interval_days: how often (in days) a patient with this disease should be followed up
COMMON_NCD_DISEASES = {
	"Diabetes Mellitus": 30,
	"Hypertension": 30,
	"Chronic Obstructive Pulmonary Disease (COPD)": 30,
	"Chronic Kidney Disease (CKD)": 30,
	"Cardiovascular Disease": 30,
	"Cancer": 15,
	"Stroke": 15,
	"Obesity": 60,
	"Thyroid Disorder": 60,
}


def execute():
	frappe.reload_doc("chw_master", "doctype", "ncd_disease")
	for disease, interval_days in COMMON_NCD_DISEASES.items():
		if frappe.db.exists("NCD Disease", disease):
			frappe.db.set_value("NCD Disease", disease, "interval_days", interval_days)
		else:
			frappe.get_doc({
				"doctype": "NCD Disease",
				"name": disease,
				"interval_days": interval_days,
			}).insert(ignore_permissions=True)

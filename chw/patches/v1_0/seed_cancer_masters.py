"""The option lists the Cancer forms need, so a new site (Frappe Cloud UAT)
can fill and finish a screening: without them the required multi-selects
(breast palpation, referred for, cervix findings, HR-HPV result) have
nothing to choose. Options are from "Screening Forms - version 2"; Habits,
Medical History and Relationship from the forms in use.

Only adds what's missing - values a site added itself are kept."""

import frappe

MASTERS = {
    "Breast Palpation Finding": [
        "Normal/Fibro glandular", "Nodularity", "FCC changes", "Thickening",
        "Freely mobile lump", "Suspicious lumps", "Others",
    ],
    "Breast Referral Type": ["Breast/Pathology axillary", "Baseline Mammogram", "Ultrasound Breasts"],
    "Cervical Referral Type": ["Colposcopy", "Colpo guided biopsy", "Others"],
    "Cervix Visual Finding": [
        "Healthy cervix", "Cervix polyp", "Cervicitis", "Nab. Follicles", "Erosion",
        "Leukoplakia", "Condyloma", "Growth / Invasive cancer",
    ],
    "HPV DNA Result Type": ["PS", "SS", "Others"],
    "Habit Master": ["Chewing Tobacco", "Smoking", "Alcohol"],
    "Type of Habit Master": ["Chewing Tobacco", "Smoking", "Alcohol", "Snuff / Others"],
    "Medical History": ["Hypertension", "Diabetes"],
    "Relationship with the Head of the Family": [
        "Self", "Wife", "Husband", "Son", "Daughter", "Father", "Mother", "Brother", "Sister",
        "Son-in-law", "Daughter-in-law", "Grandson", "Granddaughter", "Others",
    ],
}


def execute():
    for doctype, values in MASTERS.items():
        if not frappe.db.exists("DocType", doctype):
            continue
        frappe.reload_doctype(doctype)
        for value in values:
            if frappe.db.exists(doctype, value):
                continue
            frappe.get_doc({"doctype": doctype}).insert(set_name=value, ignore_permissions=True)

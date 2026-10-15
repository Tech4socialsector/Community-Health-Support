# Copyright (c) 2026, tech4socialsector@azimpremjifoundation.org and contributors
# For license information, please see license.txt

# import frappe
from frappe.model.document import Document


class MentalHealth(Document):
	# begin: auto-generated types
	# This code is auto-generated. Do not modify anything in this block.

	from typing import TYPE_CHECKING

	if TYPE_CHECKING:
		from chw.common.doctype.medicine_and_frequency.medicine_and_frequency import Medicineandfrequency
		from chw.common.doctype.mental_health_followup_child.mental_health_followup_child import MentalHealthFollowupChild
		from chw.common.doctype.mental_health_symptom.mental_health_symptom import MentalHealthSymptom
		from frappe.types import DF

		age: DF.Int
		assigned_health_worker: DF.Link | None
		consent_obtained: DF.Check
		date_of_registration: DF.Date | None
		emergency_contact: DF.Data | None
		family_members: DF.Link | None
		gender: DF.Literal["", "Male", "Female", "Other"]
		guardian_name: DF.Data | None
		household_profile: DF.Link | None
		illness: DF.Data | None
		medicines: DF.Table[Medicineandfrequency]
		mental_health_followup_child: DF.Table[MentalHealthFollowupChild]
		patient_name: DF.Data
		phone_number: DF.Data | None
		remarks: DF.SmallText | None
		risk_flag: DF.Literal["", "None", "Self-harm Risk", "Suicide Risk", "Violence Risk"]
		status: DF.Literal["", "Active", "Stable", "Relapsed", "Discharged", "Lost to Follow-up"]
		symptoms: DF.Table[MentalHealthSymptom]
		village: DF.Link | None
	# end: auto-generated types

	pass

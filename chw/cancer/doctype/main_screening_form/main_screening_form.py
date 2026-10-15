# Copyright (c) 2026, TFSS and contributors
# For license information, please see license.txt

# import frappe
from frappe.model.document import Document


class MainScreeningForm(Document):
	def validate(self):
		self.set_cervical_screening_status()

	def set_cervical_screening_status(self):
		# "Not now" on any cervical question keeps the screening open so it can be finished later
		if self.cervical_screening == "Not Done":
			status = "Not Done"
		elif self.cervical_screening != "Done":
			status = "Pending"
		elif "Not now" in (self.cervical_visual_inspection, self.hr_hpv_dna, self.cytology, self.visual_test):
			status = "Pending"
		elif self.cervical_referral == "Yes":
			status = "Moved to Clinical Evaluation"
		elif self.cervical_referral == "No":
			status = "Completed"
		else:
			status = "In Progress"
		self.cervical_screening_status = status

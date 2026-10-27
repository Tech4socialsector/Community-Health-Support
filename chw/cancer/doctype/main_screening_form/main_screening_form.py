# Copyright (c) 2026, TFSS and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.model.document import Document


class MainScreeningForm(Document):
	def validate(self):
		self.keep_oral_no_closed()
		self.set_oral_screening_status()
		self.set_cervical_screening_status()

	def keep_oral_no_closed(self):
		# Oral Screening Questionnaire: "No - the screening form doesn't open
		# for the patient & once submitted cannot be reopened".
		if self.is_new():
			return
		saved = frappe.db.get_value(self.doctype, self.name, "oral_examination")
		if saved == "No" and self.oral_examination != "No":
			frappe.throw(
				_("Oral Examination was saved as No, so the oral screening can't be reopened for this person."),
				title=_("Oral screening closed"),
			)

	def set_oral_screening_status(self):
		# Same states as the cervical status below. "Not now" (or nothing yet)
		# stays Pending until Yes or No is marked.
		if self.oral_examination == "No":
			status = "Not Screened"
		elif self.oral_examination != "Yes":
			status = "Pending"
		elif self.refferal == "Yes":
			status = "Moved to Clinical Evaluation"
		elif self.refferal == "No":
			status = "Completed"
		else:
			status = "In Progress"
		self.oral_screening_status = status

	def is_referred(self):
		"""Referred for clinical evaluation from any of the three questionnaires."""
		return "Yes" in (self.refferal, self.breast_referral, self.cervical_referral)

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

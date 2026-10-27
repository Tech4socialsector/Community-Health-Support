# Copyright (c) 2026, TFSS and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.model.document import Document


class ClinicalEvaluation(Document):
	def validate(self):
		self.check_referred()

	def check_referred(self):
		# Only a screening that ended in a referral (Oral, Breast or Cervical
		# "Referral = Yes") moves the patient to clinical evaluation.
		if not self.is_new() or not self.main_screening_form:
			return
		screening = frappe.get_doc("Main Screening Form", self.main_screening_form)
		if not screening.is_referred():
			frappe.throw(
				_("{0} has no referral, so the patient doesn't move to clinical evaluation. Mark Referral = Yes on the screening first.").format(
					self.main_screening_form
				),
				title=_("Not referred"),
			)

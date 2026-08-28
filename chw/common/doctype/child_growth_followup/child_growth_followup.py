# Copyright (c) 2026, tech4socialsector@azimpremjifoundation.org and contributors
# For license information, please see license.txt

from frappe.model.document import Document


class ChildGrowthFollowup(Document):
	def validate(self):
		self.set_classification()

	def set_classification(self):
		if self.edema == "Yes":
			self.classification = "SAM"
			return

		if self.muac is None:
			return

		if self.muac < 11.5:
			self.classification = "SAM"
		elif self.muac < 12.5:
			self.classification = "MAM"
		else:
			self.classification = "Normal"

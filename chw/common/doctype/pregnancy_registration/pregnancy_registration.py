# Copyright (c) 2026, tech4socialsector@azimpremjifoundation.org and contributors
# For license information, please see license.txt

from frappe.model.document import Document
from frappe.utils import add_days, getdate, today
from chw.api import validate_phone_number


class PregnancyRegistration(Document):
	def validate(self):
		validate_phone_number(self.phone_number)
		if self.lmp_date:
			self.estimated_date_of_delivery = add_days(self.lmp_date, 281)
		self.calculate_pog()
		self.calculate_bmi()

	def calculate_pog(self):
		if not self.lmp_date:
			self.pog = ""
			return

		days_pregnant = (getdate(today()) - getdate(self.lmp_date)).days
		weeks, days = divmod(days_pregnant, 7)
		self.pog = f"{weeks} weeks {days} days"

	def calculate_bmi(self):
		if not self.height or not self.weight:
			self.bmi_calculation = None
			return

		try:
			weight_kg = float(self.weight)
		except ValueError:
			self.bmi_calculation = None
			return

		height_m = self.height / 100
		self.bmi_calculation = round(weight_kg / (height_m**2), 1)
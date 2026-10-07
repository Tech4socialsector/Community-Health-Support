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
		self.calculate_trimester()
		self.calculate_trimester_at_registration()
		self.calculate_bmi()

	def calculate_pog(self):
		if not self.lmp_date:
			self.pog = ""
			return

		days_pregnant = (getdate(today()) - getdate(self.lmp_date)).days
		weeks, days = divmod(days_pregnant, 7)
		self.pog = f"{weeks} weeks {days} days"

	def calculate_trimester(self):
		# Automatic only - no manual selection. Refreshed here on every save
		# of this record, and separately kept fresh roughly monthly by
		# ANCFollowup.sync_patient_condition_to_pregnancy (the same place
		# high_risk already gets written back), since Pregnancy Registration
		# itself may otherwise sit untouched for most of the pregnancy.
		if not self.lmp_date:
			self.trimester = ""
			return

		weeks = (getdate(today()) - getdate(self.lmp_date)).days // 7
		if weeks <= 13:
			self.trimester = "First trimester"
		elif weeks <= 27:
			self.trimester = "Second trimester"
		else:
			self.trimester = "Third trimester"

	def calculate_trimester_at_registration(self):
		# Same LMP -> weeks -> trimester math as calculate_trimester, but
		# frozen at the moment she was first registered - set only on the
		# very first save (is_new()), then never touched again, unlike
		# Trimester above which keeps recalculating to "today" on every
		# later save.
		if not self.is_new() or not self.lmp_date:
			return

		weeks = (getdate(today()) - getdate(self.lmp_date)).days // 7
		if weeks <= 13:
			self.trimester_at_registration = "First trimester"
		elif weeks <= 27:
			self.trimester_at_registration = "Second trimester"
		else:
			self.trimester_at_registration = "Third trimester"

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
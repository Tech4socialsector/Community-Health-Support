# Copyright (c) 2026, tech4socialsector@azimpremjifoundation.org and contributors
# For license information, please see license.txt

import frappe
from dateutil.relativedelta import relativedelta
from frappe import _
from frappe.model.document import Document
from frappe.utils import add_days, add_months, getdate, today
from chw.api import sync_next_visit_todo, validate_phone_number

STAGE_0_TO_6M = "0-6 Months"
STAGE_6M_TO_5Y = "6 Months to 5 Years"
STAGE_5Y_TO_11Y = "5 Years to 11 Years"
STAGE_ABOVE_11Y = "Above 11 Years"

AGE_MONTHS_6 = 6
AGE_MONTHS_5Y = 60
AGE_MONTHS_11Y = 132


def get_care_stage(age_in_months):
	"""Map an age in months to its Child Growth Monitoring care stage."""
	if age_in_months is None:
		return ""
	if age_in_months <= AGE_MONTHS_6:
		return STAGE_0_TO_6M
	if age_in_months <= AGE_MONTHS_5Y:
		return STAGE_6M_TO_5Y
	if age_in_months <= AGE_MONTHS_11Y:
		return STAGE_5Y_TO_11Y
	return STAGE_ABOVE_11Y


def get_stage_for_date(dob, visit_date):
	delta = relativedelta(getdate(visit_date), getdate(dob))
	return get_care_stage(delta.years * 12 + delta.months)


class ChildGrowthMonitoring(Document):
	def validate(self):
		validate_phone_number(self.phone_number)
		self.calculate_age()
		self.generate_visit_schedule()
		self.set_row_classifications()
		self.set_next_followup_date()

	def on_update(self):
		sync_next_visit_todo(
			self,
			"next_followup_date",
			f"Growth monitoring visit due for {self.first_name}",
		)

	def set_row_classifications(self):
		# Frappe doesn't call a child row's own validate() automatically when the
		# parent is saved, so each row's classification has to be set explicitly here.
		for row in self.growth_followup:
			row.set_classification()

	def calculate_age(self):
		if not self.date_of_birth:
			self.age = ""
			self.age_in_months = 0
			self.care_stage = ""
			return

		dob = getdate(self.date_of_birth)
		now = getdate(today())

		if dob > now:
			frappe.throw(_("Date of Birth cannot be in the future."))

		delta = relativedelta(now, dob)
		self.age = str(delta.years)
		self.age_in_months = delta.years * 12 + delta.months
		self.care_stage = get_care_stage(self.age_in_months)

	def generate_visit_schedule(self):
		"""Pre-fill the Growth Followup table with:
		- 0-5 year visits on the same monthly, MUAC/edema-tracked schedule the
		  retired Malnutrition doctype used (interval sourced from Malnutrition
		  Category Master "Normal", so SAM/MAM classification and its follow-up
		  timing behave identically to before), and
		- yearly visits from age 6 to age 11, which is new coverage.
		"""
		if self.growth_followup or not self.date_of_birth:
			return

		dob = getdate(self.date_of_birth)

		interval_days = frappe.db.get_value("Malnutrition Category Master", "Normal", "interval_days") or 30
		end_date_0_5y = add_months(dob, AGE_MONTHS_5Y)
		visit_date = add_days(dob, interval_days)
		while visit_date <= end_date_0_5y:
			self.append("growth_followup", {
				"date": visit_date,
				"stage": get_stage_for_date(dob, visit_date),
				"status": "Pending",
			})
			visit_date = add_days(visit_date, interval_days)

		months = 72
		while months <= AGE_MONTHS_11Y:
			self.append("growth_followup", {
				"date": add_months(dob, months),
				"stage": STAGE_5Y_TO_11Y,
				"status": "Pending",
			})
			months += 12

	def set_next_followup_date(self):
		dated_rows = [row for row in self.growth_followup if row.date]
		if not dated_rows:
			return

		current = getdate(self.next_followup_date) if self.next_followup_date else None
		last_auto = getdate(self.next_followup_date_auto) if self.next_followup_date_auto else None
		if current and last_auto and current != last_auto:
			# user has manually overridden the date; leave it alone
			return

		pending_rows = [row for row in dated_rows if row.status != "Completed"]
		if pending_rows:
			# next visit due is the earliest visit not yet marked Completed
			calculated_date = min(getdate(row.date) for row in pending_rows)
		else:
			last_row = max(dated_rows, key=lambda row: getdate(row.date))
			if last_row.stage == STAGE_5Y_TO_11Y:
				calculated_date = add_months(getdate(last_row.date), 12)
			else:
				interval_days = None
				if last_row.classification:
					interval_days = frappe.db.get_value(
						"Malnutrition Category Master", last_row.classification, "interval_days"
					)
				calculated_date = add_days(getdate(last_row.date), interval_days or 30)

		self.next_followup_date = calculated_date
		self.next_followup_date_auto = calculated_date

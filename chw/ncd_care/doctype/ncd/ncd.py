# Copyright (c) 2026, tech4socialsector@azimpremjifoundation.org and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import add_days, getdate
from chw.api import sync_next_visit_todo, validate_phone_number

HIGH_RISK_INTERVAL_DAYS = 30
NORMAL_RISK_DEFAULT_INTERVAL_DAYS = 60
SCHEDULE_DURATION_DAYS = 365


class NCD(Document):
	def validate(self):
		validate_phone_number(self.phone_number)
		self.validate_age()

		if self.status == "Death":
			self.next_followup_date = None
			self.next_followup_date_auto = None
		else:
			self.generate_visit_schedule()
			self.set_next_followup_date()

	def on_update(self):
		sync_next_visit_todo(
			self,
			"next_followup_date",
			f"NCD follow-up visit due for {self.first_name} ({self.disease or 'NCD'})",
		)

	def validate_age(self):
		if not self.familymember_id:
			return

		age = frappe.db.get_value("Family members", self.familymember_id, "age")
		if age not in (None, "") and int(age) <= 30:
			frappe.throw(_("NCD tracking is only for family members above 30 years of age."))

	def get_interval_days(self):
		if self.high_risk == "Yes":
			return HIGH_RISK_INTERVAL_DAYS

		if self.disease:
			return frappe.db.get_value("NCD Disease", self.disease, "interval_days") or NORMAL_RISK_DEFAULT_INTERVAL_DAYS

		return NORMAL_RISK_DEFAULT_INTERVAL_DAYS

	def generate_visit_schedule(self):
		"""Pre-fill the NCD Followup table with a year of visits at the applicable interval."""
		if self.ncd_followup or not self.familymember_id:
			return

		interval_days = self.get_interval_days()
		today = getdate()
		end_date = add_days(today, SCHEDULE_DURATION_DAYS)
		visit_date = add_days(today, interval_days)
		while visit_date <= end_date:
			self.append("ncd_followup", {"date": visit_date, "status": "Pending"})
			visit_date = add_days(visit_date, interval_days)

	def set_next_followup_date(self):
		dated_rows = [row for row in self.ncd_followup if row.date]
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
			last_date = max(getdate(row.date) for row in dated_rows)
			calculated_date = add_days(last_date, self.get_interval_days())

		self.next_followup_date = calculated_date
		self.next_followup_date_auto = calculated_date

# Copyright (c) 2026, tech4socialsector@azimpremjifoundation.org and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import add_days, add_months, getdate
from chw.api import sync_next_visit_todo, validate_phone_number


PNC_SCHEDULE_DURATION_MONTHS = 6  # postnatal follow-up period, monthly visits


class PNC(Document):
	def validate(self):
		validate_phone_number(self.phone_number)
		self.validate_gender()
		self.generate_visit_schedule()
		self.set_next_pnc_visit_date()

	def on_update(self):
		sync_next_visit_todo(
			self,
			"next_pnc_visit_date",
			f"PNC follow-up visit due for {self.first_name} (Baby: {self.name_of_child})",
		)

	def validate_gender(self):
		if not self.birth_registration_id:
			return

		family_member_id = frappe.db.get_value(
			"Birth Registration", self.birth_registration_id, "family_member_id"
		)
		gender = family_member_id and frappe.db.get_value("Family members", family_member_id, "gender")
		if gender and gender != "Female":
			frappe.throw(_("PNC can only be created for a female family member."))

	def get_interval_days(self):
		return frappe.db.get_single_value("PNC Visit Interval Master", "interval_days") or 30

	def generate_visit_schedule(self):
		"""Pre-fill the mother/baby Followup tables with a monthly postnatal visit
		schedule, for 6 months after delivery."""
		if self.mother or not self.date_of_delivery:
			return

		interval_days = self.get_interval_days()
		start_date = getdate(self.date_of_delivery)
		end_date = add_months(start_date, PNC_SCHEDULE_DURATION_MONTHS)
		visit_date = add_days(start_date, interval_days)
		while visit_date <= end_date:
			self.append("mother", {"date": visit_date, "status": "Pending"})
			self.append("baby", {"date": visit_date, "status": "Pending"})
			visit_date = add_days(visit_date, interval_days)

	def set_next_pnc_visit_date(self):
		dated_rows = [row for row in self.mother if row.date]
		if not dated_rows:
			return

		current = getdate(self.next_pnc_visit_date) if self.next_pnc_visit_date else None
		last_auto = getdate(self.next_pnc_visit_date_auto) if self.next_pnc_visit_date_auto else None
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

		self.next_pnc_visit_date = calculated_date
		self.next_pnc_visit_date_auto = calculated_date

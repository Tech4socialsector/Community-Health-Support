# Copyright (c) 2026, tech4socialsector@azimpremjifoundation.org and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document
from frappe.utils import add_days, getdate
from chw.api import sync_next_visit_todo, validate_phone_number


class ANCFollowup(Document):
	def validate(self):
		validate_phone_number(self.phone_number)
		self.generate_visit_schedule()
		if self.status == "Closed":
			# She's delivered - no more ANC visits are due, regardless of what's
			# still sitting Pending in her schedule (visits scheduled past her
			# actual delivery date can never be completed).
			self.next_anc_visit_date = None
			self.next_anc_visit_date_auto = None
		else:
			self.set_next_anc_visit_date()

	def on_update(self):
		sync_next_visit_todo(
			self,
			"next_anc_visit_date",
			f"ANC follow-up visit due for {self.first_name or self.pregnant_id}",
		)

	def generate_visit_schedule(self):
		"""Pre-fill the ANC Followup table with the full visit schedule (LMP to EDD)."""
		if self.anc_followup or not self.pregnant_id:
			return

		lmp_date, edd = frappe.db.get_value(
			"Pregnancy Registration", self.pregnant_id, ["lmp_date", "estimated_date_of_delivery"]
		)
		if not lmp_date or not edd:
			return

		interval_days = self.get_interval_days()
		edd = getdate(edd)
		visit_date = add_days(getdate(lmp_date), interval_days)
		while visit_date <= edd:
			self.append("anc_followup", {"date": visit_date, "status": "Pending"})
			visit_date = add_days(visit_date, interval_days)

	def get_interval_days(self):
		high_risk = None
		if self.pregnant_id:
			high_risk = frappe.db.get_value("Pregnancy Registration", self.pregnant_id, "high_risk")
		return frappe.db.get_value("ANC Visit Interval Master", high_risk or "No", "interval_days") or 30

	def set_next_anc_visit_date(self):
		dated_rows = [row for row in self.anc_followup if row.date]
		if not dated_rows:
			return

		current = getdate(self.next_anc_visit_date) if self.next_anc_visit_date else None
		last_auto = getdate(self.next_anc_visit_date_auto) if self.next_anc_visit_date_auto else None
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

		self.next_anc_visit_date = calculated_date
		self.next_anc_visit_date_auto = calculated_date

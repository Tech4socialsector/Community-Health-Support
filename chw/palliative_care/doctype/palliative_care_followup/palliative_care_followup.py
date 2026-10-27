# Copyright (c) 2026, tfss and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import getdate

from chw.api import sync_next_visit_todo


class Palliativecarefollowup(Document):
	def validate(self):
		self.validate_followup_dates()
		self.set_next_visit_date()

	def validate_followup_dates(self):
		# Same reasoning as Preconception's own validate_followup_dates - a
		# backdated visit or a next-visit date that isn't genuinely in the
		# future makes "which row is most recent" and "when is she next due"
		# both unreliable, with no calculation engine here to catch it.
		today = getdate()
		for row in self.medical_followup_form:
			if row.visit_date and getdate(row.visit_date) < today:
				frappe.throw(_("Row #{0}: Visit Date cannot be in the past.").format(row.idx))
			if row.next_visit_date and getdate(row.next_visit_date) <= today:
				frappe.throw(_("Row #{0}: Date of Next Visit must be a future date, not today or earlier.").format(row.idx))

	def on_update(self):
		sync_next_visit_todo(
			self,
			"next_visit_date",
			f"Palliative care followup visit due for {self.name1 or self.name}",
		)

	def set_next_visit_date(self):
		# Medical Followup and Therapist Followup are two independent
		# tracks - a doctor's own schedule and a therapist's own schedule
		# for the same patient, added whenever that professional actually
		# visits, no Pending/Completed status on either. Each track's own
		# next-due is simply its latest row's own next-date field; the
		# parent shows whichever of the two is due sooner, same rule PNC
		# uses for Mother/Baby - just without an urgent-priority tier on
		# top, since neither track here has any Risk/condition concept at
		# all to make something "urgent" in the first place.
		medical_next = self._latest_next_date(self.medical_followup_form, "next_visit_date")
		therapist_next = self._latest_next_date(self.therapist_followup, "next_review_date")

		candidates = [d for d in (medical_next, therapist_next) if d]
		if not candidates:
			return

		current = getdate(self.next_visit_date) if self.next_visit_date else None
		last_auto = getdate(self.next_visit_date_auto) if self.next_visit_date_auto else None
		if current and last_auto and current != last_auto:
			return

		calculated_date = min(candidates)
		self.next_visit_date = calculated_date
		self.next_visit_date_auto = calculated_date

	@staticmethod
	def _latest_next_date(table, fieldname):
		rows = [row for row in table if row.get(fieldname)]
		if not rows:
			return None
		return getdate(rows[-1].get(fieldname))

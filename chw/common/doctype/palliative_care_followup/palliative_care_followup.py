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
		# Same reasoning as Preconception's own validate_followup_dates for a
		# COMPLETED row - a backdated visit or a next-visit date that isn't
		# genuinely in the future makes "which row is most recent" and "when
		# is she next due" both unreliable. A Pending row is different: it
		# represents a visit scheduled for later that hasn't happened yet,
		# and its Visit Date is *expected* to drift into the past the longer
		# it stays undone - that's exactly what "Overdue" in the Work Order
		# list means, so it's never blocked here. Checked on both tracks -
		# Medical and Therapist each schedule and log their own visits
		# independently.
		today = getdate()
		for table, next_date_field, next_date_label in (
			(self.medical_followup_form, "next_visit_date", _("Date of Next Visit")),
			(self.therapist_followup, "next_review_date", _("Next review date")),
		):
			for row in table:
				if row.status == "Completed" and row.visit_date and getdate(row.visit_date) < today:
					frappe.throw(_("Row #{0}: Visit Date cannot be in the past.").format(row.idx))
				if row.get(next_date_field) and getdate(row.get(next_date_field)) <= today:
					frappe.throw(
						_("Row #{0}: {1} must be a future date, not today or earlier.").format(row.idx, next_date_label)
					)

	def on_update(self):
		sync_next_visit_todo(
			self,
			"next_visit_date",
			f"Palliative care followup visit due for {self.name1 or self.name}",
		)

	def set_next_visit_date(self):
		# Medical Followup and Therapist Followup are two independent
		# tracks - a doctor's own schedule and a therapist's own schedule for
		# the same patient. Each track's own next-due is its open Pending
		# row's Visit Date if one exists (see _latest_next_date), otherwise
		# whichever row most recently had its own next-date field typed in
		# by hand. The parent shows whichever of the two is due sooner, same
		# rule PNC uses for Mother/Baby - just without an urgent-priority
		# tier on top, since neither track here has any Risk/condition
		# concept, and no auto-generated window either - rows are always
		# added by hand, one at a time.
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
		# A Pending row is a visit that's been scheduled but hasn't happened
		# yet - its own Visit Date is what's actually due, same Status-driven
		# rule every other followup table in this app uses. Falls back to
		# the old behaviour (whichever row most recently had its own "next
		# visit" field typed in by hand) once every row is Completed, or for
		# data saved before Status existed - there's no Pending row to read
		# a due date from in that case.
		pending_rows = [row for row in table if row.get("status") == "Pending" and row.get("visit_date")]
		if pending_rows:
			return getdate(pending_rows[-1].get("visit_date"))

		rows = [row for row in table if row.get(fieldname)]
		if not rows:
			return None
		return getdate(rows[-1].get(fieldname))

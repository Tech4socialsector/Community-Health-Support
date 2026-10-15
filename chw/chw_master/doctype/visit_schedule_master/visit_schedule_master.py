# Copyright (c) 2026, tech4socialsector@azimpremjifoundation.org and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.model.document import Document


class VisitScheduleMaster(Document):
	def validate(self):
		self.validate_siblings()
		if self.schedule_type == "Specific":
			self.validate_visit_rows()

	def validate_siblings(self):
		# Every other record for this same program, read regardless of the
		# current user's own permissions - this is a data-integrity check
		# the server must always be able to run, not a user-facing read.
		siblings = frappe.get_all(
			"Visit Schedule Master",
			filters={"applies_to": self.applies_to, "name": ["!=", self.name or ""]},
			fields=["name", "schedule_type", "high_risk"],
			ignore_permissions=True,
		)

		types_in_use = {row.schedule_type for row in siblings} | {self.schedule_type}
		if len(types_in_use) > 1:
			frappe.throw(
				_("{0}: records have different Schedule Types ({1}). Every record for the same program must use the same Schedule Type.").format(
					self.applies_to, ", ".join(sorted(types_in_use))
				)
			)

		if self.schedule_type == "Continue":
			key = self.high_risk or ""
			if any((row.high_risk or "") == key for row in siblings):
				frappe.throw(
					_("{0}: another Continue record already has High Risk = {1}.").format(
						self.applies_to, key or "(blank)"
					)
				)
		else:
			# Specific is one record per program - its whole schedule lives
			# in this one record's Visit Schedule table, so a second
			# Specific record for the same program would just be ambiguous
			# (which one does the app read from?).
			if siblings:
				frappe.throw(
					_("{0} already has a Specific schedule ({1}). Add more visits to its own Visit Schedule table instead of creating another record.").format(
						self.applies_to, siblings[0].name
					)
				)

	def validate_visit_rows(self):
		seen = set()
		for row in self.visit_rows:
			if not row.visit_number:
				frappe.throw(_("Row {0}: Visit Number is required.").format(row.idx))
			if row.visit_number in seen:
				frappe.throw(_("Row {0}: Visit Number {1} is already used by another row.").format(row.idx, row.visit_number))
			seen.add(row.visit_number)

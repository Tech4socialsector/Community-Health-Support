# Copyright (c) 2026, tech4socialsector@azimpremjifoundation.org and contributors
# For license information, please see license.txt

# import frappe
from frappe.model.document import Document


class MentalHealthFollowupChild(Document):
	# begin: auto-generated types
	# This code is auto-generated. Do not modify anything in this block.

	from typing import TYPE_CHECKING

	if TYPE_CHECKING:
		from frappe.types import DF

		actual_date: DF.Date | None
		behaviour_change_notes: DF.SmallText | None
		done: DF.Check
		expected_date: DF.Date | None
		health_worker_name: DF.Link | None
		parent: DF.Data
		parentfield: DF.Data
		parenttype: DF.Data
		remarks: DF.SmallText | None
	# end: auto-generated types

	pass

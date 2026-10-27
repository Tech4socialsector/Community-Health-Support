# Copyright (c) 2026, tech4socialsector@azimpremjifoundation.org and contributors
# For license information, please see license.txt

# import frappe
from frappe.model.document import Document


class MentalHealthSymptomMaster(Document):
	# begin: auto-generated types
	# This code is auto-generated. Do not modify anything in this block.

	from typing import TYPE_CHECKING

	if TYPE_CHECKING:
		from frappe.types import DF

		category: DF.Literal["", "Emotional", "Behavioural", "Cognitive", "Physical"]
		symptom_name: DF.Data
	# end: auto-generated types

	pass

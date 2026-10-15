# One row per record ID handed to a phone in advance, so a record created
# offline shows its real ID (HH-00041) at once. The server only accepts a
# reserved ID back from the user it was given to.

from frappe.model.document import Document


class CHWReservedID(Document):
	pass

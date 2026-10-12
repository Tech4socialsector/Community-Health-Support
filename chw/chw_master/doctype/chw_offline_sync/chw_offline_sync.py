# One row per record a phone sent from its offline Outbox, keyed by the
# phone's own id for that change - so a retry after a dropped connection
# returns the record already made instead of creating it twice.

from frappe.model.document import Document


class CHWOfflineSync(Document):
	pass

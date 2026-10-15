# Copyright (c) 2026, tech4socialsector@azimpremjifoundation.org and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.model.document import Document
from chw.api import validate_phone_number

# Baby's Family member field <- this Birth Registration's field. Only the
# basics a birth record actually knows; the rest of the member's profile is
# filled in by hand on a later household visit.
BABY_MEMBER_FIELDS = {
	"family_member": "baby_name",
	"gender": "gender",
	"date_of_birth": "baby_date_of_birth",  # property below: DOB, else delivery date
}

# The baby's relationship to the household head is only certain when the
# mother is the head herself or the head's wife - then the baby is the
# head's son/daughter. Any other case (daughter-in-law, sister ...) would
# need "Grandson" etc., which the Relationship list doesn't have, so it's
# left blank for the CHW to choose.
MOTHER_RELATIONSHIPS_WITH_CHILD_OF_HEAD = {"Self", "Wife"}
CHILD_RELATIONSHIP_BY_GENDER = {"Male": "Son", "Female": "Daughter"}


class BirthRegistration(Document):
	def validate(self):
		validate_phone_number(self.phone_number)
		self.validate_pregnancy_registration()

	def on_update(self):
		self.sync_baby_family_member()

	def validate_pregnancy_registration(self):
		# `fmid` (the mother's Family member ID, fetched from the Pregnancy
		# Registration). This used to read `family_member_id`, a field that
		# was renamed - on a new record that attribute doesn't exist at all,
		# so every new Birth Registration failed with an AttributeError.
		if not self.fmid:
			return

		if not frappe.db.exists("Pregnancy Registration", {"familymember_id": self.fmid}):
			frappe.throw(_(
				"Birth Registration can only be created for a family member who has a "
				"Pregnancy Registration on record."
			))

	@property
	def baby_date_of_birth(self):
		# Date of Birth is hidden on this form; the delivery date (required)
		# is the baby's birth date whenever it isn't filled in separately.
		return self.date_of_birth or self.date_of_delivery

	def sync_baby_family_member(self):
		"""Register a live-born baby as a Family member of the mother's
		household, once - its ID is kept in baby_family_member. If the
		baby's name, gender or birth date is corrected here later, the
		member record is corrected too; nothing else on it is touched, so
		details added on later visits are never overwritten."""
		if self.birth_status == "Still Birth":
			return

		# Until `bench migrate` adds baby_family_member there is nowhere to
		# remember the baby's ID: every save would add the baby again (or
		# fail writing the missing column). Wait for the field instead.
		if not self.meta.has_field("baby_family_member"):
			return

		# .get(), not the attribute: on a new record a field the controller
		# expects but the record lacks raises AttributeError - the way the
		# old family_member_id check broke every new Birth Registration.
		existing = self.get("baby_family_member")
		if existing and frappe.db.exists("Family members", existing):
			self.update_baby_family_member(existing)
		else:
			self.create_baby_family_member()

	def update_baby_family_member(self, member_name):
		changed = {
			member_field: getattr(self, source)
			for member_field, source in BABY_MEMBER_FIELDS.items()
			if self.basic_detail_changed(source)
		}
		if not changed:
			return
		member = frappe.get_doc("Family members", member_name)
		member.update(changed)
		member.save(ignore_permissions=True)

	def basic_detail_changed(self, source):
		if source == "baby_date_of_birth":
			return self.has_value_changed("date_of_birth") or self.has_value_changed("date_of_delivery")
		return self.has_value_changed(source)

	def create_baby_family_member(self):
		household = self.mother_household()
		if not household:
			# Without a household the member would be orphaned (no village,
			# no household count) - say so rather than create it half-linked.
			frappe.msgprint(
				_("The baby could not be added to Family members because no household was found for the mother. Please add the baby from the household."),
				indicator="orange",
				alert=True,
			)
			return

		member = frappe.get_doc({
			"doctype": "Family members",
			"hhid": household,
			"family_member": self.baby_name,
			"gender": self.gender,
			"date_of_birth": self.baby_date_of_birth,
			"relationship": self.baby_relationship(),
			"phone_number": self.phone_number,
			"health_worker_name": self.health_worker_name,
			"status": "Active",
			"is_the_patient_a_child_0_to_1": "Yes",
		})
		try:
			# A system step on behalf of whoever saved the birth - they may
			# not hold create rights on Family members themselves.
			member.insert(ignore_permissions=True)
		except Exception:
			# The birth record itself is fine and must still save; the
			# baby can be added by hand, and the reason is in the Error Log.
			frappe.log_error(frappe.get_traceback(), "Failed to create baby Family member from Birth Registration")
			frappe.msgprint(
				_("Birth Registration saved, but the baby could not be added to Family members automatically. Please add the baby from the household."),
				indicator="orange",
				alert=True,
			)
			return

		self.db_set("baby_family_member", member.name, update_modified=False)
		frappe.msgprint(
			_("{0} added to Family members as {1}.").format(self.baby_name, member.name),
			indicator="green",
			alert=True,
		)

	def mother_household(self):
		"""The mother's own Family member record is the surest source; HH ID
		(fetched from the Pregnancy Registration) is the fallback."""
		if self.fmid:
			household = frappe.db.get_value("Family members", self.fmid, "hhid")
			if household:
				return household
		if self.hh_id and frappe.db.exists("Household profile", self.hh_id):
			return self.hh_id
		return None

	def baby_relationship(self):
		if not self.fmid:
			return None
		mother_relationship = frappe.db.get_value("Family members", self.fmid, "relationship")
		if mother_relationship in MOTHER_RELATIONSHIPS_WITH_CHILD_OF_HEAD:
			return CHILD_RELATIONSHIP_BY_GENDER.get(self.gender)
		return None


def create_missing_baby_family_members():
	"""One-off for births registered before this existed:
	bench --site <site> execute chw.common.doctype.birth_registration.birth_registration.create_missing_baby_family_members"""
	names = frappe.get_all(
		"Birth Registration",
		filters={"baby_family_member": ["is", "not set"], "birth_status": ["!=", "Still Birth"]},
		pluck="name",
	)
	for name in names:
		frappe.get_doc("Birth Registration", name).create_baby_family_member()
	frappe.db.commit()
	print(f"Checked {len(names)} Birth Registration(s).")

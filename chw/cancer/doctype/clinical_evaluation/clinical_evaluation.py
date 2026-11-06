# Copyright (c) 2026, TFSS and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.model.document import Document

SITES = ("oral", "breast", "cervical")
SITE_LABEL = {"oral": _("Oral"), "breast": _("Breast"), "cervical": _("Cervical")}

CERVICAL_PLAN_FIELDS = [
	"cervical_plan_observation",
	"cervical_plan_cone_biopsy",
	"cervical_plan_hysterectomy",
	"cervical_plan_cryotherapy",
	"cervical_plan_leep",
	"cervical_plan_cancer_management",
	"cervical_plan_thermocoagulation",
	"cervical_plan_others",
]


class ClinicalEvaluation(Document):
	def validate(self):
		self.check_one_per_screening()
		self.check_referred()
		self.set_referred_sites()
		self.check_referred_questions()

	def before_submit(self):
		# Submit is this form's Finish (Clinical Forms v2).
		self.check_finish_rules()

	def check_one_per_screening(self):
		# One evaluation per screening (a cancelled one doesn't count, so it
		# can be amended) - the clinic worklist shows each patient once.
		if not self.main_screening_form:
			return
		other = frappe.db.get_value(
			"Clinical Evaluation",
			{
				"main_screening_form": self.main_screening_form,
				"docstatus": ["<", 2],
				"name": ["!=", self.name or ""],
			},
			"name",
		)
		if other:
			frappe.throw(
				_("{0} already has a Clinical Evaluation: {1}. Open that one instead.").format(
					self.main_screening_form, other
				),
				title=_("Already evaluated"),
			)

	def check_referred(self):
		# Only a screening finished with "Referral = Yes" (Oral, Breast or
		# Cervical) moves the patient to clinical evaluation.
		if not self.is_new() or not self.main_screening_form:
			return
		screening = frappe.get_doc("Main Screening Form", self.main_screening_form)
		if not screening.is_referred():
			frappe.throw(
				_("{0} has no finished screening with Referral = Yes, so the patient doesn't move to clinical evaluation yet. Finish the screening with Referral = Yes first.").format(
					self.main_screening_form
				),
				title=_("Not referred"),
			)

	def set_referred_sites(self):
		# Which screenings' tabs this evaluation has: those finished with
		# Referral = Yes on the Main Screening Form (the form script sets the
		# same as soon as the screening is picked).
		sites = referred_sites(self.main_screening_form)
		for site in SITES:
			self.set(f"{site}_referred", 1 if site in sites else 0)

	def check_referred_questions(self):
		# A screening that wasn't referred has no evaluation (its tab is
		# hidden): its first question is No. One that was must be answered.
		missing = []
		for site in SITES:
			fieldname = f"{site}_clinical_evaluation"
			if self.get(f"{site}_referred"):
				if not self.get(fieldname):
					missing.append(_(self.meta.get_label(fieldname)))
			elif self.get(fieldname) == "Yes":
				frappe.throw(
					_("{0} screening wasn't referred in {1}, so it has no clinical evaluation.").format(
						SITE_LABEL[site], self.main_screening_form
					),
					title=_("Not referred"),
				)
			else:
				self.set(fieldname, "No")
		if missing:
			frappe.throw(_("Answer these first: {0}").format(", ".join(missing)), title=_("Missing answers"))

	def check_finish_rules(self):
		problems = []
		if self.breast_referred and self.breast_clinical_evaluation == "Yes" and self.breast_biopsy == "Not now":
			problems.append(_("Breast biopsy is \"Not now\" - mark Yes or No before finishing."))
		if (
			self.cervical_referred
			and self.cervical_clinical_evaluation == "Yes"
			and not any(self.get(f) for f in CERVICAL_PLAN_FIELDS)
		):
			problems.append(_("Cervical treatment plan: tick at least one option."))
		if problems:
			frappe.throw("<br>".join(problems), title=_("Not ready to finish"))


def referred_sites(main_screening_form):
	if not main_screening_form or not frappe.db.exists("Main Screening Form", main_screening_form):
		return []
	return frappe.get_doc("Main Screening Form", main_screening_form).referred_sites()


@frappe.whitelist()
def get_referred_sites(main_screening_form):
	"""The form scripts (Desk and Vue): which tabs to show for the picked
	screening - {"oral": 1, "breast": 0, "cervical": 1}."""
	frappe.has_permission("Main Screening Form", "read", doc=main_screening_form, throw=True)
	sites = referred_sites(main_screening_form)
	return {site: 1 if site in sites else 0 for site in SITES}

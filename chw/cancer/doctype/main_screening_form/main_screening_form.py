# Copyright (c) 2026, TFSS and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import now_datetime

# Each screening's tab, in the form's field order (see screening_fields).
SITE_TABS = {
	"oral": ("tab_2_tab", "breast_screening__questionnaire_tab"),
	"breast": ("breast_screening__questionnaire_tab", "cervical_screening_questionnaire_tab"),
	"cervical": ("cervical_screening_questionnaire_tab", None),
}
SITE_LABEL = {"oral": _("Oral"), "breast": _("Breast"), "cervical": _("Cervical")}

# Who may reopen (untick Finish on) a finished screening - the spec's
# Programme Manager "override finished forms".
OVERRIDE_ROLES = {"Program Coordinator", "System Manager", "Administrator"}


class MainScreeningForm(Document):
	def before_insert(self):
		# Completed By and the consent witness: the person who made the
		# screening, unless typed (the forms fill both on opening a new one).
		name = frappe.utils.get_fullname(frappe.session.user)
		if not self.completed_by:
			self.completed_by = name
		if self.consent_given == "Yes" and not self.consent_witness:
			self.consent_witness = name

	def validate(self):
		self.check_consent()
		self.check_first_questions()
		self.keep_oral_no_closed()
		self.check_finish()
		self.set_oral_screening_status()
		self.set_breast_screening_status()
		self.set_cervical_screening_status()

	# ---- Consent and who gets which screening ---------------------------

	def is_male(self):
		return self.gender == "Male"

	def site_applies(self, site):
		"""Breast and Cervical are for women only (shown for every gender
		except Male); all three need consent."""
		if self.consent_given != "Yes":
			return False
		return site == "oral" or not self.is_male()

	def check_consent(self):
		if self.consent_given == "No":
			if any(self.get(f"{site}_finished") for site in SITE_TABS):
				frappe.throw(_("Consent is No, so no screening can be finished."), title=_("No consent"))

	def check_first_questions(self):
		# The form's mandatory_depends_on, enforced here too (the server only
		# checks plain "Mandatory" fields).
		first = {"oral": "oral_examination", "breast": "breast_symptoms", "cervical": "cervical_screening"}
		missing = [
			self.meta.get_label(fieldname)
			for site, fieldname in first.items()
			if self.site_applies(site) and not self.get(fieldname)
		]
		if missing:
			frappe.throw(
				_("Answer these first: {0}").format(", ".join(_(m) for m in missing)),
				title=_("Missing answers"),
			)

	def keep_oral_no_closed(self):
		# Oral Screening Questionnaire: "No - the screening form doesn't open
		# for the patient & once submitted cannot be reopened".
		if self.is_new():
			return
		saved = frappe.db.get_value(self.doctype, self.name, "oral_examination")
		if saved == "No" and self.oral_examination != "No":
			frappe.throw(
				_("Oral Examination was saved as No, so the oral screening can't be reopened for this person."),
				title=_("Oral screening closed"),
			)

	# ---- Finish ----------------------------------------------------------

	def screening_fields(self, site):
		"""The questions on a screening's tab (what Finish locks)."""
		start, end = SITE_TABS[site]
		names = [df.fieldname for df in self.meta.fields]
		a = names.index(start) + 1
		b = names.index(end) if end else len(names)
		skip = {"Section Break", "Column Break", "Tab Break", "HTML", "Heading"}
		return [
			df
			for df in self.meta.fields[a:b]
			if df.fieldtype not in skip and not df.read_only and not df.fieldname.startswith(f"{site}_finish")
		]

	def missing_to_finish(self, site):
		"""What still stops a screening from being finished - the same rules
		as the Finish tick's read_only_depends_on in the form."""
		if site == "oral":
			if self.oral_examination == "No":
				return []
			if self.oral_examination != "Yes":
				return [_("Oral Examination (Yes or No; \"Not now\" can't be finished)")]
			need = ["tobacco_user", "symptoms", "dental_hygiene", "clinical_findings", "refferal"]
			if self.refferal == "Yes":
				need.append("if_refferal_yes")
			return self._labels_without_value(need)

		if site == "breast":
			if self.breast_symptoms not in ("Yes", "No"):
				return [_("Symptoms (Yes or No; \"Not now\" can't be finished)")]
			need = ["right_breast_on_palpation", "left_breast_on_palpation", "breast_nipple_discharge", "breast_referral"]
			if self.breast_referral == "Yes":
				need.append("breast_referred_for")
			return self._labels_without_value(need)

		# cervical
		if self.cervical_screening == "Not Done":
			return self._labels_without_value(["cervical_not_done_reason"])
		if self.cervical_screening != "Done":
			return [_("Cervical Screening (Done or Not Done; \"Not now\" can't be finished)")]
		missing = self._labels_without_value(
			["cervical_symptoms", "cervical_abnormal_bleeding", "cervical_visual_inspection", "cervical_referral"]
		)
		if self.cervical_abnormal_bleeding == "Others":
			missing += self._labels_without_value(["cervical_abnormal_bleeding_other"])
		if self.cervical_visual_inspection == "Not now":
			missing.append(_("Visual Inspection is \"Not now\""))
		elif self.cervical_visual_inspection == "Yes":
			missing += self._labels_without_value(["cervical_visual_inspection_findings"])
		tests = {
			"hr_hpv_dna": ["hr_hpv_dna_report_date", "hr_hpv_dna_result", "hr_hpv_dna_report"],
			"cytology": ["cytology_report_date", "cytology_report"],
			"visual_test": ["visual_test_report_date", "visual_test_report"],
		}
		for test, details in tests.items():
			if self.get(test) not in ("Yes", "No"):
				missing.append(_("{0} (Yes or No; \"Not now\" can't be finished)").format(_(self.meta.get_label(test))))
			elif self.get(test) == "Yes":
				missing += self._labels_without_value(details)
		if self.cervical_referral == "Yes":
			missing += self._labels_without_value(["cervical_referred_for"])
		return missing

	def _labels_without_value(self, fieldnames):
		return [_(self.meta.get_label(f)) for f in fieldnames if not self.get(f)]

	def check_finish(self):
		before = None if self.is_new() else self.get_doc_before_save()
		can_override = bool(OVERRIDE_ROLES & set(frappe.get_roles()))
		for site in SITE_TABS:
			flag = f"{site}_finished"
			was = bool(before and before.get(flag))
			now = bool(self.get(flag))

			if now and not self.site_applies(site):
				self.set(flag, 0)
				now = False

			if now and not was:
				missing = self.missing_to_finish(site)
				if missing:
					frappe.throw(
						_("{0} screening can't be finished yet. Still needed: {1}").format(
							SITE_LABEL[site], ", ".join(missing)
						),
						title=_("Not ready to finish"),
					)
				self.set(f"{site}_finished_on", now_datetime())
				self.set(f"{site}_finished_by", frappe.session.user)

			elif was and not now:
				if not can_override:
					frappe.throw(
						_("{0} screening is finished. Only a Program Coordinator can reopen it.").format(SITE_LABEL[site]),
						title=_("Screening finished"),
					)
				self.set(f"{site}_finished_on", None)
				self.set(f"{site}_finished_by", None)

			elif was and now:
				changed = [
					_(df.label)
					for df in self.screening_fields(site)
					if _differs(before.get(df.fieldname), self.get(df.fieldname), df.fieldtype)
				]
				if changed:
					frappe.throw(
						_("{0} screening is finished, so it can't be changed ({1}). A Program Coordinator can reopen it.").format(
							SITE_LABEL[site], ", ".join(changed[:5])
						),
						title=_("Screening finished"),
					)

	# ---- Status per screening -------------------------------------------

	def _status(self, site, not_screened, pending, referred):
		if not self.site_applies(site):
			return "Not Applicable" if self.consent_given == "Yes" else "Pending"
		if not_screened:
			return not_screened if self.get(f"{site}_finished") else "In Progress"
		if pending:
			return "Pending"
		if not self.get(f"{site}_finished"):
			return "In Progress"
		return "Moved to Clinical Evaluation" if referred else "Completed"

	def set_oral_screening_status(self):
		# "Not now" (or nothing yet) stays Pending until Yes or No is marked;
		# Completed / Moved to Clinical Evaluation only once finished.
		self.oral_screening_status = self._status(
			"oral",
			"Not Screened" if self.oral_examination == "No" else None,
			self.oral_examination != "Yes" and self.oral_examination != "No",
			self.refferal == "Yes",
		)

	def set_breast_screening_status(self):
		self.breast_screening_status = self._status(
			"breast",
			None,
			self.breast_symptoms not in ("Yes", "No"),
			self.breast_referral == "Yes",
		)

	def set_cervical_screening_status(self):
		# "Not now" on any cervical question keeps the screening open so it can be finished later
		pending = self.cervical_screening not in ("Done", "Not Done") or (
			self.cervical_screening == "Done"
			and "Not now" in (self.cervical_visual_inspection, self.hr_hpv_dna, self.cytology, self.visual_test)
		)
		self.cervical_screening_status = self._status(
			"cervical",
			"Not Done" if self.cervical_screening == "Not Done" else None,
			pending,
			self.cervical_referral == "Yes",
		)

	# ---- Clinical evaluation gate ------------------------------------------

	def is_referred(self):
		"""Referred for clinical evaluation: a screening finished with
		Referral = Yes ("Finishing this will move patient to clinical
		evaluation")."""
		return any(self.referred_sites())

	def referred_sites(self):
		return [
			site
			for site, referral_field in REFERRAL_FIELDS.items()
			if self.get(referral_field) == "Yes" and self.get(f"{site}_finished")
		]

	def onload(self):
		# Desk's form script hides the Clinical Evaluation connection with it.
		self.set_onload("clinical_evaluation_allowed", clinical_evaluation_allowed(self))


# Each screening's Referral question.
REFERRAL_FIELDS = {"oral": "refferal", "breast": "breast_referral", "cervical": "cervical_referral"}


def referred_condition(table="`tabMain Screening Form`"):
	"""SQL for is_referred(): at least one screening finished with Referral
	= Yes - for the Clinical Evaluation search (chw.cancer.queries)."""
	return "(" + " or ".join(
		f"({table}.`{field}` = 'Yes' and {table}.`{site}_finished` = 1)" for site, field in REFERRAL_FIELDS.items()
	) + ")"


def clinical_evaluation_allowed(screening):
	"""Show the Clinical Evaluation connection on a saved screening that is
	referred, or that already has a Clinical Evaluation (so existing ones
	stay reachable)."""
	if screening.is_new():
		return False
	return screening.is_referred() or bool(
		frappe.db.exists("Clinical Evaluation", {"main_screening_form": screening.name})
	)


def _differs(old, new, fieldtype):
	if fieldtype in ("Table", "Table MultiSelect"):
		def rows(value):
			return sorted(
				tuple(sorted((k, v) for k, v in (r.as_dict() if hasattr(r, "as_dict") else r).items() if k not in _ROW_META))
				for r in (value or [])
			)
		return rows(old) != rows(new)
	return (old or None) != (new or None) and str(old or "") != str(new or "")


_ROW_META = {"name", "owner", "creation", "modified", "modified_by", "parent", "parentfield", "parenttype", "idx", "docstatus", "doctype", "__islocal", "__unsaved"}

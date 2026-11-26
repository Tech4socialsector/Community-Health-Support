"""Programme setup: which programmes this organisation runs, which of their
forms it uses, and which questions on each form (App Setting). Unticked
questions are hidden everywhere - Desk and the Vue app, online and offline.

The question choice is stored on App Setting (hidden_form_fields:
{"<form>": [fieldname, ...]}) and applied as Frappe Property Setters:
hidden = 1, and mandatory_depends_on cleared so a hidden question can never
block Save. Ticking it again removes both, so it comes back exactly as it
was - hiding never deletes data.

Some questions can't be hidden ("locked"), each with a reason:
- Main Screening Form: a hand-checked list - consent, the patient details
  Clinical Evaluation copies, the question that opens each screening, every
  question the Finish ticks check, referral, and what the app fills in.
- Every other programme form: worked out cautiously - required questions,
  questions other questions depend on, links to the patient or parent
  record, and any field the app's code uses (the form's own scripts, the Vue
  hooks, the Overview and the server rules)."""

import json
import os
import re

import frappe
from frappe import _

LAYOUT = {"Section Break", "Column Break", "Tab Break", "HTML", "Heading", "Button", "Fold", "Image"}

# Friendly names for the "Answer type" column.
FIELD_TYPES = {
    "Data": "Text", "Small Text": "Text", "Text": "Long text", "Long Text": "Long text", "Text Editor": "Long text",
    "Select": "Choice", "Check": "Tick box", "Date": "Date", "Datetime": "Date & time", "Time": "Time",
    "Int": "Number", "Float": "Number", "Currency": "Number", "Percent": "Number",
    "Link": "Link", "Dynamic Link": "Link", "Table": "Table", "Table MultiSelect": "Multiple choice",
    "Attach": "File", "Attach Image": "Photo", "Signature": "Signature", "Geolocation": "Location", "Phone": "Phone",
}

# Main Screening Form - the screening's own rules (main_screening_form.py).
MSF = "Main Screening Form"
MSF_SITES = ("oral", "breast", "cervical")
MSF_CONSENT = {"consent_given", "consent_date", "consent_not_given_reason", "consent_other_reason"}
MSF_PATIENT = {"fmid", "name1", "gender", "age", "date_of_birth", "village", "mobile_number"}
MSF_OPENS = {"oral_examination", "breast_symptoms", "cervical_screening"}
MSF_REFERRAL = {"refferal", "if_refferal_yes", "breast_referral", "breast_referred_for", "cervical_referral", "cervical_referred_for"}
MSF_FINISH = {
    "tobacco_user", "symptoms", "dental_hygiene", "clinical_findings",
    "right_breast_on_palpation", "left_breast_on_palpation", "breast_nipple_discharge",
    "cervical_not_done_reason", "cervical_symptoms", "cervical_abnormal_bleeding",
    "cervical_abnormal_bleeding_other", "cervical_visual_inspection", "cervical_visual_inspection_findings",
    "hr_hpv_dna", "hr_hpv_dna_report_date", "hr_hpv_dna_result", "hr_hpv_dna_report",
    "cytology", "cytology_report_date", "cytology_report", "visual_test", "visual_test_report_date", "visual_test_report",
}

R_CONSENT = _("Consent")
R_PATIENT = _("Patient details")
R_OPENS = _("Opens the screening")
R_FINISH = _("Needed to finish")
R_REFERRAL = _("Referral")
R_SYSTEM = _("Set by the app")
R_REQUIRED = _("Required")
R_CONTROLS = _("Controls other questions")
R_LINK = _("Links the record")
R_USED = _("Used by the app")


def configurable_forms():
    """Every programme form (chw.programmes)."""
    from chw.programmes import PROGRAMMES

    return {dt for p in PROGRAMMES.values() for dt in p["doctypes"]}


def _base_fields(form):
    """The form's fields as defined in the DocType - without this site's
    Property Setters, so a field we hid still lists with its own settings."""
    return frappe.get_all(
        "DocField",
        filters={"parent": form, "parenttype": "DocType"},
        fields=["fieldname", "label", "fieldtype", "options", "hidden", "reqd", "depends_on",
                "mandatory_depends_on", "read_only_depends_on", "idx"],
        order_by="idx asc",
    )


def lock_reasons(form):
    """{fieldname: why it can't be hidden} for this form."""
    fields = _base_fields(form)
    reasons = {}

    def lock(names, reason):
        for name in names:
            reasons.setdefault(name, reason)

    if form == MSF:
        lock(MSF_CONSENT, R_CONSENT)
        lock(MSF_PATIENT, R_PATIENT)
        lock(MSF_OPENS, R_OPENS)
        lock(MSF_REFERRAL, R_REFERRAL)
        lock(MSF_FINISH, R_FINISH)
        by_name = {f.fieldname: f for f in fields}
        for site in MSF_SITES:
            finish = by_name.get(f"{site}_finished")
            if finish:
                lock(re.findall(r"doc\.(\w+)", finish.read_only_depends_on or ""), R_FINISH)
            lock({f"{site}_finished", f"{site}_finished_on", f"{site}_finished_by", f"{site}_screening_status"}, R_SYSTEM)
        lock({f.fieldname for f in fields if f.reqd}, R_REQUIRED)
        return reasons

    names = {f.fieldname for f in fields}
    lock({f.fieldname for f in fields if f.reqd or f.mandatory_depends_on}, R_REQUIRED)
    record_links = configurable_forms() | {"Family members", "Household profile", "Health Worker"}
    lock({f.fieldname for f in fields if f.fieldtype == "Link" and f.options in record_links}, R_LINK)
    controls = set()
    for f in fields:
        for expr in (f.depends_on, f.mandatory_depends_on, f.read_only_depends_on):
            controls |= set(re.findall(r"doc\.(\w+)", expr or ""))
    lock(controls & names, R_CONTROLS)
    text = _code_text(form)
    lock({n for n in names if re.search(r"\b" + re.escape(n) + r"\b", text)}, R_USED)
    return reasons


_CODE_CACHE = {}


def _code_text(form):
    """The app code that can read this form's fields: its own doctype
    folder, the Vue doctype hooks, and the server modules that compute from
    records (Overview, API, scheduled tasks). Read once per process."""
    if form in _CODE_CACHE:
        return _CODE_CACHE[form]
    app = frappe.get_app_path("chw")
    paths = []
    try:
        module = frappe.db.get_value("DocType", form, "module")
        folder = frappe.get_module_path(module, "doctype", frappe.scrub(form))
        paths += [os.path.join(folder, n) for n in os.listdir(folder) if n.endswith((".py", ".js"))]
    except Exception:
        pass
    hooks = os.path.join(os.path.dirname(app), "frontend", "src", "doctype-hooks")
    if os.path.isdir(hooks):
        paths += [os.path.join(hooks, n) for n in os.listdir(hooks) if n.endswith(".js")]
    paths += [os.path.join(app, n) for n in ("api.py", "overview.py", "tasks.py", "offline.py")]
    chunks = []
    for path in paths:
        try:
            with open(path, encoding="utf-8") as fh:
                chunks.append(fh.read())
        except OSError:
            continue
    _CODE_CACHE[form] = "\n".join(chunks)
    return _CODE_CACHE[form]


def locked_fields(form):
    return set(lock_reasons(form))


def _check_form(form):
    if form not in configurable_forms():
        frappe.throw(_("Questions can't be chosen for {0}.").format(form))


def _check_admin():
    """Who may set up programmes, forms and questions: whoever may change
    App Setting (System Manager, Program Coordinator)."""
    if not frappe.has_permission("App Setting", "write"):
        frappe.throw(_("Only a System Manager or Program Coordinator can change the programme setup."), frappe.PermissionError)


def _sections(form, hidden):
    reasons = lock_reasons(form)
    sections, current = [], {"label": _("General"), "fields": []}
    for f in _base_fields(form):
        if f.fieldtype in ("Section Break", "Tab Break"):
            # An unnamed section continues the one before it.
            if not f.label:
                continue
            if current["fields"]:
                sections.append(current)
            current = {"label": _(f.label), "fields": []}
            continue
        if f.fieldtype in LAYOUT or f.hidden:
            continue
        locked = f.fieldname in reasons
        current["fields"].append({
            "fieldname": f.fieldname,
            "label": _(f.label) if f.label else f.fieldname,
            "type": _(FIELD_TYPES.get(f.fieldtype, f.fieldtype)),
            "locked": locked,
            "reason": reasons.get(f.fieldname, ""),
            "shown": locked or f.fieldname not in hidden,
        })
    if current["fields"]:
        sections.append(current)
    return sections


@frappe.whitelist()
def get_form_fields(form):
    """The form's questions grouped by section: each with its answer type,
    whether it's locked (and why), and whether this site shows it."""
    _check_admin()
    _check_form(form)
    return _sections(form, set(hidden_for(form)))


def _parse(value):
    if not value:
        return {}
    if isinstance(value, dict):
        return value
    try:
        data = json.loads(value)
    except (TypeError, ValueError):
        return {}
    return data if isinstance(data, dict) else {}


def hidden_for(form, settings_value=None):
    if settings_value is None:
        settings_value = frappe.db.get_single_value("App Setting", "hidden_form_fields")
    return list(_parse(settings_value).get(form) or [])


def clean(settings):
    """App Setting.validate: only real, hideable questions of programme
    forms. A locked one that slipped in is dropped, with a message."""
    data = _parse(settings.hidden_form_fields)
    forms = configurable_forms()
    cleaned, dropped = {}, []
    for form, names in data.items():
        if form not in forms or not isinstance(names, list):
            continue
        valid = {f.fieldname for f in _base_fields(form) if f.fieldtype not in LAYOUT and not f.hidden}
        locked = locked_fields(form)
        keep = []
        for name in names:
            if name in locked:
                dropped.append(name)
            elif name in valid and name not in keep:
                keep.append(name)
        if keep:
            cleaned[form] = sorted(keep)
    if dropped:
        frappe.msgprint(_("These questions are needed by the app and stay shown: {0}").format(", ".join(dropped)), alert=True)
    settings.hidden_form_fields = json.dumps(cleaned, sort_keys=True) if cleaned else ""


def apply(settings):
    """App Setting.on_update: hide what was unticked, bring back what was
    ticked again. Only questions this setting manages are touched."""
    before = settings.get_doc_before_save()
    old = _parse(before.hidden_form_fields if before else None)
    new = _parse(settings.hidden_form_fields)
    for form in set(old) | set(new):
        old_set, new_set = set(old.get(form) or []), set(new.get(form) or [])
        if old_set == new_set or not frappe.db.exists("DocType", form):
            continue
        base = {f.fieldname: f for f in _base_fields(form)}
        for fieldname in new_set - old_set:
            _hide(form, fieldname, base.get(fieldname))
        for fieldname in old_set - new_set:
            _show(form, fieldname)
        frappe.clear_cache(doctype=form)


def _hide(form, fieldname, df):
    from frappe.custom.doctype.property_setter.property_setter import make_property_setter

    make_property_setter(form, fieldname, "hidden", 1, "Check", validate_fields_for_doctype=False)
    if df and df.mandatory_depends_on:
        make_property_setter(form, fieldname, "mandatory_depends_on", "", "Code", validate_fields_for_doctype=False)


def _show(form, fieldname):
    for name in frappe.get_all(
        "Property Setter",
        filters={"doc_type": form, "field_name": fieldname, "property": ["in", ["hidden", "mandatory_depends_on"]]},
        pluck="name",
    ):
        frappe.delete_doc("Property Setter", name, ignore_permissions=True)


# ---- Programme setup page (Vue: pages/ProgrammeSetup.vue) ------------------


@frappe.whitelist()
def get_setup():
    """Everything the Programme setup page shows: each programme with its
    switch, its forms with their App Setting tick boxes and how many of
    their questions are shown."""
    _check_admin()
    from chw.programmes import PROGRAMMES, form_field, has_form_ticks

    settings = frappe.get_single("App Setting")
    hidden = _parse(settings.hidden_form_fields)
    programmes = []
    for key, p in PROGRAMMES.items():
        forms = []
        for doctype in p["doctypes"]:
            if not frappe.db.exists("DocType", doctype):
                continue
            tick = form_field(doctype) if has_form_ticks(p) and settings.meta.has_field(form_field(doctype)) else None
            value = settings.get(tick) if tick else None
            total = shown = 0
            for sec in _sections(doctype, set(hidden.get(doctype) or [])):
                for f in sec["fields"]:
                    total += 1
                    shown += 1 if f["shown"] else 0
            forms.append({
                "doctype": doctype,
                "label": _(settings.meta.get_label(tick)) if tick else _(doctype),
                "field": tick,
                "on": True if not tick else (value is None or bool(value)),
                "total": total,
                "shown": shown,
            })
        programmes.append({
            "key": key,
            "label": _(settings.meta.get_label(p["field"])) or _(p["label"]),
            "field": p["field"],
            "icon": p.get("icon"),
            "on": bool(settings.get(p["field"])),
            "forms": forms,
        })
    return {"programmes": programmes, "hidden_form_fields": settings.hidden_form_fields or ""}


@frappe.whitelist()
def save_setup(switches=None, hidden_form_fields=None):
    """Save the page: programme switches and form tick boxes (App Setting
    enable_* / use_* fields only) and the hidden questions. App Setting's own
    save does the rest - locked questions are dropped (clean), hidden ones
    applied (apply), modules and navigation rebuilt (chw.programmes)."""
    _check_admin()
    settings = frappe.get_single("App Setting")
    for fieldname, value in (_parse(switches) or {}).items():
        if (fieldname.startswith("enable_") or fieldname.startswith("use_")) and settings.meta.has_field(fieldname):
            settings.set(fieldname, 1 if value else 0)
    if hidden_form_fields is not None:
        settings.hidden_form_fields = hidden_form_fields or ""
    settings.save()
    return get_setup()

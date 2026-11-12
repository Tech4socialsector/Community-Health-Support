"""The Vue app's Overview page: one section for households & families, then
one per programme switched on in App Setting (MCH, Palliative Care, Mental
Health, NCD, Cancer), each with key numbers, a journey and donut charts.

Every number is a *metric*: a function that lists the records it counts,
under the page's filters (village, health worker, date range) and the user's
own permissions. The count on the page and the people behind it
(get_overview_records) come from the same function, so they always agree.

Metric kinds:
- "count": {"doctype", "names"}
- "split": {"doctype", "map": {name: segment_key}, "segments": [...]}
  - one record in exactly one segment (a donut)."""

import frappe
from frappe import _
from frappe.utils import add_days, cint, getdate, nowdate

from chw.api import (
    NEW_INDICATOR_DEFS,
    _dashboard_date_bounds,
    is_privileged_user,
)
from chw.programmes import enabled_programmes, is_doctype_disabled

ALL_VILLAGES = "All Villages"
ALL_HEALTH_WORKERS = "All Health Workers"

# Meaning of a segment, coloured the same way on every chart by the page.
GOOD, BAD, MID, WAIT, NONE, GREY = "good", "bad", "mid", "wait", "none", "grey"

# A doctype without its own village / health worker is filtered through
# another record: its parent (follow-up -> assessment, evaluation ->
# screening) or its family member.
PARENT_SCOPE = {
    "Palliative care followup": ("pcid", "Palliative Care Initial Assessment Form"),
    "Clinical Evaluation": ("main_screening_form", "Main Screening Form"),
}
HEALTH_WORKER_FIELDS = ("health_worker_name", "assigned_health_worker")

# What the people list shows for each doctype (fields that exist only).
DISPLAY_FIELDS = {
    "Household profile": {"title": "household_head_name"},
    "Family members": {"title": "family_member"},
    "Pregnancy Registration": {"title": "first_name"},
    "ANC Follow-up": {"title": "first_name"},
    "Birth Registration": {"title": "first_name"},
    "PNC": {"title": "first_name"},
    "Postpartum Reg and Followup": {"title": "patient_name"},
    "Child 6w to 1 Year Reg and Followup": {"title": "patient_name"},
    "Palliative Care Initial Assessment Form": {"title": "name1"},
    "Palliative care followup": {"title": "name1"},
    "Mental Health": {"title": "patient_name"},
    "NCD": {"title": "first_name"},
    "Main Screening Form": {"title": "name1"},
    "Clinical Evaluation": {"title": "patient_name"},
}


class Ctx:
    """The page's filters, and the records each doctype has under them -
    worked out once per request."""

    def __init__(self, village=None, health_worker=None, date_range=None):
        self.village = village if village and village != ALL_VILLAGES else None
        self.health_worker = health_worker if health_worker and health_worker != ALL_HEALTH_WORKERS else None
        self.from_date, self.to_date = _dashboard_date_bounds(date_range)
        self._scopes = {}
        self._cache = {}

    def memo(self, key, fn):
        if key not in self._cache:
            self._cache[key] = fn()
        return self._cache[key]

    def scope(self, doctype):
        """Names of `doctype` the user may read, inside the filters."""
        if doctype not in self._scopes:
            self._scopes[doctype] = self._compute_scope(doctype)
        return self._scopes[doctype]

    def _compute_scope(self, doctype):
        if is_doctype_disabled(doctype) or not frappe.has_permission(doctype, "read"):
            return []
        meta = frappe.get_meta(doctype)
        filters = []
        if self.from_date and self.to_date:
            filters.append(["creation", "between", [f"{self.from_date} 00:00:00", f"{self.to_date} 23:59:59"]])

        parent = PARENT_SCOPE.get(doctype)
        if parent and (self.village or self.health_worker):
            filters.append([parent[0], "in", self.scope(parent[1]) or [""]])
        else:
            fm_link = next((df.fieldname for df in meta.fields if df.fieldtype == "Link" and df.options == "Family members"), None)
            if self.village:
                if meta.has_field("village"):
                    filters.append(["village", "=", self.village])
                elif fm_link:
                    filters.append([fm_link, "in", self._members(village=self.village) or [""]])
            if self.health_worker:
                hw_field = next((f for f in HEALTH_WORKER_FIELDS if meta.has_field(f)), None)
                if hw_field:
                    filters.append([hw_field, "=", self.health_worker])
                elif fm_link:
                    filters.append([fm_link, "in", self._members(health_worker=self.health_worker) or [""]])
        return frappe.get_list(doctype, filters=filters, pluck="name", limit_page_length=0)

    def _members(self, village=None, health_worker=None):
        filters = {}
        if village:
            filters["village"] = village
        if health_worker:
            filters["health_worker_name"] = health_worker
        return frappe.get_all("Family members", filters=filters, pluck="name")

    def values(self, doctype, field):
        """{name: value of `field`} for the records in scope."""
        names = self.scope(doctype)
        if not names or not frappe.get_meta(doctype).has_field(field):
            return {}
        return self.memo(
            ("values", doctype, field),
            lambda: {
                r.name: r.get(field)
                for r in frappe.get_all(doctype, filters={"name": ["in", names]}, fields=["name", field], limit_page_length=0)
            },
        )


# ---- Metric helpers -----------------------------------------------------


def count(doctype, condition=None):
    """A count metric: the records in scope, optionally only those whose
    fields match `condition` ({field: value} or {field: [op, value]})."""

    def fn(ctx):
        names = ctx.scope(doctype)
        if condition and names:
            names = frappe.get_all(doctype, filters={"name": ["in", names], **condition}, pluck="name", limit_page_length=0)
        return {"doctype": doctype, "names": names}

    return fn


def field_split(doctype, field, segments, exclude=(), blank=_("Not recorded")):
    """A donut over one Select field's values. `segments`: [(value, label,
    tone)] in order; other values come after, grey; empty -> `blank`."""

    def fn(ctx):
        known = {value for value, _label, _tone in segments}
        mapping = {}
        extra = []
        for name, value in ctx.values(doctype, field).items():
            value = value or ""
            if value in exclude:
                continue
            mapping[name] = value
            if value and value not in known and value not in extra:
                extra.append(value)
        segs = [(v, label, tone) for v, label, tone in segments] + [(v, v, GREY) for v in sorted(extra)]
        if "" in mapping.values():
            segs.append(("", blank, NONE))
        return {"doctype": doctype, "map": mapping, "segments": segs}

    return fn


def indicator_split(key, tones, no_data_tone=NONE):
    """One of chw.api's MCH indicators, inside this page's filters."""
    cfg = NEW_INDICATOR_DEFS[key]

    def fn(ctx):
        in_scope = set(ctx.scope(cfg["doctype"]))
        raw = cfg["segment_map_fn"](ctx.village, ctx.health_worker)
        mapping = {name: (seg or "") for name, seg in raw.items() if name in in_scope}
        segs = [(s["key"], s["label"], tones.get(s["key"], GREY)) for s in cfg["segments"]]
        if cfg.get("no_data_label") and "" in mapping.values():
            segs.append(("", cfg["no_data_label"], no_data_tone))
        return {"doctype": cfg["doctype"], "map": mapping, "segments": segs}

    return fn


def segment_count(split_fn, segment):
    """A count metric: one segment of a split."""

    def fn(ctx):
        data = split_fn(ctx)
        return {"doctype": data["doctype"], "names": [n for n, s in data["map"].items() if s == segment]}

    return fn


# ---- Households & families ----------------------------------------------


def _age(value):
    try:
        return int(str(value).strip())
    except (TypeError, ValueError):
        return None


def members_by_age(ctx):
    mapping = {}
    for name, age in ctx.values("Family members", "age").items():
        a = _age(age)
        mapping[name] = "" if a is None else "u5" if a < 5 else "5_29" if a < 30 else "30_65" if a <= 65 else "65p"
    segs = [("u5", _("Under 5"), MID), ("5_29", "5–29", GREY), ("30_65", "30–65", GOOD), ("65p", _("Over 65"), WAIT)]
    if "" in mapping.values():
        segs.append(("", _("Age not recorded"), NONE))
    return {"doctype": "Family members", "map": mapping, "segments": segs}


def children_under_5(ctx):
    return {"doctype": "Family members", "names": [n for n, s in members_by_age(ctx)["map"].items() if s == "u5"]}


# Each programme's people, as family members (a person can be in several).
PROGRAMME_MEMBER_LINKS = {
    "mch": [("Pregnancy Registration", "familymember_id"), ("Birth Registration", "baby_family_member")],
    "palliative": [("Palliative Care Initial Assessment Form", "fmid")],
    "mental_health": [("Mental Health", "family_members")],
    "ncd": [("NCD", "familymember_id")],
    "cancer": [("Main Screening Form", "fmid")],
}


def programme_members(ctx, key):
    def compute():
        members = set()
        for doctype, field in PROGRAMME_MEMBER_LINKS.get(key, []):
            members.update(v for v in ctx.values(doctype, field).values() if v)
        return members & set(ctx.scope("Family members"))

    return ctx.memo(("members", key), compute)


def members_in_programmes(ctx):
    on = [k for k in enabled_programmes() if k in PROGRAMME_MEMBER_LINKS]
    mapping = {}
    # Counted once per programme in the donut: a member in two programmes is
    # in both slices, so this "map" is {member::programme: programme}.
    for key in on:
        for member in programme_members(ctx, key):
            mapping[f"{member}::{key}"] = key
    segs = [(key, PROGRAMME_LABELS[key], key) for key in on]
    return {"doctype": "Family members", "map": mapping, "segments": segs, "composite": True}


def members_in_two_or_more(ctx):
    on = [k for k in enabled_programmes() if k in PROGRAMME_MEMBER_LINKS]
    counts = {}
    for key in on:
        for member in programme_members(ctx, key):
            counts[member] = counts.get(member, 0) + 1
    return {"doctype": "Family members", "names": [m for m, c in counts.items() if c >= 2]}


# ---- Palliative / NCD / Mental health -----------------------------------


def palliative_due_this_week(ctx):
    today = getdate(nowdate())
    names = ctx.scope("Palliative care followup")
    if names:
        names = frappe.get_all(
            "Palliative care followup",
            filters={"name": ["in", names], "next_visit_date": ["between", [today, add_days(today, 7)]]},
            pluck="name",
        )
    return {"doctype": "Palliative care followup", "names": names}


def ncd_followup_overdue(ctx):
    names = ctx.scope("NCD")
    if names:
        names = frappe.get_all(
            "NCD",
            filters={"name": ["in", names], "next_followup_date": ["<", nowdate()], "status": ["!=", "Death"]},
            pluck="name",
        )
    return {"doctype": "NCD", "names": names}


def mental_high_risk(ctx):
    return {
        "doctype": "Mental Health",
        "names": [n for n, v in ctx.values("Mental Health", "risk_flag").items() if v and v != "None"],
    }


# ---- Cancer -------------------------------------------------------------


def cancer_rows(ctx):
    """The clinic worklist's rows (referred people and their evaluation),
    inside the filters."""

    def compute():
        if is_doctype_disabled("Main Screening Form"):
            return []
        from chw.cancer.worklist import get_clinical_worklist

        try:
            rows = get_clinical_worklist() or []
        except frappe.PermissionError:
            return []
        in_scope = set(ctx.scope("Main Screening Form"))
        return [r for r in rows if r["screening"] in in_scope]

    return ctx.memo("cancer_rows", compute)


def cancer_screened(ctx):
    names = ctx.scope("Main Screening Form")
    if names:
        names = frappe.get_all(
            "Main Screening Form",
            filters={"name": ["in", names]},
            or_filters={"oral_finished": 1, "breast_finished": 1, "cervical_finished": 1},
            pluck="name",
        )
    return {"doctype": "Main Screening Form", "names": names}


def cancer_referred(ctx):
    return {"doctype": "Main Screening Form", "names": [r["screening"] for r in cancer_rows(ctx)]}


def cancer_referred_for(ctx):
    mapping = {}
    for r in cancer_rows(ctx):
        sites = r["sites"]
        mapping[r["screening"]] = sites[0] if len(sites) == 1 else "multi"
    segs = [("oral", _("Oral only"), "oral"), ("breast", _("Breast only"), "breast"), ("cervical", _("Cervical only"), "cervical"), ("multi", _("Two or more"), GREY)]
    return {"doctype": "Main Screening Form", "map": mapping, "segments": segs}


def cancer_evaluation(ctx):
    mapping = {r["screening"]: r["status"] for r in cancer_rows(ctx)}
    segs = [("to_evaluate", _("To evaluate"), WAIT), ("in_progress", _("In progress"), MID), ("completed", _("Completed"), GOOD)]
    return {"doctype": "Main Screening Form", "map": mapping, "segments": segs}


def cancer_evaluated(ctx):
    return {"doctype": "Main Screening Form", "names": [r["screening"] for r in cancer_rows(ctx) if r["status"] == "completed"]}


SCREENING_STATUS = [
    ("Completed", _("Completed"), GOOD),
    ("Moved to Clinical Evaluation", _("Moved to Clinical Evaluation"), BAD),
    ("In Progress", _("In progress"), MID),
    ("Pending", _("Pending (“Not now”)"), WAIT),
    ("Not Screened", _("Not screened"), NONE),
    ("Not Done", _("Not done"), NONE),
]

# ---- The page -----------------------------------------------------------

PROGRAMME_LABELS = {
    "mch": _("MCH"),
    "palliative": _("Palliative Care"),
    "mental_health": _("Mental Health"),
    "ncd": _("NCD"),
    "cancer": _("Cancer"),
}

_trimester = indicator_split("trimester_first", {"first": GOOD, "second": WAIT, "third": BAD})
_anc4 = indicator_split("anc_4plus", {"met": GOOD, "short": WAIT})

# Every metric by id: (kind, function). Ids are "<section>.<name>".
METRICS = {
    # Households & families
    "hh.households": ("count", count("Household profile")),
    "hh.members": ("count", count("Family members")),
    "hh.women": ("count", count("Family members", {"gender": "Female"})),
    "hh.under5": ("count", children_under_5),
    "hh.multi": ("count", members_in_two_or_more),
    "hh.age": ("split", members_by_age),
    "hh.gender": ("split", field_split("Family members", "gender", [("Female", _("Women"), BAD), ("Male", _("Men"), MID)])),
    "hh.programmes": ("split", members_in_programmes),
    # MCH
    "mch.pregnancies": ("count", count("Pregnancy Registration")),
    "mch.first_trimester": ("count", segment_count(_trimester, "first")),
    "mch.anc_records": ("count", count("ANC Follow-up")),
    "mch.anc4": ("count", segment_count(_anc4, "met")),
    "mch.births": ("count", count("Birth Registration")),
    "mch.pnc": ("count", count("PNC")),
    "mch.children": ("count", count("Child 6w to 1 Year Reg and Followup")),
    "mch.trimester": ("split", _trimester),
    "mch.anc4_split": ("split", _anc4),
    "mch.high_risk": ("split", indicator_split("high_risk_clinic", {"drc": GOOD, "chc": MID, "other": GREY}, no_data_tone=BAD)),
    "mch.feeding": ("split", indicator_split("lactating_educated", {"educated": GOOD, "not_yet": WAIT})),
    "mch.child": ("split", indicator_split("child_immunised_weighed", {"full": GOOD, "partial": WAIT, "behind": BAD})),
    # Palliative care
    "pal.patients": ("count", count("Palliative Care Initial Assessment Form")),
    "pal.followups": ("count", count("Palliative care followup")),
    "pal.due": ("count", palliative_due_this_week),
    "pal.sores": ("count", count("Palliative care followup", {"are_pressure_sores_present": "Yes"})),
    "pal.low_support": ("count", count("Palliative Care Initial Assessment Form", {"support_status": ["like", "Inadequate%"]})),
    "pal.mobility": ("split", field_split("Palliative Care Initial Assessment Form", "mobility_status_ch", [])),
    "pal.referred_by": ("split", field_split("Palliative Care Initial Assessment Form", "referred_by", [])),
    "pal.support": ("split", field_split("Palliative Care Initial Assessment Form", "support_status", [])),
    # Mental health
    "mh.patients": ("count", count("Mental Health")),
    "mh.active": ("count", count("Mental Health", {"status": "Active"})),
    "mh.stable": ("count", count("Mental Health", {"status": "Stable"})),
    "mh.relapsed": ("count", count("Mental Health", {"status": "Relapsed"})),
    "mh.high_risk": ("count", mental_high_risk),
    "mh.status": ("split", field_split("Mental Health", "status", [
        ("Active", _("Active"), MID), ("Stable", _("Stable"), GOOD), ("Relapsed", _("Relapsed"), BAD),
        ("Discharged", _("Discharged"), GREY), ("Lost to Follow-up", _("Lost to follow-up"), NONE),
    ])),
    "mh.risk": ("split", field_split("Mental Health", "risk_flag", [
        ("None", _("No risk"), GOOD), ("Self-harm Risk", _("Self-harm risk"), WAIT),
        ("Suicide Risk", _("Suicide risk"), BAD), ("Violence Risk", _("Violence risk"), GREY),
    ])),
    # NCD
    "ncd.patients": ("count", count("NCD")),
    "ncd.high_risk": ("count", count("NCD", {"high_risk": "Yes"})),
    "ncd.overdue": ("count", ncd_followup_overdue),
    "ncd.deaths": ("count", count("NCD", {"status": "Death"})),
    "ncd.disease": ("split", field_split("NCD", "disease", [])),
    "ncd.treatment": ("split", field_split("NCD", "treatmentfrom", [
        ("PHC", _("PHC"), GOOD), ("Tribal hospital", _("Tribal hospital"), MID), ("Outside", _("Outside"), WAIT),
    ])),
    "ncd.risk": ("split", field_split("NCD", "high_risk", [("No", _("Not high risk"), GOOD), ("Yes", _("High risk"), BAD)])),
    # Cancer
    "ca.eligible": ("count", count("Family members", {"cancer_screening_eligible": "Yes"})),
    "ca.consent": ("count", count("Main Screening Form", {"consent_given": "Yes"})),
    "ca.screened": ("count", cancer_screened),
    "ca.referred": ("count", cancer_referred),
    "ca.evaluated": ("count", cancer_evaluated),
    "ca.oral": ("split", field_split("Main Screening Form", "oral_screening_status", SCREENING_STATUS, exclude=("Not Applicable",))),
    "ca.breast": ("split", field_split("Main Screening Form", "breast_screening_status", SCREENING_STATUS, exclude=("Not Applicable",))),
    "ca.cervical": ("split", field_split("Main Screening Form", "cervical_screening_status", SCREENING_STATUS, exclude=("Not Applicable",))),
    "ca.referred_for": ("split", cancer_referred_for),
    "ca.evaluation": ("split", cancer_evaluation),
    "ca.consent_split": ("split", field_split("Main Screening Form", "consent_given", [("Yes", _("Given"), GOOD), ("No", _("Not given"), BAD)])),
}

# What each section shows, in order. KPI: (metric, label, note). Journey:
# (metric, label). Donut: (metric, title, note, unit).
SECTIONS = [
    {
        "key": "households", "programme": None, "title": _("Households & families"),
        "kpis": [
            ("hh.households", _("Households"), _("Surveyed")),
            ("hh.members", _("Family members"), _("In those households")),
            ("hh.women", _("Women"), _("Family members")),
            ("hh.under5", _("Children under 5"), _("Family members")),
            ("hh.multi", _("In 2 or more programmes"), _("Seen by more than one team")),
        ],
        "donuts": [
            ("hh.age", _("Members by age"), _("All family members"), _("members")),
            ("hh.gender", _("Members by gender"), _("All family members"), _("members")),
            ("hh.programmes", _("Members in each programme"), _("A person in two programmes counts in both"), _("enrolments")),
        ],
    },
    {
        "key": "mch", "programme": "mch", "title": _("Mother & child health"), "subtitle": _("Pregnancy, birth and the first year"),
        "kpis": [
            ("mch.pregnancies", _("Pregnancies registered"), _("Pregnancy Registration")),
            ("mch.first_trimester", _("Started care in 1st trimester"), _("At registration")),
            ("mch.anc4", _("4+ ANC visits"), _("Completed ANC visits")),
            ("mch.births", _("Births registered"), _("Birth Registration")),
            ("mch.children", _("Children 0–1 followed"), _("Child 6w–1y follow-up")),
        ],
        "journey": (_("Pregnancy journey"), [
            ("mch.pregnancies", _("Pregnancies registered")), ("mch.anc_records", _("ANC follow-up started")),
            ("mch.anc4", _("4+ ANC visits")), ("mch.births", _("Births registered")), ("mch.pnc", _("PNC started")),
        ]),
        "donuts": [
            ("mch.trimester", _("Trimester at registration"), _("Pregnancy Registration, first visit"), _("women")),
            ("mch.anc4_split", _("ANC visits"), _("Completed visits per pregnancy"), _("women")),
            ("mch.high_risk", _("High-risk pregnancies"), _("Where they were followed up"), _("women")),
            ("mch.feeding", _("Feeding counselling"), _("Postpartum, EBF / complementary feeding"), _("mothers")),
            ("mch.child", _("Children 0–1"), _("Latest completed visit"), _("children")),
        ],
    },
    {
        "key": "palliative", "programme": "palliative", "title": _("Palliative care"), "subtitle": _("Patients cared for at home"),
        "kpis": [
            ("pal.patients", _("Patients assessed"), _("Initial assessment")),
            ("pal.followups", _("Follow-ups"), _("Home and outpatient visits")),
            ("pal.due", _("Visits due this week"), _("Next visit in 7 days")),
            ("pal.sores", _("Pressure sores"), _("At a follow-up")),
            ("pal.low_support", _("Low caregiver support"), _("Need extra help")),
        ],
        "donuts": [
            ("pal.mobility", _("Mobility"), _("Initial assessment"), _("patients")),
            ("pal.referred_by", _("Referred by"), _("Who referred the patient"), _("patients")),
            ("pal.support", _("Caregiver support"), _("Initial assessment"), _("patients")),
        ],
    },
    {
        "key": "mental_health", "programme": "mental_health", "title": _("Mental health"), "subtitle": _("Registered patients and their follow-up"),
        "kpis": [
            ("mh.patients", _("Patients registered"), _("Mental Health register")),
            ("mh.active", _("Active"), _("Under regular follow-up")),
            ("mh.stable", _("Stable"), _("Doing well")),
            ("mh.relapsed", _("Relapsed"), _("Need a visit soon")),
            ("mh.high_risk", _("High risk"), _("Self-harm, suicide or violence")),
        ],
        "donuts": [
            ("mh.status", _("Patient status"), _("Latest status"), _("patients")),
            ("mh.risk", _("Risk"), _("Latest assessment"), _("patients")),
        ],
    },
    {
        "key": "ncd", "programme": "ncd", "title": _("NCD care"), "subtitle": _("Long-term illness"),
        "kpis": [
            ("ncd.patients", _("Patients registered"), _("NCD register")),
            ("ncd.high_risk", _("High risk"), _("Need closer follow-up")),
            ("ncd.overdue", _("Follow-up overdue"), _("Next follow-up date passed")),
            ("ncd.deaths", _("Deaths"), _("Recorded in the register")),
        ],
        "donuts": [
            ("ncd.disease", _("Condition"), _("From the NCD register"), _("patients")),
            ("ncd.treatment", _("Treatment from"), _("Where they get their medicines"), _("patients")),
            ("ncd.risk", _("Risk"), _("Latest NCD visit"), _("patients")),
        ],
    },
    {
        "key": "cancer", "programme": "cancer", "title": _("Cancer screening"), "subtitle": _("From eligibility to clinical evaluation"),
        "kpis": [
            ("ca.eligible", _("Eligible"), _("Women 30–65 or tobacco users")),
            ("ca.consent", _("Consent given"), _("Main Screening Form")),
            ("ca.screened", _("Screened"), _("1 or more screening finished")),
            ("ca.referred", _("Referred to clinic"), _("Referral = Yes and finished")),
            ("ca.evaluated", _("Evaluations done"), _("Clinical evaluation submitted")),
        ],
        "journey": (_("From survey to clinic"), [
            ("ca.eligible", _("Eligible")), ("ca.consent", _("Consent given")), ("ca.screened", _("Screened")),
            ("ca.referred", _("Referred")), ("ca.evaluated", _("Evaluated")),
        ]),
        "donuts": [
            ("ca.oral", _("Oral screening"), _("Everyone who gave consent"), _("people")),
            ("ca.breast", _("Breast screening"), _("Women who gave consent"), _("women")),
            ("ca.cervical", _("Cervical screening"), _("Women who gave consent"), _("women")),
            ("ca.referred_for", _("Referred for"), _("Each person once"), _("referred")),
            ("ca.evaluation", _("Clinical evaluation"), _("Where each referred person is now"), _("referred")),
            ("ca.consent_split", _("Consent"), _("Main Screening Form"), _("people")),
        ],
    },
]


def _check():
    if not is_privileged_user():
        frappe.throw(_("The Overview is only available to coordinators."), frappe.PermissionError)


def _run(metric_id, ctx):
    kind, fn = METRICS[metric_id]
    return kind, fn(ctx)


@frappe.whitelist()
def get_overview(village=None, health_worker=None, date_range=None):
    """The whole page: households & families, then each programme that is
    switched on in App Setting."""
    _check()
    ctx = Ctx(village, health_worker, date_range)
    on = enabled_programmes()
    sections = []
    for sec in SECTIONS:
        if sec["programme"] and sec["programme"] not in on:
            continue
        out = {"key": sec["key"], "programme": sec["programme"], "title": sec["title"], "subtitle": sec.get("subtitle", ""), "kpis": [], "journey": None, "donuts": []}
        for metric_id, label, note in sec["kpis"]:
            if metric_id == "hh.multi" and len([k for k in on if k in PROGRAMME_MEMBER_LINKS]) < 2:
                continue
            _kind, data = _run(metric_id, ctx)
            if not _has_doctype(data):
                continue
            out["kpis"].append({"metric": metric_id, "label": label, "note": note, "value": len(data["names"])})
        if sec.get("journey"):
            title, steps = sec["journey"]
            journey = []
            for metric_id, label in steps:
                _kind, data = _run(metric_id, ctx)
                if _has_doctype(data):
                    journey.append({"metric": metric_id, "label": label, "value": len(data["names"])})
            if journey:
                out["journey"] = {"title": title, "steps": journey}
        for metric_id, title, note, unit in sec["donuts"]:
            if metric_id == "hh.programmes" and not on:
                continue
            _kind, data = _run(metric_id, ctx)
            if not _has_doctype(data):
                continue
            counts = {}
            for seg in data["map"].values():
                counts[seg] = counts.get(seg, 0) + 1
            out["donuts"].append({
                "metric": metric_id, "title": title, "note": note, "unit": unit,
                "total": len(data["map"]),
                "segments": [
                    {"key": key, "label": label, "tone": tone, "value": counts.get(key, 0)}
                    for key, label, tone in data["segments"]
                ],
            })
        sections.append(out)
    return {"programmes": on, "sections": sections}


def _has_doctype(data):
    return not is_doctype_disabled(data["doctype"])


@frappe.whitelist()
def get_overview_records(metric, segment=None, village=None, health_worker=None, date_range=None, start=0, page_length=50):
    """The people behind one number: a count metric, a whole donut, or one
    donut slice (segment). Paged; `total` is the full count."""
    _check()
    if metric not in METRICS:
        frappe.throw(_("Unknown number: {0}").format(metric))
    ctx = Ctx(village, health_worker, date_range)
    kind, data = _run(metric, ctx)
    doctype = data["doctype"]
    if kind == "count":
        names = list(data["names"])
        labels = {}
    else:
        seg_labels = {key: label for key, label, _tone in data["segments"]}
        items = [(n, s) for n, s in data["map"].items() if segment is None or s == segment]
        if data.get("composite"):
            # members_in_programmes: "member::programme" -> member
            items = [(n.split("::", 1)[0], s) for n, s in items]
        names, labels = [], {}
        for name, seg in items:
            if name not in labels:
                names.append(name)
                labels[name] = seg_labels.get(seg, seg)
    total = len(names)
    start, page_length = cint(start), cint(page_length) or 50
    page = names[start:start + page_length]
    return {"doctype": doctype, "total": total, "records": _display_rows(doctype, page, labels)}


def _display_rows(doctype, names, labels):
    if not names:
        return []
    meta = frappe.get_meta(doctype)
    title_field = DISPLAY_FIELDS.get(doctype, {}).get("title")
    hw_field = next((f for f in HEALTH_WORKER_FIELDS if meta.has_field(f)), None)
    wanted = {"title": title_field, "age": "age", "gender": "gender", "village": "village", "health_worker": hw_field}
    fields = ["name"] + [f for f in wanted.values() if f and meta.has_field(f)]
    by_name = {r.name: r for r in frappe.get_all(doctype, filters={"name": ["in", names]}, fields=fields, limit_page_length=0)}
    rows = []
    for name in names:
        r = by_name.get(name)
        if not r:
            continue
        row = {"name": name, "status": labels.get(name, "")}
        for key, field in wanted.items():
            row[key] = r.get(field) if field and meta.has_field(field) else None
        rows.append(row)
    return rows

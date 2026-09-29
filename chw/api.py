import frappe
from frappe import _
from frappe.query_builder import Order
from frappe.query_builder.functions import IfNull
from pypika.analytics import RowNumber
from pypika.terms import ExistsCriterion
from frappe.utils import getdate, add_days, add_months


PRIVILEGED_ROLES = {'Administrator', 'System Manager', 'Program Coordinator'}


def get_week_bounds(any_date=None):
    """Return (monday, sunday) of the week containing any_date (defaults to today)."""
    any_date = getdate(any_date) if any_date else getdate(frappe.utils.nowdate())
    week_start = add_days(any_date, -any_date.weekday())
    week_end = add_days(week_start, 6)
    return week_start, week_end


def get_period_bounds(view_mode, any_date=None):
    """Return (start, end) of the reporting period containing any_date.

    view_mode='day' scopes the period to that single day; anything else
    (default 'week') scopes it to the Monday-Sunday week containing it.
    """
    if view_mode == 'day':
        day = getdate(any_date) if any_date else getdate(frappe.utils.nowdate())
        return day, day
    return get_week_bounds(any_date)


@frappe.whitelist()
def get_current_health_worker():
    """Resolve the Health Worker record linked to the logged-in user, if any."""
    if frappe.session.user in ('Administrator', 'Guest'):
        return None
    return frappe.db.get_value('Health Worker', {'user': frappe.session.user}, 'name')


@frappe.whitelist()
def get_villages():
    """Return all village names for the dashboard's Village filter."""
    return frappe.get_all('Village', pluck='name', order_by='name asc')


@frappe.whitelist(allow_guest=True)
def get_app_branding():
    """Return the CHW Vue app's configurable logo/name/login text, set from
    the desk via App Setting, for the header and login page to render."""
    settings = frappe.get_single('App Setting')
    return {
        'app_name': settings.app_name or 'CHW',
        'app_logo': settings.app_logo or None,
        'login_headline': settings.login_headline or None,
        'login_description': settings.login_description or None,
    }


SYSTEM_ADMIN_ROLES = {'Administrator', 'System Manager'}


@frappe.whitelist()
def get_current_user_context():
    """Return whether the logged-in user has a privileged (System Manager /
    Program Coordinator / Administrator) role, so the Vue app can show or
    hide privileged-only UI (e.g. the App Settings dialog) without exposing
    the full role list. `is_system_admin` is the narrower System Manager /
    Administrator check, for UI that's more sensitive than general app
    content settings (e.g. email server configuration)."""
    user_roles = set(frappe.get_roles())
    return {
        'is_privileged': bool(PRIVILEGED_ROLES & user_roles),
        'is_system_admin': bool(SYSTEM_ADMIN_ROLES & user_roles),
    }


def row_visible_to_user(row, user_roles):
    """A CHW Dashboard Card row (`enabled` + `restrict_by_role` +
    comma-separated `roles`) is visible if enabled and either
    role-restriction is off or the row shares at least one role with the
    current user."""
    if not row.enabled:
        return False
    if not row.restrict_by_role:
        return True
    allowed_roles = {r.strip() for r in (row.roles or '').split(',') if r.strip()}
    return bool(allowed_roles & user_roles)


def module_visible_to_user(module_doc, user_roles):
    """An App Module Setting doc is visible if enabled and either
    role-restriction is off or its `roles` child table shares at least one
    role with the current user."""
    if not module_doc.enabled:
        return False
    if not module_doc.restrict_by_role:
        return True
    allowed_roles = {r.role for r in (module_doc.roles or [])}
    return bool(allowed_roles & user_roles)


@frappe.whitelist()
def get_app_modules():
    """Return the CHW Vue app's navigation modules (from the standalone App
    Module Setting doctype), filtered to those enabled and visible to the
    current user's roles. Each module lists the sidebar DocTypes it exposes."""
    if frappe.session.user == 'Guest':
        frappe.throw(_('Not permitted'), frappe.PermissionError)

    user_roles = set(frappe.get_roles())
    names = frappe.get_all('App Module Setting', pluck='name', order_by='sort_order asc')

    modules = []
    for name in names:
        module_doc = frappe.get_cached_doc('App Module Setting', name)
        if not module_visible_to_user(module_doc, user_roles):
            continue
        doctypes = [
            {
                'doctype_name': item.doctype_name,
                'label': item.label or item.doctype_name,
                'icon': item.icon or module_doc.icon or 'file-text',
                'route': item.route or frappe.scrub(item.doctype_name).replace('_', '-'),
            }
            for item in (module_doc.doctypes or [])
            if item.doctype_name
        ]
        if not doctypes:
            continue
        modules.append({
            'label': module_doc.label,
            'icon': module_doc.icon or 'file-text',
            'doctypes': doctypes,
        })
    return modules


@frappe.whitelist()
def global_search(txt):
    """Search across every DocType configured in the app's modules (App
    Module Setting -> doctypes), respecting the user's normal doc
    permissions on each. Used by the Vue app's navbar search box."""
    from frappe.desk.search import search_link

    txt = (txt or '').strip()
    if not txt or frappe.session.user == 'Guest':
        return []

    user_roles = set(frappe.get_roles())
    module_names = frappe.get_all('App Module Setting', pluck='name')

    seen_doctypes = set()
    doctype_routes = {}
    for module_name in module_names:
        module_doc = frappe.get_cached_doc('App Module Setting', module_name)
        if not module_visible_to_user(module_doc, user_roles):
            continue
        for item in (module_doc.doctypes or []):
            if not item.doctype_name or item.doctype_name in seen_doctypes:
                continue
            seen_doctypes.add(item.doctype_name)
            doctype_routes[item.doctype_name] = item.route or frappe.scrub(item.doctype_name).replace('_', '-')

    results = []
    for doctype_name in seen_doctypes:
        try:
            matches = search_link(doctype_name, txt, page_length=5)
        except (frappe.PermissionError, frappe.DoesNotExistError):
            continue
        for match in matches:
            results.append({
                'doctype_name': doctype_name,
                'route': doctype_routes[doctype_name],
                'name': match.get('value'),
                'description': match.get('description'),
            })

    return results[:30]


@frappe.whitelist()
def get_dashboard_cards():
    """Return the CHW Vue app's Dashboard stat card configuration, filtered to
    those enabled and visible to the current user's roles."""
    if frappe.session.user == 'Guest':
        frappe.throw(_('Not permitted'), frappe.PermissionError)

    user_roles = set(frappe.get_roles())
    settings = frappe.get_single('App Setting')
    cards = []
    for row in (settings.dashboard_cards or []):
        if not row_visible_to_user(row, user_roles):
            continue
        cards.append({
            'stat_key': row.stat_key,
            'label': row.label,
            'icon': row.icon or 'bar-chart-2',
            'color': row.color or 'gray',
        })
    return cards


@frappe.whitelist()
@frappe.validate_and_sanitize_search_inputs
def family_members_with_pregnancy_registration(doctype, txt, searchfield, start, page_len, filters):
    """Link query for Birth Registration's Family Member Id: only show family
    members who have at least one Pregnancy Registration on record."""
    FamilyMembers = frappe.qb.DocType('Family members')
    PregnancyRegistration = frappe.qb.DocType('Pregnancy Registration')

    search_field = FamilyMembers[searchfield]
    has_pregnancy_registration = ExistsCriterion(
        frappe.qb.from_(PregnancyRegistration)
        .select(PregnancyRegistration.name)
        .where(PregnancyRegistration.familymember_id == FamilyMembers.name)
    )
    query = (
        frappe.qb.from_(FamilyMembers)
        .select(FamilyMembers.name, FamilyMembers.family_member)
        .where(search_field.like(f'%{txt}%'))
        .where(has_pregnancy_registration)
        .orderby(FamilyMembers.family_member)
        .limit(page_len)
        .offset(start)
    )
    return query.run()


def apply_village_filter(filters, village):
    if village and village != 'All Villages':   
        filters['village'] = village
    return filters


def mental_health_parents_for_village(village):
    """Return Mental Health names in `village`, or None if no village filter is active.

    Mental Health Followup Child rows don't carry their own village - it lives on the
    parent Mental Health record - so village filtering has to go through a name lookup
    instead of a direct field filter.
    """
    if not village or village == 'All Villages':
        return None
    return frappe.get_all('Mental Health', filters={'village': village}, pluck='name') or ['']


def latest_child_growth_classifications(village=None):
    """Return, per child, their most recent Completed Child Growth Followup
    classification. Uses `status = 'Completed'` rather than the row's
    (pre-generated, schedule) date, since a visit can genuinely happen before
    its originally scheduled date - the date field is a plan, not proof a
    visit occurred, and Pending rows get a placeholder classification too
    (MUAC defaults to 0) so they must never be counted."""
    ChildGrowthFollowup = frappe.qb.DocType('Child Growth Followup')
    ChildGrowthMonitoring = frappe.qb.DocType('Child Growth Monitoring')

    ranked = (
        frappe.qb.from_(ChildGrowthFollowup)
        .join(ChildGrowthMonitoring)
        .on(ChildGrowthMonitoring.name == ChildGrowthFollowup.parent)
        .select(
            ChildGrowthFollowup.parent.as_('parent'),
            ChildGrowthFollowup.classification.as_('classification'),
            RowNumber()
            .over(ChildGrowthFollowup.parent)
            .orderby(ChildGrowthFollowup.date, order=Order.desc)
            .as_('rn'),
        )
        .where(ChildGrowthFollowup.status == 'Completed')
        .where(IfNull(ChildGrowthFollowup.classification, '') != '')
    )
    if village and village != 'All Villages':
        ranked = ranked.where(ChildGrowthMonitoring.village == village)

    latest = frappe.qb.from_(ranked).select(ranked.parent, ranked.classification).where(ranked.rn == 1)
    return latest.run(as_dict=True)


def current_child_growth_classification_counts(village=None):
    """Count children currently classified Normal/MAM/SAM (see
    latest_child_growth_classifications for the per-child rule)."""
    counts = {'Normal': 0, 'MAM': 0, 'SAM': 0}
    for row in latest_child_growth_classifications(village):
        if row.classification in counts:
            counts[row.classification] += 1
    return counts


def anc_fully_completed_names(village=None):
    """Names of ANC Follow-up records counted as exited: primarily those explicitly
    `status = 'Closed'` (set automatically once her Birth Registration is recorded -
    see create_pnc_from_birth_registration), falling back to the older heuristic of
    every generated visit row (LMP to EDD, pre-filled by ANCFollowup.generate_visit_schedule)
    being marked Completed, for any record that finished before that status field
    existed."""
    ANCFollowup = frappe.qb.DocType('ANC Follow-up')
    ANCFollowupChild = frappe.qb.DocType('ANC Followup Child')

    has_children = ExistsCriterion(
        frappe.qb.from_(ANCFollowupChild)
        .select(ANCFollowupChild.name)
        .where(ANCFollowupChild.parent == ANCFollowup.name)
    )
    has_incomplete_children = ExistsCriterion(
        frappe.qb.from_(ANCFollowupChild)
        .select(ANCFollowupChild.name)
        .where(ANCFollowupChild.parent == ANCFollowup.name)
        .where(IfNull(ANCFollowupChild.status, '') != 'Completed')
    )

    query = (
        frappe.qb.from_(ANCFollowup)
        .select(ANCFollowup.name)
        .where(
            (ANCFollowup.status == 'Closed')
            | (has_children & has_incomplete_children.negate())
        )
    )
    if village and village != 'All Villages':
        query = query.where(ANCFollowup.village == village)

    rows = query.run(as_dict=True)
    return [row.name for row in rows]


def pnc_fully_completed_names(village=None):
    """Names of PNC records counted as exited postnatal care: her postnatal window
    (date_of_delivery + PNC_SCHEDULE_DURATION_MONTHS, the same duration her visit
    schedule was generated over) has fully elapsed. Time-based rather than an
    all-rows-completed check, since a missed visit doesn't mean her postnatal
    period hasn't ended."""
    from chw.common.doctype.pnc.pnc import PNC_SCHEDULE_DURATION_MONTHS

    today_date = getdate(frappe.utils.nowdate())
    cutoff_delivery_date = add_months(today_date, -PNC_SCHEDULE_DURATION_MONTHS)

    PNC = frappe.qb.DocType('PNC')
    query = (
        frappe.qb.from_(PNC)
        .select(PNC.name)
        .where(PNC.date_of_delivery.isnotnull())
        .where(PNC.date_of_delivery <= cutoff_delivery_date)
    )
    if village and village != 'All Villages':
        query = query.where(PNC.village == village)

    rows = query.run(as_dict=True)
    return [row.name for row in rows]


def is_privileged_user():
    return bool(PRIVILEGED_ROLES & set(frappe.get_roles()))


def validate_phone_number(phone_number):
    """Raise if phone_number contains anything other than digits."""
    if phone_number and not phone_number.isdigit():
        frappe.throw(_('Phone Number must contain digits only'))


def sync_next_visit_todo(doc, date_field, description):
    """Keep a single Open ToDo, assigned to the record's Health Worker, in sync with a next-visit date field.

    Call this from a doctype's on_update(). The ToDo's due date moves forward as the next
    visit date recalculates, instead of piling up a new reminder every time it changes.
    """
    next_date = doc.get(date_field)
    user = doc.get('health_worker_name') and frappe.db.get_value(
        'Health Worker', doc.health_worker_name, 'user'
    )

    todo_name = frappe.db.get_value(
        'ToDo',
        {'reference_type': doc.doctype, 'reference_name': doc.name, 'status': 'Open'},
        'name'
    )

    if not next_date or not user:
        if todo_name:
            frappe.db.set_value('ToDo', todo_name, 'status', 'Cancelled')
        return

    if todo_name:
        frappe.db.set_value('ToDo', todo_name, {
            'date': next_date,
            'allocated_to': user,
            'description': description,
        })
    else:
        from frappe.desk.form.assign_to import add as assign_to_add

        assign_to_add({
            'doctype': doc.doctype,
            'name': doc.name,
            'assign_to': [user],
            'date': next_date,
            'description': description,
        }, ignore_permissions=True)


def find_matching_anc_followup(family_member_id, date_of_delivery):
    """Best-match this mother's ANC Follow-up record for a given delivery.

    A mother can have more than one Pregnancy Registration on record over time, so
    pick the one whose estimated due date is closest to the actual delivery date,
    then look up its linked ANC Follow-up.
    """
    if not family_member_id:
        return None

    registrations = frappe.get_all(
        'Pregnancy Registration',
        filters={'familymember_id': family_member_id},
        fields=['name', 'estimated_date_of_delivery'],
    )
    if not registrations:
        return None

    dated = [r for r in registrations if r.estimated_date_of_delivery]
    if date_of_delivery and dated:
        target = getdate(date_of_delivery)
        dated.sort(key=lambda r: abs((getdate(r.estimated_date_of_delivery) - target).days))
        pregnancy_registration = dated[0].name
    else:
        pregnancy_registration = registrations[0].name

    return frappe.db.get_value('ANC Follow-up', {'pregnant_id': pregnancy_registration}, 'name')


def create_pnc_from_birth_registration(doc, method=None):
    """Move a mother from ANC into postnatal tracking automatically: when a Birth
    Registration is saved, create her linked PNC record (skipping if one already
    exists, or if the family member isn't female - PNC.validate_gender() would
    reject it anyway), and close out her matched ANC Follow-up record so its
    remaining (now-moot) Pending visits stop counting as due/backlog. Runs on
    after_insert, so it never fires twice for the same Birth Registration.
    """
    if not doc.family_member_id:
        return

    if frappe.db.exists('PNC', {'birth_registration_id': doc.name}):
        return

    gender = frappe.db.get_value('Family members', doc.family_member_id, 'gender')
    if gender and gender != 'Female':
        return

    anc_followup_id = find_matching_anc_followup(doc.family_member_id, doc.date_of_delivery)

    try:
        frappe.get_doc({
            'doctype': 'PNC',
            'birth_registration_id': doc.name,
            'anc_followup_id': anc_followup_id,
            'first_name': doc.first_name,
            'village': doc.village,
            'father_husband_name': doc.husbands_name,
            'name_of_child': doc.baby_name,
            'date_of_delivery': doc.date_of_delivery,
            'phone_number': doc.phone_number,
            'health_worker_name': doc.health_worker_name,
        }).insert(ignore_permissions=True)
    except Exception:
        frappe.log_error(frappe.get_traceback(), 'Failed to auto-create PNC from Birth Registration')

    if anc_followup_id:
        try:
            anc_followup = frappe.get_doc('ANC Follow-up', anc_followup_id)
            if anc_followup.status != 'Closed':
                anc_followup.status = 'Closed'
                anc_followup.save(ignore_permissions=True)
        except Exception:
            frappe.log_error(frappe.get_traceback(), 'Failed to close ANC Follow-up from Birth Registration')


@frappe.whitelist()
def chw_visit_summary(target_date=None, visit_type=None, village=None, view_mode='week'):
    """Return this health worker's pending / missed visit summary for the dashboard,
    scoped to a single day when view_mode='day' or the containing week otherwise."""
    period_start, period_end = get_period_bounds(view_mode, target_date)
    week_start, week_end = period_start, period_end

    health_worker = get_current_health_worker()
    privileged = is_privileged_user()
    no_health_worker_linked = not health_worker and not privileged

    visits = []
    per_type_scheduled = {}

    def hw_filters(filters):
        if health_worker:
            filters['health_worker_name'] = health_worker
        return apply_village_filter(filters, village)

    if not no_health_worker_linked:
        # Query PNC records due this week
        try:
            pnc_records = frappe.get_list(
                'PNC',
                filters=hw_filters({'next_pnc_visit_date': ['between', [week_start, week_end]]}),
                fields=['name', 'first_name', 'village', 'next_pnc_visit_date as visit_date'],
                limit_page_length=500
            )
            for rec in pnc_records:
                visits.append({
                    'visit_type': 'PNC',
                    'patient_name': rec.first_name or '-',
                    'visit_date': rec.visit_date,
                    'status': 'Pending'
                })
            per_type_scheduled['PNC'] = len(pnc_records)
        except Exception as e:
            frappe.log_error(f"Error fetching PNC records: {str(e)}")
            per_type_scheduled['PNC'] = 0

        # Query ANC Follow-up records due this week (note: hyphen in name)
        try:
            anc_records = frappe.get_list(
                'ANC Follow-up',
                filters=hw_filters({'next_anc_visit_date': ['between', [week_start, week_end]]}),
                fields=['name', 'pregnant_id', 'next_anc_visit_date as visit_date', 'first_name'],
                limit_page_length=500
            )
            for rec in anc_records:
                visits.append({
                    'visit_type': 'ANC Follow-up',
                    'patient_name': rec.first_name or rec.pregnant_id or '-',
                    'visit_date': rec.visit_date,
                    'status': 'Pending'
                })
            per_type_scheduled['ANC Follow-up'] = len(anc_records)
        except Exception as e:
            frappe.log_error(f"Error fetching ANC Follow-up records: {str(e)}")
            per_type_scheduled['ANC Follow-up'] = 0

        # Query NCD records due this week
        try:
            ncd_records = frappe.get_list(
                'NCD',
                filters=hw_filters({'next_followup_date': ['between', [week_start, week_end]]}),
                fields=['name', 'first_name', 'village', 'next_followup_date as visit_date'],
                limit_page_length=500
            )
            for rec in ncd_records:
                visits.append({
                    'visit_type': 'NCD',
                    'patient_name': rec.first_name or '-',
                    'visit_date': rec.visit_date,
                    'status': 'Pending'
                })
            per_type_scheduled['NCD'] = len(ncd_records)
        except Exception as e:
            frappe.log_error(f"Error fetching NCD records: {str(e)}")
            per_type_scheduled['NCD'] = 0

        # Query Child Growth Monitoring records due this week
        try:
            child_growth_records = frappe.get_list(
                'Child Growth Monitoring',
                filters=hw_filters({'next_followup_date': ['between', [week_start, week_end]]}),
                fields=['name', 'first_name', 'village', 'next_followup_date as visit_date'],
                limit_page_length=500
            )
            for rec in child_growth_records:
                visits.append({
                    'visit_type': 'Child Growth Monitoring',
                    'patient_name': rec.first_name or '-',
                    'visit_date': rec.visit_date,
                    'status': 'Pending'
                })
            per_type_scheduled['Child Growth Monitoring'] = len(child_growth_records)
        except Exception as e:
            frappe.log_error(f"Error fetching Child Growth Monitoring records: {str(e)}")
            per_type_scheduled['Child Growth Monitoring'] = 0

        # Query Mental Health followups due this week
        try:
            mh_filters = {
                'expected_date': ['between', [week_start, week_end]],
                'done': 0
            }
            if health_worker:
                mh_filters['health_worker_name'] = health_worker
            village_parents = mental_health_parents_for_village(village)
            if village_parents is not None:
                mh_filters['parent'] = ['in', village_parents]
            followup_records = frappe.get_all(
                'Mental Health Followup Child',
                filters=mh_filters,
                fields=['name', 'parent', 'expected_date as visit_date']
            )
            for followup in followup_records:
                patient_name = frappe.get_value('Mental Health', followup.parent, 'patient_name') or '-'
                visits.append({
                    'visit_type': 'Mental Health',
                    'patient_name': patient_name,
                    'visit_date': followup.visit_date,
                    'status': 'Pending'
                })
            per_type_scheduled['Mental Health'] = len(followup_records)
        except Exception as e:
            frappe.log_error(f"Error fetching Mental Health records: {str(e)}")
            per_type_scheduled['Mental Health'] = 0

        # Query Preconception records due this week
        try:
            precon_records = frappe.get_list(
                'Preconception Reg and Followup',
                filters=hw_filters({'next_visit_date': ['between', [week_start, week_end]]}),
                fields=['name', 'patient_name', 'village', 'next_visit_date as visit_date'],
                limit_page_length=500
            )
            for rec in precon_records:
                visits.append({
                    'visit_type': 'Preconception',
                    'patient_name': rec.patient_name or '-',
                    'visit_date': rec.visit_date,
                    'status': 'Pending'
                })
            per_type_scheduled['Preconception'] = len(precon_records)
        except Exception as e:
            frappe.log_error(f"Error fetching Preconception records: {str(e)}")
            per_type_scheduled['Preconception'] = 0

        # Query Postpartum records due this week
        try:
            postpartum_records = frappe.get_list(
                'Postpartum Reg and Followup',
                filters=hw_filters({'next_visit_date': ['between', [week_start, week_end]]}),
                fields=['name', 'patient_name', 'village', 'next_visit_date as visit_date'],
                limit_page_length=500
            )
            for rec in postpartum_records:
                visits.append({
                    'visit_type': 'Postpartum',
                    'patient_name': rec.patient_name or '-',
                    'visit_date': rec.visit_date,
                    'status': 'Pending'
                })
            per_type_scheduled['Postpartum'] = len(postpartum_records)
        except Exception as e:
            frappe.log_error(f"Error fetching Postpartum records: {str(e)}")
            per_type_scheduled['Postpartum'] = 0

        # Query Child 6w-1y records due this week
        try:
            child_6w_1y_records = frappe.get_list(
                'Child 6w to 1 Year Reg and Followup',
                filters=hw_filters({'next_visit_date': ['between', [week_start, week_end]]}),
                fields=['name', 'patient_name', 'village', 'next_visit_date as visit_date'],
                limit_page_length=500
            )
            for rec in child_6w_1y_records:
                visits.append({
                    'visit_type': 'Child 6w-1y',
                    'patient_name': rec.patient_name or '-',
                    'visit_date': rec.visit_date,
                    'status': 'Pending'
                })
            per_type_scheduled['Child 6w-1y'] = len(child_6w_1y_records)
        except Exception as e:
            frappe.log_error(f"Error fetching Child 6w-1y records: {str(e)}")
            per_type_scheduled['Child 6w-1y'] = 0

        # Query Palliative Care records due this week - no village field on this
        # doctype (see apply_village_filter's own docstring reasoning for Mental
        # Health), so village filtering doesn't apply here, health worker still does.
        try:
            palliative_filters = {'next_visit_date': ['between', [week_start, week_end]]}
            if health_worker:
                palliative_filters['health_worker_name'] = health_worker
            palliative_records = frappe.get_list(
                'Palliative care followup',
                filters=palliative_filters,
                fields=['name', 'name1', 'next_visit_date as visit_date'],
                limit_page_length=500
            )
            for rec in palliative_records:
                visits.append({
                    'visit_type': 'Palliative Care',
                    'patient_name': rec.name1 or '-',
                    'visit_date': rec.visit_date,
                    'status': 'Pending'
                })
            per_type_scheduled['Palliative Care'] = len(palliative_records)
        except Exception as e:
            frappe.log_error(f"Error fetching Palliative Care records: {str(e)}")
            per_type_scheduled['Palliative Care'] = 0

    total_count = len(visits)

    # Get registration statistics
    try:
        pregnancy_registrations = frappe.db.count('Pregnancy Registration', apply_village_filter({}, village))
        birth_registrations = frappe.db.count('Birth Registration', apply_village_filter({}, village))
    except:
        pregnancy_registrations = 0
        birth_registrations = 0

    # Get recent statistics (last 30 days)
    thirty_days_ago = frappe.utils.add_days(frappe.utils.nowdate(), -30)

    try:
        recent_registrations = frappe.db.count(
            'Pregnancy Registration',
            filters=apply_village_filter({'creation': ['>=', thirty_days_ago]}, village)
        )
    except:
        recent_registrations = 0

    try:
        recent_enrollments = 0  # Can be calculated from any enrollment doctype if available
    except:
        recent_enrollments = 0

    try:
        recent_visits = total_count  # Uses today's visits
    except:
        recent_visits = 0

    per_type_backlog = {}
    if not no_health_worker_linked:
        try:
            per_type_backlog['PNC'] = frappe.db.count(
                'PNC',
                hw_filters({'next_pnc_visit_date': ['<', week_start]})
            )
        except Exception as e:
            frappe.log_error(f"Error calculating PNC backlog count: {str(e)}")
            per_type_backlog['PNC'] = 0

        try:
            per_type_backlog['ANC Follow-up'] = frappe.db.count(
                'ANC Follow-up',
                hw_filters({'next_anc_visit_date': ['<', week_start]})
            )
        except Exception as e:
            frappe.log_error(f"Error calculating ANC Follow-up backlog count: {str(e)}")
            per_type_backlog['ANC Follow-up'] = 0

        try:
            per_type_backlog['NCD'] = frappe.db.count(
                'NCD',
                hw_filters({'next_followup_date': ['<', week_start]})
            )
        except Exception as e:
            frappe.log_error(f"Error calculating NCD backlog count: {str(e)}")
            per_type_backlog['NCD'] = 0

        try:
            per_type_backlog['Child Growth Monitoring'] = frappe.db.count(
                'Child Growth Monitoring',
                hw_filters({'next_followup_date': ['<', week_start]})
            )
        except Exception as e:
            frappe.log_error(f"Error calculating Child Growth Monitoring backlog count: {str(e)}")
            per_type_backlog['Child Growth Monitoring'] = 0

        try:
            mh_backlog_filters = {
                'expected_date': ['<', week_start],
                'done': 0
            }
            if health_worker:
                mh_backlog_filters['health_worker_name'] = health_worker
            village_parents = mental_health_parents_for_village(village)
            if village_parents is not None:
                mh_backlog_filters['parent'] = ['in', village_parents]
            per_type_backlog['Mental Health'] = frappe.db.count('Mental Health Followup Child', mh_backlog_filters)
        except Exception as e:
            frappe.log_error(f"Error calculating Mental Health backlog count: {str(e)}")
            per_type_backlog['Mental Health'] = 0

        try:
            per_type_backlog['Preconception'] = frappe.db.count(
                'Preconception Reg and Followup',
                hw_filters({'next_visit_date': ['<', week_start]})
            )
        except Exception as e:
            frappe.log_error(f"Error calculating Preconception backlog count: {str(e)}")
            per_type_backlog['Preconception'] = 0

        try:
            per_type_backlog['Postpartum'] = frappe.db.count(
                'Postpartum Reg and Followup',
                hw_filters({'next_visit_date': ['<', week_start]})
            )
        except Exception as e:
            frappe.log_error(f"Error calculating Postpartum backlog count: {str(e)}")
            per_type_backlog['Postpartum'] = 0

        try:
            per_type_backlog['Child 6w-1y'] = frappe.db.count(
                'Child 6w to 1 Year Reg and Followup',
                hw_filters({'next_visit_date': ['<', week_start]})
            )
        except Exception as e:
            frappe.log_error(f"Error calculating Child 6w-1y backlog count: {str(e)}")
            per_type_backlog['Child 6w-1y'] = 0

        try:
            palliative_backlog_filters = {'next_visit_date': ['<', week_start]}
            if health_worker:
                palliative_backlog_filters['health_worker_name'] = health_worker
            per_type_backlog['Palliative Care'] = frappe.db.count('Palliative care followup', palliative_backlog_filters)
        except Exception as e:
            frappe.log_error(f"Error calculating Palliative Care backlog count: {str(e)}")
            per_type_backlog['Palliative Care'] = 0

    if visit_type:
        scheduled_count = per_type_scheduled.get(visit_type, 0)
        backlog_count = per_type_backlog.get(visit_type, 0)
    else:
        scheduled_count = sum(per_type_scheduled.values())
        backlog_count = sum(per_type_backlog.values())

    # ---- Child Growth (current status, not tied to a week) ----
    try:
        classification_counts = current_child_growth_classification_counts(village)
    except Exception:
        classification_counts = {'Normal': 0, 'MAM': 0, 'SAM': 0}

    # ---- Pregnancy (current status, not tied to a week) ----
    try:
        exit_women_anc = len(anc_fully_completed_names(village))
    except Exception:
        exit_women_anc = 0

    try:
        exit_women_pnc = len(pnc_fully_completed_names(village))
    except Exception:
        exit_women_pnc = 0

    return {
        "total_count": total_count,
        "scheduled_count": scheduled_count,
        "backlog_count": backlog_count,
        "week_start": week_start,
        "week_end": week_end,
        "view_mode": view_mode,
        "health_worker_linked": bool(health_worker) or privileged,
        "visits": visits,
        "recent_registrations": recent_registrations,
        "recent_enrollments": recent_enrollments,
        "recent_visits": recent_visits,
        "total_registrations": pregnancy_registrations + birth_registrations,
        "normal_children": classification_counts['Normal'],
        "mam_children": classification_counts['MAM'],
        "sam_children": classification_counts['SAM'],
        "exit_women_anc": exit_women_anc,
        "exit_women_pnc": exit_women_pnc,
    }


def redact_drilldown_records(records):
    """Strip fields a non-privileged caller shouldn't see (phone numbers,
    village) from chw_visit_drilldown results. Only Administrator/System
    Manager/Program Coordinator get the full record - a regular Health
    Worker only needs enough to identify and open their own patients, not a
    phone-number directory of every patient in the program."""
    if is_privileged_user():
        return records
    redacted = []
    for record in records:
        record = dict(record)
        record.pop('phone', None)
        record.pop('village', None)
        redacted.append(record)
    return redacted


@frappe.whitelist()
def chw_visit_drilldown(report_type, target_date=None, from_date=None, to_date=None,
                         visit_type=None, week_start=None, village=None, view_mode='week'):
    """Whitelisted entrypoint: redacts phone/village for non-privileged
    callers before returning. See _chw_visit_drilldown for the actual
    per-report_type record building."""
    if frappe.session.user == 'Guest':
        frappe.throw(_('Not permitted'), frappe.PermissionError)
    result = _chw_visit_drilldown(
        report_type, target_date, from_date, to_date, visit_type, week_start, village, view_mode
    )
    return {'records': redact_drilldown_records(result.get('records', []))}


def _chw_visit_drilldown(report_type, target_date=None, from_date=None, to_date=None,
                          visit_type=None, week_start=None, village=None, view_mode='week'):
    if not target_date:
        target_date = to_date or frappe.utils.nowdate()
    if not to_date:
        to_date = frappe.utils.nowdate()

    if report_type == 'recent_registrations':
        start_date = from_date or frappe.utils.add_days(to_date, -30)
        pregnancy_records = frappe.get_list(
            'Pregnancy Registration',
            filters=apply_village_filter({'creation': ['>=', start_date]}, village),
            fields=['name', 'creation', 'first_name as patient'],
            order_by='creation desc',
            limit_page_length=50
        )
        birth_records = frappe.get_list(
            'Birth Registration',
            filters=apply_village_filter({'creation': ['>=', start_date]}, village),
            fields=['name', 'creation', 'first_name as patient'],
            order_by='creation desc',
            limit_page_length=50
        )
        records = [
            {
                'doctype': 'Pregnancy Registration',
                'name': rec.name,
                'patient': rec.patient,
                'creation': rec.creation
            } for rec in pregnancy_records
        ] + [
            {
                'doctype': 'Birth Registration',
                'name': rec.name,
                'patient': rec.patient,
                'creation': rec.creation
            } for rec in birth_records
        ]
        return {'records': sorted(records, key=lambda x: x['creation'], reverse=True)}

    if report_type in ('backlog_visits', 'pending_visits'):
        health_worker = get_current_health_worker()
        privileged = is_privileged_user()
        if not health_worker and not privileged:
            return {'records': []}

        if report_type == 'backlog_visits':
            cutoff = getdate(week_start) if week_start else get_period_bounds(view_mode, target_date)[0]
            date_op = '<'
            date_value = cutoff
        else:
            period_from, period_to = get_period_bounds(view_mode, week_start or target_date)
            date_op = 'between'
            date_value = [period_from, period_to]

        def hw_filters(filters):
            if health_worker:
                filters['health_worker_name'] = health_worker
            return apply_village_filter(filters, village)

        def date_window_filters(date_field):
            """Filter `date_field` against the date_op/date_value window, scoped to
            health_worker/village. For '<' (backlog), Frappe's query builder coalesces
            NULL dates to 0001-01-01 - which would wrongly flag records with no date
            set (e.g. an NCD record cleared on death) as overdue - so require the
            date to actually be set in that case."""
            if date_op == '<':
                conditions = [[date_field, 'is', 'set'], [date_field, '<', date_value]]
                if health_worker:
                    conditions.append(['health_worker_name', '=', health_worker])
                if village and village != 'All Villages':
                    conditions.append(['village', '=', village])
                return conditions
            return hw_filters({date_field: [date_op, date_value]})

        records = []

        if not visit_type or visit_type == 'PNC':
            try:
                records += [
                    {
                        'doctype': 'PNC',
                        'name': rec.name,
                        'patient': rec.first_name or '-',
                        'village': rec.village,
                        'creation': rec.next_pnc_visit_date
                    }
                    for rec in frappe.get_all(
                        'PNC',
                        fields=['name', 'first_name', 'village', 'next_pnc_visit_date'],
                        filters=date_window_filters('next_pnc_visit_date')
                    )
                ]
            except Exception as e:
                frappe.log_error(f"Error fetching PNC backlog/pending: {str(e)}")

        if not visit_type or visit_type == 'ANC Follow-up':
            try:
                records += [
                    {
                        'doctype': 'ANC Follow-up',
                        'name': rec.name,
                        'patient': rec.first_name or rec.pregnant_id or '-',
                        'village': rec.village,
                        'creation': rec.next_anc_visit_date
                    }
                    for rec in frappe.get_all(
                        'ANC Follow-up',
                        fields=['name', 'pregnant_id', 'village', 'next_anc_visit_date', 'first_name'],
                        filters=date_window_filters('next_anc_visit_date')
                    )
                ]
            except Exception as e:
                frappe.log_error(f"Error fetching ANC Follow-up backlog/pending: {str(e)}")

        if not visit_type or visit_type == 'NCD':
            try:
                records += [
                    {
                        'doctype': 'NCD',
                        'name': rec.name,
                        'patient': rec.first_name or '-',
                        'village': rec.village,
                        'creation': rec.next_followup_date
                    }
                    for rec in frappe.get_all(
                        'NCD',
                        fields=['name', 'first_name', 'village', 'next_followup_date'],
                        filters=date_window_filters('next_followup_date')
                    )
                ]
            except Exception as e:
                frappe.log_error(f"Error fetching NCD backlog/pending: {str(e)}")

        if not visit_type or visit_type == 'Child Growth Monitoring':
            try:
                records += [
                    {
                        'doctype': 'Child Growth Monitoring',
                        'name': rec.name,
                        'patient': rec.first_name or '-',
                        'village': rec.village,
                        'creation': rec.next_followup_date
                    }
                    for rec in frappe.get_all(
                        'Child Growth Monitoring',
                        fields=['name', 'first_name', 'village', 'next_followup_date'],
                        filters=date_window_filters('next_followup_date')
                    )
                ]
            except Exception as e:
                frappe.log_error(f"Error fetching Child Growth Monitoring backlog/pending: {str(e)}")

        if not visit_type or visit_type == 'Mental Health':
            try:
                if date_op == '<':
                    mh_filters = [['expected_date', 'is', 'set'], ['expected_date', '<', date_value], ['done', '=', 0]]
                    if health_worker:
                        mh_filters.append(['health_worker_name', '=', health_worker])
                else:
                    mh_filters = {
                        'expected_date': [date_op, date_value],
                        'done': 0
                    }
                    if health_worker:
                        mh_filters['health_worker_name'] = health_worker
                village_parents = mental_health_parents_for_village(village)
                if village_parents is not None:
                    if isinstance(mh_filters, list):
                        mh_filters.append(['parent', 'in', village_parents])
                    else:
                        mh_filters['parent'] = ['in', village_parents]
                followup_records = frappe.get_all(
                    'Mental Health Followup Child',
                    filters=mh_filters,
                    fields=['name', 'parent', 'expected_date as creation']
                )
                for followup in followup_records:
                    mh = frappe.db.get_value('Mental Health', followup.parent, ['patient_name', 'village'], as_dict=True) or {}
                    records.append({
                        'doctype': 'Mental Health',
                        'name': followup.parent,
                        'patient': mh.get('patient_name') or '-',
                        'village': mh.get('village'),
                        'creation': followup.creation
                    })
            except Exception as e:
                frappe.log_error(f"Error fetching Mental Health backlog/pending: {str(e)}")

        if not visit_type or visit_type == 'Preconception':
            try:
                records += [
                    {
                        'doctype': 'Preconception Reg and Followup',
                        'name': rec.name,
                        'patient': rec.patient_name or '-',
                        'village': rec.village,
                        'creation': rec.next_visit_date
                    }
                    for rec in frappe.get_all(
                        'Preconception Reg and Followup',
                        fields=['name', 'patient_name', 'village', 'next_visit_date'],
                        filters=date_window_filters('next_visit_date')
                    )
                ]
            except Exception as e:
                frappe.log_error(f"Error fetching Preconception backlog/pending: {str(e)}")

        if not visit_type or visit_type == 'Postpartum':
            try:
                records += [
                    {
                        'doctype': 'Postpartum Reg and Followup',
                        'name': rec.name,
                        'patient': rec.patient_name or '-',
                        'village': rec.village,
                        'creation': rec.next_visit_date
                    }
                    for rec in frappe.get_all(
                        'Postpartum Reg and Followup',
                        fields=['name', 'patient_name', 'village', 'next_visit_date'],
                        filters=date_window_filters('next_visit_date')
                    )
                ]
            except Exception as e:
                frappe.log_error(f"Error fetching Postpartum backlog/pending: {str(e)}")

        if not visit_type or visit_type == 'Child 6w-1y':
            try:
                records += [
                    {
                        'doctype': 'Child 6w to 1 Year Reg and Followup',
                        'name': rec.name,
                        'patient': rec.patient_name or '-',
                        'village': rec.village,
                        'creation': rec.next_visit_date
                    }
                    for rec in frappe.get_all(
                        'Child 6w to 1 Year Reg and Followup',
                        fields=['name', 'patient_name', 'village', 'next_visit_date'],
                        filters=date_window_filters('next_visit_date')
                    )
                ]
            except Exception as e:
                frappe.log_error(f"Error fetching Child 6w-1y backlog/pending: {str(e)}")

        if not visit_type or visit_type == 'Palliative Care':
            try:
                # No village field on this doctype, so date_window_filters isn't
                # reused here (it bakes in a village condition) - built by hand
                # with just the date/health-worker parts that do apply.
                if date_op == '<':
                    palliative_filters = [['next_visit_date', 'is', 'set'], ['next_visit_date', '<', date_value]]
                    if health_worker:
                        palliative_filters.append(['health_worker_name', '=', health_worker])
                else:
                    palliative_filters = {'next_visit_date': [date_op, date_value]}
                    if health_worker:
                        palliative_filters['health_worker_name'] = health_worker
                records += [
                    {
                        'doctype': 'Palliative care followup',
                        'name': rec.name,
                        'patient': rec.name1 or '-',
                        'village': None,
                        'creation': rec.next_visit_date
                    }
                    for rec in frappe.get_all(
                        'Palliative care followup',
                        fields=['name', 'name1', 'next_visit_date'],
                        filters=palliative_filters
                    )
                ]
            except Exception as e:
                frappe.log_error(f"Error fetching Palliative Care backlog/pending: {str(e)}")

        return {
            'records': sorted(
                records,
                key=lambda x: x.get('creation').isoformat()
                if hasattr(x.get('creation'), 'isoformat')
                else str(x.get('creation') or ''),
                reverse=True
            )
        }

    if report_type == 'recent_enrollments':
        # Enrollment doctype is not available in this app, return empty list
        return {'records': []}

    if report_type == 'all_registrations':
        records = []
        try:
            records += [
                {
                    'doctype': 'Pregnancy Registration',
                    'name': rec.name,
                    'patient': rec.patient,
                    'creation': rec.creation
                }
                for rec in frappe.get_all(
                    'Pregnancy Registration',
                    filters=apply_village_filter({}, village),
                    fields=['name', 'creation', 'first_name as patient'],
                    order_by='creation desc',
                    limit_page_length=100
                )
            ]
        except Exception:
            pass

        try:
            records += [
                {
                    'doctype': 'Birth Registration',
                    'name': rec.name,
                    'patient': rec.patient,
                    'creation': rec.creation
                }
                for rec in frappe.get_all(
                    'Birth Registration',
                    filters=apply_village_filter({}, village),
                    fields=['name', 'creation', 'first_name as patient'],
                    order_by='creation desc',
                    limit_page_length=100
                )
            ]
        except Exception:
            pass

        return {'records': sorted(records, key=lambda x: x.get('creation') or '', reverse=True)}

    if report_type in ('sam_children', 'mam_children', 'normal_children'):
        classification = {'sam_children': 'SAM', 'mam_children': 'MAM', 'normal_children': 'Normal'}[report_type]
        parent_names = [
            row.parent for row in latest_child_growth_classifications(village)
            if row.classification == classification
        ]
        if not parent_names:
            return {'records': []}

        records = frappe.get_list(
            'Child Growth Monitoring',
            filters={'name': ['in', parent_names]},
            fields=['name', 'first_name', 'village', 'phone_number', 'creation'],
            order_by='creation desc',
            limit_page_length=0
        )
        return {'records': [
            {
                'doctype': 'Child Growth Monitoring',
                'name': r.name,
                'patient': r.first_name,
                'village': r.village,
                'phone': r.phone_number,
                'creation': r.creation
            } for r in records
        ]}

    if report_type == 'exit_women_anc':
        parent_names = anc_fully_completed_names(village)
        if not parent_names:
            return {'records': []}

        records = frappe.get_list(
            'ANC Follow-up',
            filters={'name': ['in', parent_names]},
            fields=['name', 'first_name', 'pregnant_id', 'village', 'phone_number', 'creation'],
            order_by='creation desc',
            limit_page_length=0
        )
        return {'records': [
            {
                'doctype': 'ANC Follow-up',
                'name': r.name,
                'patient': r.first_name or r.pregnant_id,
                'village': r.village,
                'phone': r.phone_number,
                'creation': r.creation
            } for r in records
        ]}

    if report_type == 'exit_women_pnc':
        parent_names = pnc_fully_completed_names(village)
        if not parent_names:
            return {'records': []}

        records = frappe.get_list(
            'PNC',
            filters={'name': ['in', parent_names]},
            fields=['name', 'first_name', 'village', 'phone_number', 'creation'],
            order_by='creation desc',
            limit_page_length=0
        )
        return {'records': [
            {
                'doctype': 'PNC',
                'name': r.name,
                'patient': r.first_name,
                'village': r.village,
                'phone': r.phone_number,
                'creation': r.creation
            } for r in records
        ]}

    return {'records': []}


# The 6 programs that make up this team's actual maternal/child-health
# continuum - NCD, Child Growth Monitoring and Mental Health are deliberately
# left out of this worklist (they stay on the existing Scheduled/Backlog
# view above, untouched). Each tuple is
# (doctype, short label shown on the badge, the "next visit" date field,
# the patient-name field, the village field or None if the doctype doesn't
# carry one - see Palliative care followup, which has none).
WORKLIST_PROGRAMS = [
    ('ANC Follow-up', 'ANC Follow-up', 'next_anc_visit_date', 'first_name', 'village'),
    ('PNC', 'PNC', 'next_pnc_visit_date', 'first_name', 'village'),
    ('Preconception Reg and Followup', 'Preconception', 'next_visit_date', 'patient_name', 'village'),
    ('Postpartum Reg and Followup', 'Postpartum', 'next_visit_date', 'patient_name', 'village'),
    ('Child 6w to 1 Year Reg and Followup', 'Child 6w-1y', 'next_visit_date', 'patient_name', 'village'),
    ('Palliative care followup', 'Palliative Care', 'next_visit_date', 'name1', None),
]


@frappe.whitelist()
def chw_worklist_summary(village=None, visit_type=None):
    """Overdue / Due Today / This Week buckets across the 6-program MCH
    continuum, for the My Worklist view - a fixed real-time split (always
    against today), independent of the broader Visit Dashboard's own
    arbitrary week/day navigation above."""
    health_worker = get_current_health_worker()
    privileged = is_privileged_user()
    if not health_worker and not privileged:
        return {'health_worker_linked': False, 'overdue': [], 'today': [], 'upcoming': []}

    today = getdate(frappe.utils.nowdate())
    week_end = getdate(get_period_bounds('week', today)[1])

    overdue, today_list, upcoming = [], [], []

    for doctype, label, date_field, patient_field, village_field in WORKLIST_PROGRAMS:
        if visit_type and visit_type != label:
            continue

        filters = {date_field: ['is', 'set']}
        if health_worker:
            filters['health_worker_name'] = health_worker
        if village_field and village and village != 'All Villages':
            filters[village_field] = village
        elif not village_field and village and village != 'All Villages':
            # This program has no village field to filter on at all (see
            # Palliative Care) - rather than silently ignoring the filter,
            # skip the program entirely so a village-scoped view never
            # leaks records that can't actually be confirmed to belong to it.
            continue

        fields = ['name', patient_field, date_field]
        if village_field:
            fields.append(village_field)

        try:
            records = frappe.get_all(doctype, filters=filters, fields=fields, limit_page_length=500)
        except Exception as e:
            frappe.log_error(f"Error fetching {doctype} for worklist: {str(e)}")
            continue

        for rec in records:
            date_val = rec.get(date_field)
            if not date_val:
                continue
            date_val = getdate(date_val)
            entry = {
                'doctype': doctype,
                'name': rec.name,
                'visit_type': label,
                'patient_name': rec.get(patient_field) or '-',
                'village': rec.get(village_field) if village_field else None,
                'visit_date': str(date_val),
            }
            if date_val < today:
                overdue.append(entry)
            elif date_val == today:
                today_list.append(entry)
            elif date_val <= week_end:
                upcoming.append(entry)

    sort_key = lambda e: e['visit_date']
    return {
        'health_worker_linked': bool(health_worker) or privileged,
        'health_worker_name': health_worker,
        'overdue': sorted(overdue, key=sort_key),
        'today': sorted(today_list, key=sort_key),
        'upcoming': sorted(upcoming, key=sort_key),
    }


@frappe.whitelist()
def chw_drilldown_excel(report_type, target_date=None, from_date=None, to_date=None,
                         visit_type=None, week_start=None, village=None, view_mode='week'):
    """Return the same records as chw_visit_drilldown but as a downloadable Excel file."""
    from frappe.utils.xlsxutils import make_xlsx

    data = chw_visit_drilldown(report_type, target_date, from_date, to_date, visit_type, week_start, village, view_mode)
    records = data.get('records', [])

    columns = ["Doctype", "Name", "Patient", "Village", "Phone", "Date"]
    rows = [columns]
    for r in records:
        rows.append([
            r.get('doctype', ''),
            r.get('name', ''),
            r.get('patient', ''),
            r.get('village', ''),
            r.get('phone', ''),
            str(r.get('creation', '') or '')
        ])

    xlsx_file = make_xlsx(rows, "CHW Report")

    frappe.response['filename'] = f"{report_type}.xlsx"
    frappe.response['filecontent'] = xlsx_file.getvalue()
    frappe.response['type'] = 'binary'


# ---- chw-dashboard (coordinator-only program overview) ----
# Separate from chw_visit_summary/chw_visit_drilldown above, which power
# each CHW's own pending/backlog worklist on the chw-visit-dashboard page
# and the mobile app. This section counts and lists raw records
# (Household/Family/Pregnancy/Birth/PNC/ANC/Palliative) for coordinators,
# filtered by village/health worker/date range wherever the underlying
# doctype carries that field. The two Palliative doctypes have neither a
# village nor a health_worker_name field, so those filters are skipped for
# them (has_village/has_health_worker below).

CHW_DASHBOARD_CARDS = [
    {
        'key': 'household',
        'label': 'Household Details',
        'doctype': 'Household profile',
        'display_field': 'household_head_name',
        'icon': 'home',
        'color': 'gray',
        'has_village': True,
        'has_health_worker': True,
    },
    {
        'key': 'family',
        'label': 'Family Members',
        'doctype': 'Family members',
        'display_field': 'family_member',
        'icon': 'users',
        'color': 'purple',
        'has_village': True,
        'has_health_worker': True,
    },
    {
        'key': 'pregnancy',
        'label': 'Pregnancy Registration',
        'doctype': 'Pregnancy Registration',
        'display_field': 'first_name',
        'icon': 'user-plus',
        'color': 'blue',
        'has_village': True,
        'has_health_worker': True,
    },
    {
        'key': 'birth',
        'label': 'Birth Registration',
        'doctype': 'Birth Registration',
        'display_field': 'first_name',
        'icon': 'smile',
        'color': 'green',
        'has_village': True,
        'has_health_worker': True,
    },
    {
        'key': 'pnc',
        'label': 'PNC Followup',
        'doctype': 'PNC',
        'display_field': 'first_name',
        'icon': 'clock',
        'color': 'orange',
        'has_village': True,
        'has_health_worker': True,
    },
    {
        'key': 'anc',
        'label': 'ANC Follow-up',
        'doctype': 'ANC Follow-up',
        'display_field': 'first_name',
        'icon': 'calendar',
        'color': 'blue',
        'has_village': True,
        'has_health_worker': True,
    },
    {
        'key': 'palliative_initial',
        'label': 'Palliative Care Initial Assessment',
        'doctype': 'Palliative Care Initial Assessment Form',
        'display_field': 'name1',
        'icon': 'heart',
        'color': 'red',
        'has_village': False,
        'has_health_worker': False,
    },
    {
        'key': 'palliative_followup',
        'label': 'Palliative Care followup',
        'doctype': 'Palliative care followup',
        'display_field': 'name1',
        'icon': 'activity',
        'color': 'red',
        'has_village': False,
        'has_health_worker': False,
    },
]


def _dashboard_card_by_key(key):
    for card in CHW_DASHBOARD_CARDS:
        if card['key'] == key:
            return card
    return None


def _dashboard_date_bounds(date_range):
    """Return (from_date, to_date) for a chw-dashboard date_range preset, or
    (None, None) for 'all' / anything unrecognised."""
    today = getdate(frappe.utils.nowdate())
    if date_range == 'today':
        return today, today
    if date_range == 'week':
        return get_week_bounds(today)
    if date_range == 'month':
        return today.replace(day=1), today
    return None, None


def _dashboard_filters(card, village, health_worker, date_range):
    filters = {}
    from_date, to_date = _dashboard_date_bounds(date_range)
    if from_date and to_date:
        # Full end-of-day bound - `creation` is a Datetime field, so an
        # end date alone would clip out everything after its midnight.
        filters['creation'] = ['between', [f'{from_date} 00:00:00', f'{to_date} 23:59:59']]
    if card['has_village']:
        filters = apply_village_filter(filters, village)
    if card['has_health_worker'] and health_worker and health_worker != 'All Health Workers':
        filters['health_worker_name'] = health_worker
    return filters


@frappe.whitelist()
def get_health_workers():
    """Return all Health Worker names for the chw-dashboard's Health Worker filter."""
    if not is_privileged_user():
        frappe.throw(_('Not permitted'), frappe.PermissionError)
    return frappe.get_all('Health Worker', pluck='name', order_by='name asc')


@frappe.whitelist()
def get_chw_dashboard_cards(village=None, health_worker=None, date_range=None):
    """Program-wide record counts for the chw-dashboard page, one per
    CHW_DASHBOARD_CARDS entry, filtered by village/health worker/date range
    wherever the underlying doctype supports that field."""
    if not is_privileged_user():
        frappe.throw(_('Not permitted'), frappe.PermissionError)

    cards = []
    for card in CHW_DASHBOARD_CARDS:
        filters = _dashboard_filters(card, village, health_worker, date_range)
        try:
            count = frappe.db.count(card['doctype'], filters)
        except Exception:
            frappe.log_error(f"Error counting {card['doctype']} for chw-dashboard")
            count = 0
        cards.append({
            'key': card['key'],
            'label': card['label'],
            'doctype': card['doctype'],
            'icon': card['icon'],
            'color': card['color'],
            'count': count,
            'has_village': card['has_village'],
            'has_health_worker': card['has_health_worker'],
        })
    return cards


@frappe.whitelist()
def chw_dashboard_drilldown(card_key, village=None, health_worker=None, date_range=None):
    """Underlying records for one chw-dashboard card, most recent first."""
    if not is_privileged_user():
        frappe.throw(_('Not permitted'), frappe.PermissionError)

    card = _dashboard_card_by_key(card_key)
    if not card:
        return {'records': []}

    filters = _dashboard_filters(card, village, health_worker, date_range)
    fields = ['name', f"{card['display_field']} as patient", 'creation']
    if card['has_village']:
        fields.append('village')

    records = frappe.get_list(
        card['doctype'],
        filters=filters,
        fields=fields,
        order_by='creation desc',
        limit_page_length=100,
    )
    return {'records': records}


@frappe.whitelist()
def chw_dashboard_drilldown_excel(card_key, village=None, health_worker=None, date_range=None):
    """Same records as chw_dashboard_drilldown, as a downloadable Excel file."""
    from frappe.utils.xlsxutils import make_xlsx

    data = chw_dashboard_drilldown(card_key, village, health_worker, date_range)
    records = data.get('records', [])

    columns = ["Name", "Patient", "Village", "Date"]
    rows = [columns]
    for r in records:
        rows.append([
            r.get('name', ''),
            r.get('patient', ''),
            r.get('village', ''),
            str(r.get('creation', '') or '')
        ])

    xlsx_file = make_xlsx(rows, "CHW Dashboard")

    frappe.response['filename'] = f"{card_key}.xlsx"
    frappe.response['filecontent'] = xlsx_file.getvalue()
    frappe.response['type'] = 'binary'


# ---- chw-work-order-list (new, separate page - does not read from or
# modify WORKLIST_PROGRAMS / chw_worklist_summary above, which belong to
# chw-visit-dashboard's own "My Worklist" section) ----
# The 5 programs actually used day to day: ANC, PNC, Palliative Care,
# Postpartum (1-6 weeks), Child (6 wk-1 year). NCD, Child Growth Monitoring
# and Mental Health are intentionally excluded - present in the app but not
# part of this program. Palliative Care followup has no "next visit" date
# field on the doctype, so it's marked has_date=False and simply never
# queried for a due date, rather than queried and having the missing-field
# error caught and swallowed.

CHW_WORK_ORDER_TYPES = [
    {
        'key': 'anc',
        'label': 'ANC',
        'doctype': 'ANC Follow-up',
        'date_field': 'next_anc_visit_date',
        # From-date, High Risk and Alert-date aren't stored fields for ANC -
        # they're computed live, on read, straight from LMP + the Master +
        # the followup rows (see _enrich_anc_records_live). live_risk_enrich
        # marks this type for that treatment; every other type still reads
        # plain stored fields (None below, same as before).
        'from_date_field': None,
        'high_risk_field': None,
        'alert_field': None,
        'live_risk_enrich': True,
        'patient_field': 'first_name',
        'patient_fallback_field': 'pregnant_id',
        'has_date': True,
        'has_village': True,
        'has_health_worker': True,
        'followup_doctype': 'ANC Followup Child',
        'followup_table_field': 'anc_followup',
        'followup_date_field': 'date',
    },
    {
        'key': 'pnc',
        'label': 'PNC',
        'doctype': 'PNC',
        'date_field': 'next_pnc_visit_date',
        # high_risk is NOT read as a stored field here - PNC.high_risk is a
        # sticky flag (drives the on-form Risk Alert / window policy, never
        # downgrades) but the Work Order List's High Risk view needs to
        # reflect the CURRENT followup state, so it's computed live instead
        # (see LIVE_HIGH_RISK_RESOLVERS / _pnc_currently_risk_names).
        # pnc_visit_risk_alert stays a real stored field, computed alongside
        # next_pnc_visit_date every save. from_date_field stays None - PNC
        # doesn't store its window's start date anywhere, only the end
        # (next_pnc_visit_date); from_date is computed live too (see
        # _enrich_pnc_records_live).
        'from_date_field': None,
        'high_risk_field': None,
        'alert_field': 'pnc_visit_risk_alert',
        'live_risk_enrich': True,
        'patient_field': 'first_name',
        'patient_fallback_field': None,
        'has_date': True,
        'has_village': True,
        'has_health_worker': True,
        'followup_doctype': 'PNC Followup Child',
        'followup_table_field': 'mother',
        'followup_date_field': 'date',
    },
    {
        'key': 'preconception',
        'label': 'Preconception',
        'doctype': 'Preconception Reg and Followup',
        'date_field': 'next_visit_date',
        # Fully manual, no risk/window calculation at all - next_visit_date
        # is just whichever followup row's own "Date of Next Visit" the CHW
        # most recently typed in (see PreconceptionRegandFollowup's own
        # set_next_visit_date), same as this type already works in the
        # older Visit Dashboard. No high_risk/alert/from_date concept here.
        'from_date_field': None,
        'high_risk_field': None,
        'alert_field': None,
        'patient_field': 'patient_name',
        'patient_fallback_field': None,
        'has_date': True,
        'has_village': True,
        'has_health_worker': True,
        'followup_doctype': 'Preconception Followup',
        'followup_table_field': 'followup_visits',
        'followup_date_field': 'date_of_visit',
    },
    {
        'key': 'palliative',
        'label': 'Palliative Care',
        'doctype': 'Palliative care followup',
        'date_field': None,
        'from_date_field': None,
        'high_risk_field': None,
        'alert_field': None,
        'patient_field': 'name1',
        'patient_fallback_field': None,
        'has_date': False,
        'has_village': False,
        'has_health_worker': False,
        'followup_doctype': None,
        'followup_table_field': None,
        'followup_date_field': None,
    },
    {
        'key': 'postpartum',
        'label': 'Postpartum (1-6 weeks)',
        'doctype': 'Postpartum Reg and Followup',
        'date_field': 'next_visit_date',
        # No stored high_risk field - live-computed from the most recently
        # completed followup row's Mother's/Baby's Condition, same
        # non-sticky rule ANC/PNC now use (see LIVE_HIGH_RISK_RESOLVERS /
        # _postpartum_currently_risk_names). from_date is live too, from
        # the same schedule lookup the form itself runs (see
        # _enrich_postpartum_records_live). alert_date stays a real stored
        # field, computed alongside next_visit_date every save.
        'from_date_field': None,
        'high_risk_field': None,
        'alert_field': 'postpartum_risk_alert',
        'live_risk_enrich': True,
        'patient_field': 'patient_name',
        'patient_fallback_field': None,
        'has_date': True,
        'has_village': True,
        'has_health_worker': True,
        'followup_doctype': 'Postpartum Followup',
        'followup_table_field': 'followup_visits',
        'followup_date_field': 'date_of_visit',
    },
    {
        'key': 'child_6w_1y',
        'label': 'Child (6 wk-1 year)',
        'doctype': 'Child 6w to 1 Year Reg and Followup',
        'date_field': 'next_visit_date',
        # No stored high_risk field - live-computed from the most recently
        # completed followup row's Baby Condition, same non-sticky rule
        # ANC/PNC/Postpartum use (see LIVE_HIGH_RISK_RESOLVERS /
        # _child_6w_1y_currently_risk_names). from_date is live too, from
        # the same repeating-window lookup the form itself runs (see
        # _enrich_child_6w_1y_records_live). alert_date stays a real stored
        # field, computed alongside next_visit_date every save.
        'from_date_field': None,
        'high_risk_field': None,
        'alert_field': 'child_risk_alert',
        'live_risk_enrich': True,
        'patient_field': 'patient_name',
        'patient_fallback_field': None,
        'has_date': True,
        'has_village': True,
        'has_health_worker': True,
        'followup_doctype': 'Child 6w to 1 Year Followup',
        'followup_table_field': 'followup_visits',
        'followup_date_field': 'date_of_visit',
    },
]


def _work_order_scope(village, health_worker):
    """Privileged users get whatever village/health_worker they passed (or
    none, for everyone). Non-privileged callers are always forced to their
    own linked Health Worker, regardless of what they pass, and never see
    another worker's records."""
    if is_privileged_user():
        return village, health_worker
    return village, get_current_health_worker()


def _work_order_base_filters(wtype, village, health_worker):
    filters = []
    if wtype['has_village'] and village and village != 'All Villages':
        filters.append(['village', '=', village])
    if wtype['has_health_worker'] and health_worker and health_worker != 'All Health Workers':
        filters.append(['health_worker_name', '=', health_worker])
    return filters


def _work_order_patient_name(rec, wtype):
    name = rec.get(wtype['patient_field'])
    if not name and wtype['patient_fallback_field']:
        name = rec.get(wtype['patient_fallback_field'])
    return name or rec.get('name')


def _work_order_matching_parent_names(wtype, village, health_worker):
    """Names of this type's parent records matching village/health_worker, or
    None if there's no filter active at all (meaning "don't restrict by
    parent" - the caller then skips the parent join entirely)."""
    base = _work_order_base_filters(wtype, village, health_worker)
    if not base:
        return None
    return frappe.get_all(wtype['doctype'], filters=base, pluck='name')


def _anc_currently_risk_names(anc_names):
    """ANC Follow-up names whose most recently COMPLETED followup row -
    across all three tables (Volunteer/Nurse/Doctor combined, whichever
    the org actually uses) - has Patient Condition = Risk. This is what
    "currently High Risk" means for the Work Order List: always the latest
    visit, never a stored flag that can go stale once that visit's risk is
    later resolved. Separate from Pregnancy Registration's own High Risk
    field, which stays a one-time registration record and drives the
    window/quota policy and on-form Risk Alert, not this."""
    if not anc_names:
        return []
    from chw.common.doctype.anc_follow_up.anc_follow_up import FOLLOWUP_TABLE_FIELDS

    table_field_to_doctype = {
        'anc_followup': 'ANC Followup Child',
        'anc_followup_for_nurse': 'ANC Followup Nurse',
        'anc_followup_for_docter': 'ANC Followup Docter',
    }
    entries_by_parent = {}
    for table_field in FOLLOWUP_TABLE_FIELDS:
        rows = frappe.get_all(
            table_field_to_doctype[table_field],
            filters=[['parent', 'in', anc_names], ['status', '=', 'Completed']],
            fields=['parent', 'date', 'patient_condition'],
        )
        for row in rows:
            entries_by_parent.setdefault(row.parent, []).append((row.date, row.patient_condition))

    return [
        name for name, entries in entries_by_parent.items()
        if max(entries, key=lambda e: getdate(e[0]))[1] == 'Risk'
    ]


def _pnc_currently_risk_names(pnc_names):
    """PNC names whose most recently COMPLETED followup row - the Mother's
    own Patient Condition or the Baby's own Baby Condition, whichever is
    more recent - is Risk. Same "always the latest visit" rule as ANC."""
    if not pnc_names:
        return []
    mother_rows = frappe.get_all(
        'PNC Followup Child',
        filters=[['parent', 'in', pnc_names], ['status', '=', 'Completed']],
        fields=['parent', 'date', 'patient_condition'],
    )
    baby_rows = frappe.get_all(
        'Baby PNC Followup Child',
        filters=[['parent', 'in', pnc_names], ['status', '=', 'Completed']],
        fields=['parent', 'date', 'baby_condition'],
    )
    entries_by_parent = {}
    for row in mother_rows:
        entries_by_parent.setdefault(row.parent, []).append((row.date, row.patient_condition))
    for row in baby_rows:
        entries_by_parent.setdefault(row.parent, []).append((row.date, row.baby_condition))

    return [
        name for name, entries in entries_by_parent.items()
        if max(entries, key=lambda e: getdate(e[0]))[1] == 'Risk'
    ]


def _postpartum_currently_risk_names(names):
    """Postpartum Reg and Followup names whose most recently COMPLETED
    followup row - Mother's Condition or Baby's Condition, either one -
    is Risk. Same "always the latest visit" rule as ANC/PNC. Only one
    followup table here (mother and baby share a row), so no cross-table
    merge is needed."""
    if not names:
        return []
    rows = frappe.get_all(
        'Postpartum Followup',
        filters=[['parent', 'in', names], ['status', '=', 'Completed']],
        fields=['parent', 'date_of_visit', 'mother_condition', 'baby_condition'],
    )
    entries_by_parent = {}
    for row in rows:
        is_risk = row.mother_condition == 'Risk' or row.baby_condition == 'Risk'
        entries_by_parent.setdefault(row.parent, []).append((row.date_of_visit, is_risk))

    return [
        name for name, entries in entries_by_parent.items()
        if max(entries, key=lambda e: getdate(e[0]))[1]
    ]


def _child_6w_1y_currently_risk_names(names):
    """Child 6w to 1 Year Reg and Followup names whose most recently
    COMPLETED followup row's Baby Condition is Risk. Same "always the
    latest visit" rule as everywhere else."""
    if not names:
        return []
    rows = frappe.get_all(
        'Child 6w to 1 Year Followup',
        filters=[['parent', 'in', names], ['status', '=', 'Completed']],
        fields=['parent', 'date_of_visit', 'baby_condition'],
    )
    entries_by_parent = {}
    for row in rows:
        entries_by_parent.setdefault(row.parent, []).append((row.date_of_visit, row.baby_condition == 'Risk'))

    return [
        name for name, entries in entries_by_parent.items()
        if max(entries, key=lambda e: getdate(e[0]))[1]
    ]


# Keyed by CHW_WORK_ORDER_TYPES entry 'key' - each resolver takes a list of
# that type's record names and returns the subset currently High Risk, live,
# from their own followup rows. Types without a resolver here (and without a
# plain high_risk_field) simply never contribute to the High Risk view.
LIVE_HIGH_RISK_RESOLVERS = {
    'anc': _anc_currently_risk_names,
    'pnc': _pnc_currently_risk_names,
    'postpartum': _postpartum_currently_risk_names,
    'child_6w_1y': _child_6w_1y_currently_risk_names,
}


def _pnc_track_from_date(rows, delivery_date):
    """Mirrors PNC._compute_track's from-date half exactly - an open Urgent
    row on this table wins first, otherwise the normal schedule lookup for
    however many visits are completed. Returns (window_start, next_date) or
    (None, None) if this table has nothing due."""
    from chw.common.doctype.pnc.pnc import PNC

    urgent_rows = [(i, row) for i, row in enumerate(rows) if row.urgent_followup and row.status != 'Completed']
    if urgent_rows:
        i, earliest = min(urgent_rows, key=lambda pair: getdate(pair[1].date))
        trigger_row = rows[i - 1] if i > 0 else None
        trigger_date = getdate(trigger_row.date) if trigger_row else getdate(earliest.date)
        return trigger_date, getdate(earliest.date)

    completed_count = len([row for row in rows if row.status == 'Completed'])
    window = PNC.get_visit_window(completed_count + 1)
    if not window:
        return None, None
    window_start = add_days(getdate(delivery_date), window.start_offset)
    window_end = add_days(getdate(delivery_date), window.end_offset)
    return window_start, window_end


def _enrich_pnc_records_live(records):
    """From-date AND High-Risk for PNC records, computed live from the PNC
    Visit Interval Master's Visit Schedule + the record's own Mother and
    Baby child rows - mirroring PNC._compute_track/set_next_pnc_visit_date
    exactly (mother and baby tracked independently, whichever is due sooner
    wins), instead of the list view's generic due_date-minus-30 fallback.
    High Risk here reflects the most recently COMPLETED row's condition
    (Mother's Patient Condition or Baby's Baby Condition, whichever is
    later) - not PNC.high_risk, which is a sticky flag that never
    downgrades and drives the on-form Risk Alert instead, a separate
    concern. alert_date stays read from the real stored pnc_visit_risk_alert
    field elsewhere - unaffected by this. Mutates and returns the same
    list; non-PNC records pass through untouched."""
    pnc_records = [r for r in records if r.get('doctype') == 'PNC']
    if not pnc_records:
        return records

    pnc_names = [r['name'] for r in pnc_records]
    deliveries = frappe.get_all(
        'PNC', filters=[['name', 'in', pnc_names]], fields=['name', 'date_of_delivery']
    )
    delivery_by_name = {d.name: d.date_of_delivery for d in deliveries}

    mother_rows = frappe.get_all(
        'PNC Followup Child',
        filters=[['parent', 'in', pnc_names]],
        fields=['parent', 'status', 'urgent_followup', 'date', 'idx', 'patient_condition'],
        order_by='parent asc, idx asc',
    ) if pnc_names else []
    mother_by_parent = {}
    for row in mother_rows:
        mother_by_parent.setdefault(row.parent, []).append(row)

    baby_rows = frappe.get_all(
        'Baby PNC Followup Child',
        filters=[['parent', 'in', pnc_names]],
        fields=['parent', 'status', 'urgent_followup', 'date', 'idx', 'baby_condition'],
        order_by='parent asc, idx asc',
    ) if pnc_names else []
    baby_by_parent = {}
    for row in baby_rows:
        baby_by_parent.setdefault(row.parent, []).append(row)

    for r in pnc_records:
        completed_entries = [
            (row.date, row.patient_condition) for row in mother_by_parent.get(r['name'], [])
            if row.status == 'Completed'
        ] + [
            (row.date, row.baby_condition) for row in baby_by_parent.get(r['name'], [])
            if row.status == 'Completed'
        ]
        if completed_entries:
            _, latest_condition = max(completed_entries, key=lambda e: getdate(e[0]))
            r['high_risk'] = 'Yes' if latest_condition == 'Risk' else 'No'
        else:
            r['high_risk'] = 'No'

        delivery_date = delivery_by_name.get(r['name'])
        if not delivery_date:
            r['from_date'] = None
            continue

        mother_start, mother_end = _pnc_track_from_date(mother_by_parent.get(r['name'], []), delivery_date)
        baby_start, baby_end = _pnc_track_from_date(baby_by_parent.get(r['name'], []), delivery_date)

        candidates = [(mother_start, mother_end), (baby_start, baby_end)]
        candidates = [c for c in candidates if c[1]]
        if not candidates:
            r['from_date'] = None
            continue

        winner_start, _ = min(candidates, key=lambda pair: pair[1])
        r['from_date'] = str(winner_start)

    return records


def _enrich_anc_records_live(records):
    """From-date / Alert-date / High-Risk for ANC records, computed live from
    LMP date + the ANC Visit Interval Master + the followup rows across all
    three follow-up tables (Volunteer, Nurse, Doctor - some orgs only use
    one or two of them) - reusing the exact same calculation the ANC
    Follow-up form itself runs
    (chw.common.doctype.anc_follow_up.anc_follow_up.ANCFollowup), instead of
    reading fields that were pre-calculated and stored on save. Batches its
    reads into a fixed number of queries regardless of how many records are
    passed in, rather than querying per patient. Mutates and returns the
    same list; non-ANC records pass through untouched."""
    anc_records = [r for r in records if r.get('doctype') == 'ANC Follow-up']
    if not anc_records:
        return records

    from chw.common.doctype.anc_follow_up.anc_follow_up import ANCFollowup, FOLLOWUP_TABLE_FIELDS

    pregnant_ids = list({r.get('pregnant_id') for r in anc_records if r.get('pregnant_id')})
    pregnancies = frappe.get_all(
        'Pregnancy Registration',
        filters=[['name', 'in', pregnant_ids]],
        fields=['name', 'lmp_date', 'high_risk'],
    ) if pregnant_ids else []
    pregnancy_by_id = {p.name: p for p in pregnancies}

    anc_names = [r['name'] for r in anc_records]
    # (child doctype, table fieldname) - mirrors ANCFollowup.FOLLOWUP_TABLE_FIELDS.
    table_field_to_doctype = {
        'anc_followup': 'ANC Followup Child',
        'anc_followup_for_nurse': 'ANC Followup Nurse',
        'anc_followup_for_docter': 'ANC Followup Docter',
    }
    rows_by_parent = {}
    for table_field in FOLLOWUP_TABLE_FIELDS:
        followup_rows = frappe.get_all(
            table_field_to_doctype[table_field],
            filters=[['parent', 'in', anc_names]],
            fields=['parent', 'status', 'urgent_followup', 'date', 'idx', 'patient_condition'],
            order_by='parent asc, idx asc',
        ) if anc_names else []
        for row in followup_rows:
            rows_by_parent.setdefault(row.parent, {}).setdefault(table_field, []).append(row)

    for r in anc_records:
        pregnancy = pregnancy_by_id.get(r.get('pregnant_id'))
        if not pregnancy or not pregnancy.lmp_date:
            r['from_date'] = None
            r['alert_date'] = None
            r['high_risk'] = None
            continue

        # high_risk (from Pregnancy Registration, sticky) still drives the
        # window/quota policy and the on-form Risk Alert below - unchanged.
        # The badge shown in the Work Order List is a separate, live signal:
        # the most recently COMPLETED followup row's own condition, across
        # every table in use - never a stored flag that can go stale once
        # that visit's risk is resolved.
        high_risk = pregnancy.high_risk or 'No'
        completed_rows = [
            row for table_field in FOLLOWUP_TABLE_FIELDS
            for row in rows_by_parent.get(r['name'], {}).get(table_field, [])
            if row.status == 'Completed'
        ]
        if completed_rows:
            latest_completed = max(completed_rows, key=lambda row: getdate(row.date))
            r['high_risk'] = 'Yes' if latest_completed.patient_condition == 'Risk' else 'No'
        else:
            r['high_risk'] = 'No'
        tables = rows_by_parent.get(r['name'], {})

        # An open Urgent row always wins first, exactly like the form -
        # checked across every follow-up table, whichever is earliest wins.
        urgent_candidates = []
        for table_field in FOLLOWUP_TABLE_FIELDS:
            rows = tables.get(table_field, [])
            urgent_rows = [(i, row) for i, row in enumerate(rows) if row.urgent_followup and row.status != 'Completed']
            if urgent_rows:
                i, earliest = min(urgent_rows, key=lambda pair: getdate(pair[1].date))
                trigger_row = rows[i - 1] if i > 0 else None
                trigger_date = getdate(trigger_row.date) if trigger_row else getdate(earliest.date)
                urgent_candidates.append((trigger_date, getdate(earliest.date)))
        if urgent_candidates:
            winner_trigger_date, _ = min(urgent_candidates, key=lambda pair: pair[1])
            r['from_date'] = str(winner_trigger_date)
            r['alert_date'] = None
            continue

        window_days, visits_per_window, alert_within_days, _ = ANCFollowup.get_window_policy(high_risk)
        completed_count = sum(
            len([row for row in tables.get(table_field, []) if row.status == 'Completed'])
            for table_field in FOLLOWUP_TABLE_FIELDS
        )
        starting_window = ANCFollowup.get_window_index(r.get('creation') or getdate(), pregnancy.lmp_date, window_days)
        current_window = ANCFollowup.get_current_window(starting_window, completed_count, visits_per_window)
        window_start = add_days(getdate(pregnancy.lmp_date), (current_window - 1) * window_days)
        r['from_date'] = str(window_start)
        r['alert_date'] = str(add_days(window_start, alert_within_days)) if high_risk == 'Yes' else None

    return records


def _enrich_postpartum_records_live(records):
    """From-date AND High-Risk for Postpartum records, computed live from
    the Postpartum Visit Interval Master's Visit Schedule + the record's
    own followup rows - mirroring PostpartumRegandFollowup's own
    set_next_visit_date/currently_high_risk exactly (an open Urgent row
    wins first for from_date, otherwise the normal schedule lookup; High
    Risk reflects the most recently COMPLETED row's Mother's/Baby's
    Condition, not a stored flag). alert_date stays read from the real
    stored postpartum_risk_alert field elsewhere - unaffected by this.
    Mutates and returns the same list; non-Postpartum records pass
    through untouched."""
    postpartum_records = [r for r in records if r.get('doctype') == 'Postpartum Reg and Followup']
    if not postpartum_records:
        return records

    from chw.common.doctype.postpartum_reg_and_followup.postpartum_reg_and_followup import PostpartumRegandFollowup

    names = [r['name'] for r in postpartum_records]
    deliveries = frappe.get_all(
        'Postpartum Reg and Followup', filters=[['name', 'in', names]], fields=['name', 'delivery_date']
    )
    delivery_by_name = {d.name: d.delivery_date for d in deliveries}

    followup_rows = frappe.get_all(
        'Postpartum Followup',
        filters=[['parent', 'in', names]],
        fields=['parent', 'status', 'urgent_followup', 'date_of_visit', 'idx', 'mother_condition', 'baby_condition'],
        order_by='parent asc, idx asc',
    ) if names else []
    rows_by_parent = {}
    for row in followup_rows:
        rows_by_parent.setdefault(row.parent, []).append(row)

    for r in postpartum_records:
        rows = rows_by_parent.get(r['name'], [])
        completed_rows = [row for row in rows if row.status == 'Completed']
        if completed_rows:
            latest_completed = max(completed_rows, key=lambda row: getdate(row.date_of_visit))
            is_risk = latest_completed.mother_condition == 'Risk' or latest_completed.baby_condition == 'Risk'
            r['high_risk'] = 'Yes' if is_risk else 'No'
        else:
            r['high_risk'] = 'No'

        delivery_date = delivery_by_name.get(r['name'])
        if not delivery_date:
            r['from_date'] = None
            continue

        # An open Urgent row always wins first, exactly like the form.
        urgent_rows = [(i, row) for i, row in enumerate(rows) if row.urgent_followup and row.status != 'Completed']
        if urgent_rows:
            i, earliest = min(urgent_rows, key=lambda pair: getdate(pair[1].date_of_visit))
            trigger_row = rows[i - 1] if i > 0 else None
            trigger_date = getdate(trigger_row.date_of_visit) if trigger_row else getdate(earliest.date_of_visit)
            r['from_date'] = str(trigger_date)
            continue

        completed_count = len([row for row in rows if row.status == 'Completed'])
        window = PostpartumRegandFollowup.get_visit_window(completed_count + 1)
        r['from_date'] = str(add_days(getdate(delivery_date), window.start_offset)) if window else None

    return records


def _enrich_child_6w_1y_records_live(records):
    """From-date AND High-Risk for Child 6w-1y records, computed live from
    the Child 6w-1y Visit Interval Master's repeating-window policy + the
    record's own followup rows - mirroring
    Child6wto1YearRegandFollowup.set_next_visit_date/currently_high_risk
    exactly (an open Urgent row wins first, otherwise the current
    repeating-window lookup anchored on Date of Visit; High Risk reflects
    the most recently COMPLETED row's Baby Condition, not a stored flag).
    alert_date stays read from the real stored child_risk_alert field
    elsewhere - unaffected by this. Mutates and returns the same list;
    non-Child-6w-1y records pass through untouched."""
    child_records = [r for r in records if r.get('doctype') == 'Child 6w to 1 Year Reg and Followup']
    if not child_records:
        return records

    from chw.common.doctype.child_6w_to_1_year_reg_and_followup.child_6w_to_1_year_reg_and_followup import (
        Child6wto1YearRegandFollowup,
    )

    names = [r['name'] for r in child_records]
    regs = frappe.get_all(
        'Child 6w to 1 Year Reg and Followup', filters=[['name', 'in', names]], fields=['name', 'date_of_visit', 'creation']
    )
    reg_by_name = {d.name: d for d in regs}

    followup_rows = frappe.get_all(
        'Child 6w to 1 Year Followup',
        filters=[['parent', 'in', names]],
        fields=['parent', 'status', 'urgent_followup', 'date_of_visit', 'idx', 'baby_condition'],
        order_by='parent asc, idx asc',
    ) if names else []
    rows_by_parent = {}
    for row in followup_rows:
        rows_by_parent.setdefault(row.parent, []).append(row)

    policy = Child6wto1YearRegandFollowup.get_window_policy()

    for r in child_records:
        rows = rows_by_parent.get(r['name'], [])
        completed_rows = [row for row in rows if row.status == 'Completed']
        if completed_rows:
            latest_completed = max(completed_rows, key=lambda row: getdate(row.date_of_visit))
            r['high_risk'] = 'Yes' if latest_completed.baby_condition == 'Risk' else 'No'
        else:
            r['high_risk'] = 'No'

        reg = reg_by_name.get(r['name'])
        anchor_date = reg and reg.date_of_visit
        if not anchor_date:
            r['from_date'] = None
            continue

        # An open Urgent row always wins first, exactly like the form.
        urgent_rows = [(i, row) for i, row in enumerate(rows) if row.urgent_followup and row.status != 'Completed']
        if urgent_rows:
            i, earliest = min(urgent_rows, key=lambda pair: getdate(pair[1].date_of_visit))
            trigger_row = rows[i - 1] if i > 0 else None
            trigger_date = getdate(trigger_row.date_of_visit) if trigger_row else getdate(earliest.date_of_visit)
            r['from_date'] = str(trigger_date)
            continue

        completed_count = len(completed_rows)
        starting_window = Child6wto1YearRegandFollowup.get_window_index(
            reg.creation or getdate(), anchor_date, policy.interval_days
        )
        current_window = Child6wto1YearRegandFollowup.get_current_window(
            starting_window, completed_count, policy.visits_per_window
        )
        if current_window > policy.automatic_window_count:
            r['from_date'] = None
            continue
        window_start = add_days(getdate(anchor_date), (current_window - 1) * policy.interval_days)
        r['from_date'] = str(window_start)

    return records


def _work_order_completed_count(wtype, village, health_worker, from_date, to_date):
    """How many followup visits (child-table rows, across all this type's
    parent records) were actually logged in [from_date, to_date] - i.e. work
    the CHW has already done, not what's still due. Palliative Care has no
    followup table wired up for this (has_date=False), so it's never called
    for that type."""
    if not wtype['followup_doctype']:
        return 0

    parent_names = _work_order_matching_parent_names(wtype, village, health_worker)
    if parent_names is not None and not parent_names:
        return 0

    filters = [[wtype['followup_date_field'], 'between', [from_date, to_date]]]
    if parent_names is not None:
        filters.append(['parent', 'in', parent_names])

    try:
        return frappe.db.count(wtype['followup_doctype'], filters)
    except Exception:
        frappe.log_error(f"Error counting completed {wtype['followup_doctype']} for chw-work-order-list")
        return 0


def _work_order_high_risk_records(wtype, village, health_worker):
    """Every currently High Risk patient of this type, regardless of when her
    next visit is due - types with neither high_risk_field nor
    live_risk_enrich (most of them, today only ANC has either) never
    contribute any rows here."""
    if not wtype['high_risk_field'] and not wtype.get('live_risk_enrich'):
        return []

    base = _work_order_base_filters(wtype, village, health_worker)
    fields = ['name', wtype['patient_field']]
    if wtype['patient_fallback_field']:
        fields.append(wtype['patient_fallback_field'])
    if wtype['has_village']:
        fields.append('village')
    if wtype['has_date']:
        fields.append(wtype['date_field'])
    if wtype['from_date_field']:
        fields.append(wtype['from_date_field'])
    if wtype['high_risk_field']:
        fields.append(wtype['high_risk_field'])
    if wtype['alert_field']:
        fields.append(wtype['alert_field'])

    if wtype.get('live_risk_enrich'):
        fields.append('creation')
        # No stored high_risk field to filter by directly - fetch every
        # matching-base record first, then narrow to whichever ones are
        # currently Risk per their own latest completed followup row.
        resolver = LIVE_HIGH_RISK_RESOLVERS.get(wtype['key'])
        all_names = frappe.get_all(wtype['doctype'], filters=base, pluck='name')
        if not all_names or not resolver:
            return []
        risk_names = resolver(all_names)
        if not risk_names:
            return []
        risk_filter = [['name', 'in', risk_names]]
    else:
        risk_filter = [[wtype['high_risk_field'], '=', 'Yes']]

    try:
        rows = frappe.get_list(
            wtype['doctype'],
            filters=base + risk_filter,
            fields=fields,
            limit_page_length=200,
        )
    except Exception:
        frappe.log_error(f"Error fetching high risk {wtype['doctype']} for chw-work-order-list")
        return []

    records = []
    for r in rows:
        records.append({
            'doctype': wtype['doctype'],
            'name': r.name,
            'pregnant_id': r.get('pregnant_id'),
            'creation': r.get('creation'),
            'visit_type': wtype['label'],
            'patient': _work_order_patient_name(r, wtype),
            'village': r.get('village') if wtype['has_village'] else None,
            'due_date': str(r.get(wtype['date_field']) or '') if wtype['has_date'] else '',
            'from_date': str(r.get(wtype['from_date_field']) or '') if wtype['from_date_field'] else None,
            'high_risk': r.get(wtype['high_risk_field']) if wtype['high_risk_field'] else None,
            'alert_date': str(r.get(wtype['alert_field']) or '') if wtype['alert_field'] else None,
            'status': 'High Risk',
        })

    if wtype.get('live_risk_enrich'):
        records = _enrich_anc_records_live(records)
    if wtype['key'] == 'pnc':
        records = _enrich_pnc_records_live(records)
    if wtype['key'] == 'postpartum':
        records = _enrich_postpartum_records_live(records)
    if wtype['key'] == 'child_6w_1y':
        records = _enrich_child_6w_1y_records_live(records)
    return records


def _work_order_completed_records(wtype, village, health_worker, from_date, to_date):
    if not wtype['followup_doctype']:
        return []

    parent_names = _work_order_matching_parent_names(wtype, village, health_worker)
    if parent_names is not None and not parent_names:
        return []

    filters = [[wtype['followup_date_field'], 'between', [from_date, to_date]]]
    if parent_names is not None:
        filters.append(['parent', 'in', parent_names])

    try:
        rows = frappe.get_all(
            wtype['followup_doctype'],
            filters=filters,
            fields=['parent', wtype['followup_date_field']],
            limit_page_length=200,
        )
    except Exception:
        frappe.log_error(f"Error fetching completed {wtype['followup_doctype']} for chw-work-order-list")
        return []
    if not rows:
        return []

    parents = frappe.get_all(
        wtype['doctype'],
        filters=[['name', 'in', list({r.parent for r in rows})]],
        fields=['name', wtype['patient_field']] + (
            [wtype['patient_fallback_field']] if wtype['patient_fallback_field'] else []
        ) + (['village'] if wtype['has_village'] else []) + (
            [wtype['high_risk_field']] if wtype['high_risk_field'] else []
        ),
    )
    parents_by_name = {p.name: p for p in parents}

    # A completed visit has no window to show (no from_date/alert_date), but
    # High Risk is still live-looked-up so the badge stays correct here too -
    # same "latest completed row's condition" rule as everywhere else.
    live_risk_names = set()
    if wtype.get('live_risk_enrich'):
        resolver = LIVE_HIGH_RISK_RESOLVERS.get(wtype['key'])
        if resolver:
            live_risk_names = set(resolver(list(parents_by_name.keys())))

    records = []
    for r in rows:
        parent = parents_by_name.get(r.parent)
        if not parent:
            continue
        high_risk = (
            ('Yes' if parent.name in live_risk_names else 'No')
            if wtype.get('live_risk_enrich')
            else (parent.get(wtype['high_risk_field']) if wtype['high_risk_field'] else None)
        )
        records.append({
            'doctype': wtype['doctype'],
            'name': parent.name,
            'visit_type': wtype['label'],
            'patient': _work_order_patient_name(parent, wtype),
            'village': parent.get('village') if wtype['has_village'] else None,
            'due_date': str(r.get(wtype['followup_date_field']) or ''),
            'from_date': None,
            'high_risk': high_risk,
            'alert_date': None,
            'status': 'Completed',
        })
    return records


@frappe.whitelist()
def get_chw_work_order_summary(village=None, health_worker=None, visit_type=None):
    """This Week / Today (subset of This Week) / Upcoming (this month) /
    Overdue / Completed (followups actually logged this week) counts, plus a
    per-type breakdown, across the 5 CHW_WORK_ORDER_TYPES - always relative
    to the real current date, not a navigable date range."""
    if frappe.session.user == 'Guest':
        frappe.throw(_('Not permitted'), frappe.PermissionError)

    village, health_worker = _work_order_scope(village, health_worker)
    empty = {'health_worker_linked': False, 'this_week': 0, 'today': 0, 'upcoming': 0, 'overdue': 0, 'completed': 0, 'high_risk': 0, 'by_type': []}
    if not is_privileged_user() and not health_worker:
        return empty

    today = getdate(frappe.utils.nowdate())
    week_start, week_end = get_week_bounds(today)
    # Rolling 30 days from today, not "rest of this calendar month" - a visit
    # due just after month-end (e.g. 2 days into next month) is still only a
    # couple of days away and belongs in Upcoming, not stuck in a gap between
    # this month's Upcoming and next week's This Week.
    month_start, month_end = today, add_days(today, 30)
    types = [t for t in CHW_WORK_ORDER_TYPES if not visit_type or visit_type == t['label']]

    by_type = []
    totals = {'this_week': 0, 'today': 0, 'upcoming': 0, 'overdue': 0, 'completed': 0, 'high_risk': 0}

    for wtype in types:
        row = {'key': wtype['key'], 'label': wtype['label'], 'this_week': 0, 'today': 0, 'upcoming': 0, 'overdue': 0, 'completed': 0, 'high_risk': 0}
        base = _work_order_base_filters(wtype, village, health_worker)

        if wtype['has_date']:
            try:
                row['this_week'] = frappe.db.count(wtype['doctype'], base + [[wtype['date_field'], 'between', [week_start, week_end]]])
                row['today'] = frappe.db.count(wtype['doctype'], base + [[wtype['date_field'], '=', today]])
                row['upcoming'] = frappe.db.count(wtype['doctype'], base + [[wtype['date_field'], 'between', [month_start, month_end]]])
                row['overdue'] = frappe.db.count(
                    wtype['doctype'], base + [[wtype['date_field'], 'is', 'set'], [wtype['date_field'], '<', today]]
                )
            except Exception:
                frappe.log_error(f"Error counting {wtype['doctype']} for chw-work-order-list")

        row['completed'] = _work_order_completed_count(wtype, village, health_worker, week_start, week_end)

        # Every currently High Risk patient, regardless of when her next
        # visit is due - a separate view from the date-based buckets above,
        # not a subset of any of them.
        if wtype['high_risk_field']:
            try:
                row['high_risk'] = frappe.db.count(wtype['doctype'], base + [[wtype['high_risk_field'], '=', 'Yes']])
            except Exception:
                frappe.log_error(f"Error counting high risk {wtype['doctype']} for chw-work-order-list")
        elif wtype.get('live_risk_enrich'):
            # No stored high_risk field - count whichever matching records
            # are currently Risk per their own latest completed followup row.
            resolver = LIVE_HIGH_RISK_RESOLVERS.get(wtype['key'])
            if resolver:
                try:
                    all_names = frappe.get_all(wtype['doctype'], filters=base, pluck='name')
                    row['high_risk'] = len(resolver(all_names))
                except Exception:
                    frappe.log_error(f"Error counting high risk {wtype['doctype']} for chw-work-order-list")

        by_type.append(row)
        for k in totals:
            totals[k] += row[k]

    return {'health_worker_linked': True, **totals, 'by_type': by_type}


@frappe.whitelist()
def chw_work_order_drilldown(status='all', village=None, health_worker=None, visit_type=None):
    """Underlying records behind get_chw_work_order_summary's counts.
    status is one of 'this_week', 'today', 'upcoming', 'overdue',
    'completed', 'high_risk', 'all' ('all' excludes 'completed' and
    'high_risk' - both are a different kind of view (already-done work, and
    a risk-status view unrelated to due dates) and would double up with the
    others when mixed into one undifferentiated list)."""
    if frappe.session.user == 'Guest':
        frappe.throw(_('Not permitted'), frappe.PermissionError)

    village, health_worker = _work_order_scope(village, health_worker)
    if not is_privileged_user() and not health_worker:
        return {'records': []}

    today = getdate(frappe.utils.nowdate())
    week_start, week_end = get_week_bounds(today)
    # Rolling 30 days from today - see get_chw_work_order_summary for why.
    month_start, month_end = today, add_days(today, 30)
    types = [t for t in CHW_WORK_ORDER_TYPES if not visit_type or visit_type == t['label']]

    buckets = [
        ('this_week', [['between', [week_start, week_end]]], 'This Week'),
        ('today', [['=', today]], 'Today'),
        ('upcoming', [['between', [month_start, month_end]]], 'Upcoming'),
        ('overdue', [['is', 'set'], ['<', today]], 'Overdue'),
    ]
    # 'all' = everything still pending, with no duplicate rows. This Week
    # already contains Today (a subset) and overlaps Upcoming (a superset of
    # This Week), so 'all' only ever pulls This Week + Overdue - the same
    # two buckets the summary's own 'all' total is built from - rather than
    # looping every bucket and showing the same patient two or three times.
    # A record due earlier this week but still not done satisfies BOTH of
    # those two buckets at once (e.g. due Monday, today is Wednesday) - kept
    # in a dict keyed by (doctype, name) for the 'all' case specifically, so
    # the second match (Overdue, processed after This Week below) overwrites
    # the first rather than appending a second row for the same patient.
    all_bucket_keys = {'this_week', 'overdue'}
    records_by_key = {}
    records = []
    for wtype in types:
        if status == 'completed':
            records.extend(_work_order_completed_records(wtype, village, health_worker, week_start, week_end))
            continue
        if status == 'high_risk':
            records.extend(_work_order_high_risk_records(wtype, village, health_worker))
            continue
        if not wtype['has_date']:
            continue

        base = _work_order_base_filters(wtype, village, health_worker)
        fields = ['name', wtype['patient_field'], wtype['date_field']]
        if wtype['patient_fallback_field']:
            fields.append(wtype['patient_fallback_field'])
        if wtype['has_village']:
            fields.append('village')
        if wtype['from_date_field']:
            fields.append(wtype['from_date_field'])
        if wtype['high_risk_field']:
            fields.append(wtype['high_risk_field'])
        if wtype['alert_field']:
            fields.append(wtype['alert_field'])
        if wtype.get('live_risk_enrich'):
            fields.append('creation')

        try:
            for bucket_key, conditions, status_label in buckets:
                if status == 'all':
                    if bucket_key not in all_bucket_keys:
                        continue
                elif status != bucket_key:
                    continue
                date_conditions = [[wtype['date_field'], op, val] for op, val in conditions]
                rows = frappe.get_list(
                    wtype['doctype'],
                    filters=base + date_conditions,
                    fields=fields,
                    limit_page_length=200,
                )
                for r in rows:
                    entry = {
                        'doctype': wtype['doctype'],
                        'name': r.name,
                        'pregnant_id': r.get('pregnant_id'),
                        'creation': r.get('creation'),
                        'visit_type': wtype['label'],
                        'patient': _work_order_patient_name(r, wtype),
                        'village': r.get('village'),
                        'due_date': str(r.get(wtype['date_field']) or ''),
                        'from_date': str(r.get(wtype['from_date_field']) or '') if wtype['from_date_field'] else None,
                        'high_risk': r.get(wtype['high_risk_field']) if wtype['high_risk_field'] else None,
                        'alert_date': str(r.get(wtype['alert_field']) or '') if wtype['alert_field'] else None,
                        'status': status_label,
                    }
                    if status == 'all':
                        records_by_key[(wtype['doctype'], r.name)] = entry
                    else:
                        records.append(entry)
        except Exception:
            frappe.log_error(f"Error fetching {wtype['doctype']} for chw-work-order-list")
            continue

    if status == 'all':
        records = list(records_by_key.values())

    records = _enrich_anc_records_live(records)
    records = _enrich_pnc_records_live(records)
    records = _enrich_postpartum_records_live(records)
    records = _enrich_child_6w_1y_records_live(records)
    records.sort(key=lambda r: r['due_date'])
    return {'records': records}


@frappe.whitelist()
def chw_work_order_drilldown_excel(status='all', village=None, health_worker=None, visit_type=None):
    """Same records as chw_work_order_drilldown, as a downloadable Excel file."""
    from frappe.utils.xlsxutils import make_xlsx

    data = chw_work_order_drilldown(status, village, health_worker, visit_type)
    records = data.get('records', [])

    columns = ["Visit Type", "Patient", "High Risk", "Village", "From Date", "Due Date", "Alert By", "Status"]
    rows = [columns]
    for r in records:
        rows.append([
            r.get('visit_type', ''),
            r.get('patient', ''),
            r.get('high_risk') or '',
            r.get('village', ''),
            r.get('from_date') or '',
            r.get('due_date', ''),
            r.get('alert_date') or '',
            r.get('status', ''),
        ])

    xlsx_file = make_xlsx(rows, "CHW Work Order List")

    frappe.response['filename'] = "work-order-list.xlsx"
    frappe.response['filecontent'] = xlsx_file.getvalue()
    frappe.response['type'] = 'binary'
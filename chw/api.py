from io import BytesIO

import frappe
from frappe import _
from frappe.query_builder import Order
from frappe.query_builder.functions import IfNull
from pypika.analytics import RowNumber
from pypika.terms import ExistsCriterion
from frappe.utils import getdate, add_days, add_months
from frappe.utils.file_manager import get_file_path
from PIL import Image


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


PWA_ICON_SIZES = [64, 192, 512]


@frappe.whitelist(allow_guest=True)
def get_pwa_manifest():
    """Serve the Web App Manifest with icons pointing at App Setting.app_logo
    (resized on request by get_pwa_icon below) instead of the static PNGs
    vite-plugin-pwa bakes in at build time - so a PWA install picks up
    whatever logo is actually configured, not whatever was uploaded when the
    app was last built. Most phones only fetch icons at install time, so
    changing the logo later won't update an already-installed icon without a
    reinstall - there's no push mechanism for that on any platform."""
    settings = frappe.get_single('App Setting')
    app_name = settings.app_name or 'CHW'
    icon_version = _app_logo_cache_key(settings.app_logo)

    icons = [
        {
            'src': f'/api/method/chw.api.get_pwa_icon?size={size}&v={icon_version}',
            'sizes': f'{size}x{size}',
            'type': 'image/png',
        }
        for size in PWA_ICON_SIZES
    ]
    icons.append({
        'src': f'/api/method/chw.api.get_pwa_icon?size=512&maskable=1&v={icon_version}',
        'sizes': '512x512',
        'type': 'image/png',
        'purpose': 'maskable',
    })

    manifest = {
        'id': '/chw/',
        'name': app_name,
        'short_name': app_name,
        'description': 'Community health worker data capture and follow-up tracking.',
        'start_url': '/chw/',
        'scope': '/chw/',
        'display': 'standalone',
        'background_color': '#ffffff',
        'theme_color': '#111827',
        'icons': icons,
    }

    frappe.response['type'] = 'download'
    frappe.response['filename'] = 'manifest.webmanifest'
    frappe.response['filecontent'] = frappe.as_json(manifest)
    frappe.response['content_type'] = 'application/manifest+json'
    frappe.response['display_content_as'] = 'inline'


def _app_logo_cache_key(app_logo):
    """A cache/URL-busting key that changes exactly when the logo does -
    the logo's own path already changes on every re-upload (Frappe names
    uploaded files uniquely), so it doubles as a fingerprint with no extra
    bookkeeping needed."""
    return frappe.utils.sha256_hash(app_logo or 'default')[:12]


@frappe.whitelist(allow_guest=True)
def get_pwa_icon(size='512', maskable=None):
    """Resize App Setting.app_logo into a square PNG at the requested size
    for the PWA manifest (see get_pwa_manifest) - phones expect specific
    icon sizes in specific formats, so the raw uploaded logo (whatever
    aspect ratio/format an admin uploaded) can't be linked directly.
    maskable=1 additionally pads the image to a safe zone on a solid
    background, per the maskable icon spec, so platforms that crop PWA
    icons into a circle/squircle don't cut off the logo's edges."""
    size = frappe.utils.cint(size) or 512
    if size not in PWA_ICON_SIZES:
        size = min(PWA_ICON_SIZES, key=lambda s: abs(s - size))
    is_maskable = frappe.utils.cint(maskable) == 1

    settings = frappe.get_single('App Setting')
    cache_key = f'pwa-icon:{_app_logo_cache_key(settings.app_logo)}:{size}:{int(is_maskable)}'
    cached = frappe.cache().get_value(cache_key)

    if cached is None:
        cached = _render_pwa_icon(settings.app_logo, size, is_maskable)
        frappe.cache().set_value(cache_key, cached, expires_in_sec=3600)

    frappe.response['type'] = 'download'
    frappe.response['filename'] = f'pwa-icon-{size}.png'
    frappe.response['filecontent'] = cached
    frappe.response['content_type'] = 'image/png'
    frappe.response['display_content_as'] = 'inline'


def _render_pwa_icon(app_logo, size, is_maskable):
    source = None
    if app_logo:
        try:
            with open(get_file_path(app_logo), 'rb') as f:
                source = Image.open(f)
                source.load()
        except Exception:
            frappe.log_error(title='PWA icon: failed to read App Setting.app_logo')
            source = None

    if source is None:
        # No logo configured (or it failed to load) - a plain colored
        # square beats a broken image in the install prompt/home screen.
        canvas = Image.new('RGB', (size, size), '#111827')
    else:
        source = source.convert('RGBA')
        # Center-crop to square before scaling, so an arbitrary-aspect-ratio
        # upload (a wide logo, a tall one) doesn't get squashed.
        w, h = source.size
        edge = min(w, h)
        left, top = (w - edge) // 2, (h - edge) // 2
        source = source.crop((left, top, left + edge, top + edge))

        if is_maskable:
            # Maskable icons must keep their subject inside an ~80% "safe
            # zone" - platforms that crop into a circle/squircle shape may
            # cut off anything closer to the edge than that.
            safe_size = int(size * 0.8)
            source = source.resize((safe_size, safe_size), Image.LANCZOS)
            corner = source.getpixel((0, 0))
            fill = corner[:3] if isinstance(corner, tuple) else (17, 24, 39)
            canvas = Image.new('RGB', (size, size), fill)
            offset = (size - safe_size) // 2
            canvas.paste(source, (offset, offset), source)
        else:
            source = source.resize((size, size), Image.LANCZOS)
            canvas = Image.new('RGB', (size, size), '#ffffff')
            canvas.paste(source, (0, 0), source)

    buffer = BytesIO()
    canvas.save(buffer, format='PNG')
    return buffer.getvalue()


@frappe.whitelist()
def search_list(doctype, search_term, fields, search_fields):
    """OR-search search_term across search_fields, returning the given
    fields - the mobile list view's single search box (replacing several
    stacked per-field filters, which don't fit well on a small screen) needs
    to match any one of several fields at once. The v2 REST document-list
    endpoint DoctypeList.vue otherwise uses (/api/v2/document/<doctype>)
    only takes `filters`, which Frappe always ANDs together field-by-field -
    there's no way to express "Village OR Head of Family OR ..." through it.
    frappe.get_list's or_filters parameter (unlike that REST endpoint) does
    support this directly. Runs with the same permission enforcement as any
    other list fetch (frappe.get_list checks doctype/row permissions itself,
    same as DoctypeList's normal query) - no extra doctype allowlist here,
    since this can't do anything a permitted, filtered list fetch couldn't."""
    fields = frappe.parse_json(fields)
    search_fields = frappe.parse_json(search_fields)
    search_term = (search_term or '').strip()

    if not search_term or not search_fields:
        return frappe.get_list(doctype, fields=fields, limit_page_length=20, order_by='modified desc')

    or_filters = [[field, 'like', f'%{search_term}%'] for field in search_fields]
    return frappe.get_list(
        doctype,
        fields=fields,
        or_filters=or_filters,
        limit_page_length=20,
        order_by='modified desc',
    )


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
        from frappe.desk.form.assign_to import _add as assign_to_add

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
"""Tool implementations the AI assistant can call.

Every function here executes as `frappe.session.user` - never
`ignore_permissions=True`, never a user switch. Frappe's own permission
system (frappe.has_permission / frappe.get_list's built-in permission
filtering / doc.insert() / doc.save()) is the enforcement boundary, exactly
as it is for every other part of this app. A tool never does anything a
DoctypeList/DoctypeForm click couldn't already do for that same user.

Every tool also validates its `doctype` argument against the app's own
navigation config (App Module Setting, via chw.api.get_app_modules) before
touching Frappe at all. This is a belt-and-suspenders layer on top of role
permissions: it stops the assistant from ever operating on a doctype this
app hasn't chosen to expose in its UI (e.g. User, Role, Email Account),
even if the model hallucinates one or the calling user's role technically
has access to it elsewhere in Frappe.
"""

import frappe
from frappe import _

from chw.api import get_app_modules


def _allowed_doctype_names():
    modules = get_app_modules()
    names = set()
    for module in modules:
        for item in module.get('doctypes', []):
            names.add(item['doctype_name'])
    return names


def _require_allowed_doctype(doctype):
    if doctype not in _allowed_doctype_names():
        frappe.throw(_('{0} is not available to the assistant').format(doctype), frappe.PermissionError)


def list_doctypes():
    """Doctypes (with their app module/route) this user can see in the app's
    own navigation - the assistant's grounding for "what data exists here"."""
    modules = get_app_modules()
    return [
        {
            'doctype': item['doctype_name'],
            'label': item.get('label') or item['doctype_name'],
            'module': module['label'],
        }
        for module in modules
        for item in module.get('doctypes', [])
    ]


SKIP_FIELDTYPES = {'Section Break', 'Column Break', 'Tab Break', 'HTML', 'Heading', 'Button'}


def get_doctype_meta(doctype):
    """Trimmed field list for `doctype` - fieldname/label/fieldtype/required/
    options only, matching what the Vue form itself renders (see
    useFormFields in the frontend), so the assistant knows exactly what a
    human filling out the same form would see."""
    _require_allowed_doctype(doctype)
    meta = frappe.get_meta(doctype)
    fields = []
    for f in meta.fields:
        if f.fieldtype in SKIP_FIELDTYPES or f.hidden or f.fieldtype == 'Table':
            continue
        fields.append({
            'fieldname': f.fieldname,
            'label': f.label,
            'fieldtype': f.fieldtype,
            'required': bool(f.reqd),
            'options': f.options if f.fieldtype in ('Select', 'Link') else None,
        })
    return {'doctype': doctype, 'fields': fields}


def search_records(doctype, filters=None, fields=None, limit=20):
    """List records the current user can read, permission-filtered by
    frappe.get_list exactly as the app's own list pages are."""
    _require_allowed_doctype(doctype)
    limit = min(int(limit or 20), 50)
    if not fields:
        meta = frappe.get_meta(doctype)
        fields = ['name'] + [f.fieldname for f in meta.fields if f.in_list_view][:6]
        fields = list(dict.fromkeys(fields))
    return frappe.get_list(
        doctype,
        filters=filters or {},
        fields=fields,
        limit_page_length=limit,
    )


def get_record(doctype, name):
    """A single record's data, only if the current user can read it."""
    _require_allowed_doctype(doctype)
    if not frappe.has_permission(doctype, ptype='read', doc=name):
        frappe.throw(_('You do not have permission to view this record'), frappe.PermissionError)
    doc = frappe.get_doc(doctype, name)
    data = doc.as_dict()
    # Drop framework/internal bookkeeping fields and any Table (child) rows -
    # keep the payload small and focused on the record's own field values.
    for key in list(data.keys()):
        if key.startswith('_') or key in ('doctype', 'owner', 'idx', 'docstatus'):
            data.pop(key, None)
        elif isinstance(data.get(key), list):
            data.pop(key, None)
    return data


def create_record(doctype, values):
    """Create a record as the current user - frappe.new_doc().insert() applies
    the same create-permission check the Vue "New" form's save button does."""
    _require_allowed_doctype(doctype)
    if not frappe.has_permission(doctype, ptype='create'):
        frappe.throw(_('You do not have permission to create {0}').format(doctype), frappe.PermissionError)
    doc = frappe.new_doc(doctype)
    doc.update(values or {})
    doc.insert()
    return {'doctype': doctype, 'name': doc.name}


def update_record(doctype, name, values):
    """Update a record as the current user - doc.save() applies the same
    write-permission check the Vue form's save button does."""
    _require_allowed_doctype(doctype)
    if not frappe.has_permission(doctype, ptype='write', doc=name):
        frappe.throw(_('You do not have permission to edit this record'), frappe.PermissionError)
    doc = frappe.get_doc(doctype, name)
    doc.update(values or {})
    doc.save()
    return {'doctype': doctype, 'name': doc.name}


def navigate_to(doctype=None, name=None):
    """Not a data operation - just a validated pointer the frontend turns into
    a router.push. Still permission-checked so the assistant can't direct a
    user toward a form/record they can't actually open."""
    if doctype:
        _require_allowed_doctype(doctype)
        if name and not frappe.has_permission(doctype, ptype='read', doc=name):
            frappe.throw(_('You do not have permission to open this record'), frappe.PermissionError)
    return {'type': 'navigate', 'doctype': doctype, 'name': name}


TOOL_FUNCTIONS = {
    'list_doctypes': list_doctypes,
    'get_doctype_meta': get_doctype_meta,
    'search_records': search_records,
    'get_record': get_record,
    'create_record': create_record,
    'update_record': update_record,
    'navigate_to': navigate_to,
}


TOOL_SCHEMAS = [
    {
        'type': 'function',
        'function': {
            'name': 'list_doctypes',
            'description': 'List the data types (doctypes) available in this app for the current user, grouped by module. Call this first if unsure what data exists.',
            'parameters': {'type': 'object', 'properties': {}},
        },
    },
    {
        'type': 'function',
        'function': {
            'name': 'get_doctype_meta',
            'description': 'Get the field list (name, label, type, required) for a doctype. Always call this before create_record or update_record so you know which fields are required and never guess a required value the user has not given you - ask them instead.',
            'parameters': {
                'type': 'object',
                'properties': {'doctype': {'type': 'string'}},
                'required': ['doctype'],
            },
        },
    },
    {
        'type': 'function',
        'function': {
            'name': 'search_records',
            'description': 'Search/list records of a doctype the user can see, optionally filtered. Use this to answer questions like counts, lookups, or "who is due for a visit".',
            'parameters': {
                'type': 'object',
                'properties': {
                    'doctype': {'type': 'string'},
                    'filters': {
                        'type': 'object',
                        'description': 'Frappe filter dict, e.g. {"village": "Green Valley"}. Omit for no filter.',
                    },
                    'fields': {
                        'type': 'array',
                        'items': {'type': 'string'},
                        'description': 'Fieldnames to return. Omit to use the doctype\'s default list columns.',
                    },
                    'limit': {'type': 'integer', 'description': 'Max rows, default 20, hard cap 50.'},
                },
                'required': ['doctype'],
            },
        },
    },
    {
        'type': 'function',
        'function': {
            'name': 'get_record',
            'description': 'Get the full field values of one specific record by name.',
            'parameters': {
                'type': 'object',
                'properties': {
                    'doctype': {'type': 'string'},
                    'name': {'type': 'string'},
                },
                'required': ['doctype', 'name'],
            },
        },
    },
    {
        'type': 'function',
        'function': {
            'name': 'create_record',
            'description': 'Create a new record. Call get_doctype_meta first, confirm the values with the user in plain language, and only then call this. Never invent a value for a required field - ask the user for it instead.',
            'parameters': {
                'type': 'object',
                'properties': {
                    'doctype': {'type': 'string'},
                    'values': {'type': 'object', 'description': 'fieldname -> value map'},
                },
                'required': ['doctype', 'values'],
            },
        },
    },
    {
        'type': 'function',
        'function': {
            'name': 'update_record',
            'description': 'Update fields on an existing record. Confirm the change with the user before calling this.',
            'parameters': {
                'type': 'object',
                'properties': {
                    'doctype': {'type': 'string'},
                    'name': {'type': 'string'},
                    'values': {'type': 'object', 'description': 'fieldname -> new value map'},
                },
                'required': ['doctype', 'name', 'values'],
            },
        },
    },
    {
        'type': 'function',
        'function': {
            'name': 'navigate_to',
            'description': 'Send the user to a list page (doctype only) or a specific record\'s form (doctype + name) in the app. Use this when the user asks to "open"/"go to"/"show me the form for" something, or after creating a record if they might want to review it.',
            'parameters': {
                'type': 'object',
                'properties': {
                    'doctype': {'type': 'string'},
                    'name': {'type': 'string', 'description': 'Omit to navigate to the list page instead of a specific record.'},
                },
                'required': ['doctype'],
            },
        },
    },
]

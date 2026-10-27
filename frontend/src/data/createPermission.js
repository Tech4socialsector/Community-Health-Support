import { call } from 'frappe-ui'

// "May this user create <doctype>?" - asked once per doctype per session,
// as Desk only offers "Create a new ..." to roles with create permission.
// Used by the Link and Table MultiSelect fields' + buttons.
const createPermission = new Map()
export function canCreateDoctype(doctype) {
  if (!createPermission.has(doctype)) {
    createPermission.set(
      doctype,
      call('frappe.client.has_permission', { doctype, docname: '', perm_type: 'create' })
        .then((r) => !!r?.has_permission)
        .catch(() => false),
    )
  }
  return createPermission.get(doctype)
}

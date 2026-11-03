import { call } from 'frappe-ui'

// "May the current user <perm_type> this doctype (or this exact record)?" -
// cached per (doctype, perm_type, docname) for the session, same question
// asked over and over as pages/components mount. A denied answer here is
// what a server-side check (e.g. permlevel reset on save, or a plain
// PermissionError) would also reject - this only decides what the UI shows,
// never the actual access boundary.
const cache = new Map()

export function hasPermission(doctype, permType, docname = '') {
  const key = `${doctype}:${permType}:${docname}`
  if (!cache.has(key)) {
    cache.set(
      key,
      call('frappe.client.has_permission', { doctype, docname, perm_type: permType })
        .then((r) => !!r?.has_permission)
        .catch(() => false),
    )
  }
  return cache.get(key)
}

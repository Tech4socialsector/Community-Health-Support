import { findModuleByDoctype } from '@/data/modules'

// Work Orders / Overview drilldown records can be any of the 5-6 program
// doctypes, not all of which are necessarily registered as an app module
// (sidebar-navigable) doctype. When one is, stay inside the view app (the
// generic DoctypeForm route) instead of dropping out to the Desk admin UI;
// only fall back to opening the Desk form in a new tab for a doctype this
// app doesn't have its own page for yet.
export function goToRecord(router, doctype, name) {
  const mod = findModuleByDoctype(doctype)
  if (mod) {
    router.push({ name: 'DoctypeForm', params: { doctypeRoute: mod.route, name } })
    return true
  }
  window.open(`/app/${slugifyDoctype(doctype)}/${encodeURIComponent(name)}`, '_blank', 'noopener')
  return false
}

export function slugifyDoctype(doctype) {
  return (doctype || '').toLowerCase().split(' ').join('-')
}

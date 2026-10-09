import { flatModuleItems, findModuleByRoute } from '@/data/modules'
import { sidebarTrail } from '@/data/activeModule'

// The "where did I come from" path shown above list and form pages, e.g.
//   Home / Household profile / HH-00027 / Family members / FM-00064
// built from the forms' own Desk connections (Household profile links to
// Family members through `hhid`), so a record always offers a way back up
// to the record it belongs to - not just to its own list.

// The forms whose connections point at `item`, each with the link field
// that does it: Family members -> [{ parent: Household profile, fieldname: 'hhid' }].
function parentLinks(item) {
  const links = []
  for (const candidate of flatModuleItems.value) {
    for (const link of candidate.links || []) {
      if (link.doctype === item.doctype_name) links.push({ parent: candidate, fieldname: link.fieldname })
    }
  }
  return links
}

// The parent record behind `values` (a form's field values, or a list's
// link filter): the first parent link whose field actually holds a value.
// A form with two parents (Birth Registration under Family members *and*
// Pregnancy Registration) prefers the one on the sidebar's open branch -
// i.e. the way the user actually came.
export function findParentRecord(item, values) {
  const links = parentLinks(item).filter((l) => values?.[l.fieldname])
  if (!links.length) return null
  const trail = sidebarTrail.value
  const viaTrail = links.find((l) => trail.includes(l.parent.route))
  const link = viaTrail || links[0]
  return { parent: link.parent, fieldname: link.fieldname, value: values[link.fieldname] }
}

// Crumbs for a list page; `filters` is the list's link filter (e.g.
// { hhid: 'HH-00027' } when opened from a household's Connections).
export function listCrumbs(doctypeRoute, filters) {
  const item = findModuleByRoute(doctypeRoute)
  const crumbs = [{ label: 'Home', to: { name: 'Home' }, home: true }]
  if (!item) return crumbs
  const parent = findParentRecord(item, filters)
  if (parent) {
    crumbs.push(
      { label: parent.parent.label, to: { name: 'DoctypeList', params: { doctypeRoute: parent.parent.route } } },
      { label: parent.value, to: { name: 'DoctypeForm', params: { doctypeRoute: parent.parent.route, name: parent.value } } },
    )
  }
  crumbs.push({ label: item.label })
  return crumbs
}

// Crumbs for a form page; `values` are the record's field values.
export function formCrumbs(doctypeRoute, name, values, isNew) {
  const item = findModuleByRoute(doctypeRoute)
  const crumbs = [{ label: 'Home', to: { name: 'Home' }, home: true }]
  if (!item) return crumbs
  const parent = findParentRecord(item, values)
  if (parent) {
    crumbs.push(
      { label: parent.parent.label, to: { name: 'DoctypeList', params: { doctypeRoute: parent.parent.route } } },
      { label: parent.value, to: { name: 'DoctypeForm', params: { doctypeRoute: parent.parent.route, name: parent.value } } },
      // This form's list, narrowed to the same parent - the sibling records.
      {
        label: item.label,
        to: { name: 'DoctypeList', params: { doctypeRoute: item.route }, query: { [parent.fieldname]: parent.value } },
      },
    )
  } else {
    crumbs.push({ label: item.label, to: { name: 'DoctypeList', params: { doctypeRoute: item.route } } })
  }
  crumbs.push({ label: isNew ? 'New' : name })
  return crumbs
}

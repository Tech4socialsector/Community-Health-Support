import { computed } from 'vue'
import { useCall } from 'frappe-ui'

// Shared across the app so every page resolves the same module list without
// re-fetching: Home (nav tiles), and the sidebar/router (route slug -> item).
// Uses the v2 RPC route (/api/v2/method/...) since useCall unwraps `.data`,
// not the legacy `.message` envelope that /api/method/... responds with.
// `immediate: false` - this module loads before login (imported by router.js),
// so it must not fetch until the caller knows there's an authenticated session
// (see main.js / router.js, which call modulesResource.fetch() once ready).
//
// Shape returned by chw.api.get_app_modules:
// [{ label, icon, doctypes: [{ doctype_name, label, icon, route }] }]
export const modulesResource = useCall({
  url: '/api/v2/method/chw.api.get_app_modules',
  method: 'GET',
  immediate: false,
  cacheKey: 'chw-app-modules',
})

// Flat list of every sidebar item across all modules, each tagged with its
// parent module, so a route slug can resolve back to both the DocType to
// render and the module section it belongs to in the sidebar.
export const flatModuleItems = computed(() => {
  const modules = modulesResource.data || []
  const items = []
  for (const mod of modules) {
    for (const item of mod.doctypes || []) {
      items.push({ ...item, module: mod })
    }
  }
  return items
})

export function findModuleByRoute(routeSlug) {
  return flatModuleItems.value.find((item) => item.route === routeSlug)
}

export function findModuleByDoctype(doctypeName) {
  return flatModuleItems.value.find((item) => item.doctype_name === doctypeName)
}

// The app items a DocType's Desk connections point to (Household profile ->
// Family members, Family members -> Pregnancy Registration, ...), limited to
// DocTypes this app actually has a page for - the sidebar tree and the form
// Connections panel only offer what they can navigate to.
export function childItemsOf(item) {
  const children = []
  for (const link of item?.links || []) {
    const child = findModuleByDoctype(link.doctype)
    if (child && !children.some((c) => c.route === child.route)) children.push(child)
  }
  return children
}

// Shortest chain of items from a top-level (parentless) item down to
// `item`, e.g. ANC Follow-up -> [Household profile, Family members,
// Pregnancy Registration, ANC Follow-up]. Used when a form is opened
// directly (Home card, search) rather than by walking down the sidebar.
export function defaultTrailFor(item) {
  const items = flatModuleItems.value
  const parentsOf = (target) => items.filter((p) => childItemsOf(p).some((c) => c.route === target.route))

  // Breadth-first upwards, so the first parentless ancestor found is the
  // nearest one; `seen` guards against cyclic links.
  const queue = [[item]]
  const seen = new Set([item.route])
  while (queue.length) {
    const path = queue.shift()
    const parents = parentsOf(path[0]).filter((p) => !seen.has(p.route))
    if (!parentsOf(path[0]).length) return path.map((p) => p.route)
    for (const parent of parents) {
      seen.add(parent.route)
      queue.push([parent, ...path])
    }
  }
  // Every ancestor chain loops back on itself - no real root; show it alone.
  return [item.route]
}

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

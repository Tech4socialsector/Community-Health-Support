import { ref } from 'vue'
import { childItemsOf, defaultTrailFor, findModuleByRoute } from '@/data/modules'

// The module a user last selected on Home, shown as its own section in the
// sidebar, and kept while they navigate that module's list/form pages.
export const activeModule = ref(null)

export function setActiveModule(mod) {
  activeModule.value = mod
}

export function clearActiveModule() {
  activeModule.value = null
}

// The open branch of the sidebar tree, as item routes from the top-level
// form down to the current one - e.g. ['household-profile',
// 'family-members', 'pregnancy-registration']. Each entry's connected forms
// are shown nested under it; everything off this branch stays collapsed.
export const sidebarTrail = ref([])

export function updateSidebarTrail(item) {
  const trail = sidebarTrail.value

  // Going back up the branch (e.g. Pregnancy -> Family members): cut below it.
  const index = trail.indexOf(item.route)
  if (index !== -1) {
    sidebarTrail.value = trail.slice(0, index + 1)
    return
  }

  // Going down from somewhere on the branch: hang it under the deepest
  // entry it's connected to, so a form with two parents (Birth Registration
  // under Family members *and* Pregnancy Registration) opens under the one
  // the user actually came from.
  for (let i = trail.length - 1; i >= 0; i--) {
    const parent = findModuleByRoute(trail[i])
    if (parent && childItemsOf(parent).some((c) => c.route === item.route)) {
      sidebarTrail.value = [...trail.slice(0, i + 1), item.route]
      return
    }
  }

  // Jumped in from elsewhere (Home card, search): open its nearest full path.
  sidebarTrail.value = defaultTrailFor(item)
}

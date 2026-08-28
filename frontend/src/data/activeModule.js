import { ref } from 'vue'

// The module a user last selected on Home, shown as its own section in the
// sidebar, and kept while they navigate that module's list/form pages.
export const activeModule = ref(null)

export function setActiveModule(mod) {
  activeModule.value = mod
}

export function clearActiveModule() {
  activeModule.value = null
}

import { ref } from 'vue'

// Shared so the desktop sidebar and the mobile drawer's embedded copy of it
// both open the same dialog instance rather than each rendering (and
// toggling) their own.
export const showSettingsDialog = ref(false)

export function openSettingsDialog() {
  showSettingsDialog.value = true
}

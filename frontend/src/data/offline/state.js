import { reactive } from 'vue'

// What the header's sync badge and the Outbox page show. `online` is
// learned from real requests, not only navigator.onLine - a phone can be
// "connected" to a tower that passes no data, which onLine reports as fine.
export const offlineState = reactive({
  online: typeof navigator === 'undefined' ? true : navigator.onLine,
  // Outbox counts, by status.
  pending: 0,
  errors: 0,
  conflicts: 0,
  syncing: false,
  downloading: false,
  lastSync: null, // server time of the last full download
  lastSyncError: null,
  // Whether this phone has the CHW data at all (first download done).
  ready: false,
  // Another tab with the older app keeps the phone storage from upgrading.
  storageBlocked: false,
  // Temporary offline name -> the real one, once synced (open forms follow).
  renamed: {},
  // Names of records that exist only on this phone so far - a temporary
  // OFFLINE-… name, or a reserved real ID (HH-00041) not yet synced.
  local: {},
})

export function markOnline() {
  if (!offlineState.online) {
    offlineState.online = true
    window.dispatchEvent(new CustomEvent('chw:online'))
  }
}

export function markOffline() {
  offlineState.online = false
}

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => markOnline())
  window.addEventListener('offline', () => markOffline())
}

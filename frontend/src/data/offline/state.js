import { reactive } from 'vue'

// What the header's sync badge and the Outbox page show. `online` is
// learned from real requests, not only navigator.onLine - a phone can be
// "connected" to a tower that passes no data, which onLine reports as fine.
export const offlineState = reactive({
  online: typeof navigator === 'undefined' ? true : navigator.onLine,
  // Offline because the signal is too weak to work on (requests far too
  // slow), not gone - the badge says so, and the phone's copy is used the
  // same way until the connection is steady again.
  weak: false,
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
  offlineState.weak = false
  if (!offlineState.online) {
    offlineState.online = true
    window.dispatchEvent(new CustomEvent('chw:online'))
  }
}

export function markOffline({ weak = false } = {}) {
  offlineState.online = false
  offlineState.weak = weak
}

// Chrome on Android reports the connection's real quality: 2G or worse is
// too slow to fill forms against the server, so the phone's copy is used
// from the start instead of after each request has timed out.
export function connectionTooWeak() {
  const c = typeof navigator !== 'undefined' ? navigator.connection : null
  return !!c && ['slow-2g', '2g'].includes(c.effectiveType)
}

if (typeof window !== 'undefined') {
  if (connectionTooWeak()) markOffline({ weak: true })
  // The browser's own "online" only means some network is back - sync.js
  // checks it is steady (see watchConnection) before going back online.
  window.addEventListener('offline', () => markOffline())
  navigator.connection?.addEventListener?.('change', () => {
    if (connectionTooWeak()) markOffline({ weak: true })
  })
}

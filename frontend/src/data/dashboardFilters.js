import { useCall } from 'frappe-ui'

// Shared Village / Health Worker filter options, used by both Overview and
// Work Orders - privileged-only on the backend (get_health_workers throws
// for anyone else), so callers must only fetch these once they already know
// (via userContextResource) that the logged-in user is privileged.
export const villagesResource = useCall({
  url: '/api/v2/method/chw.api.get_villages',
  method: 'GET',
  immediate: false,
  cacheKey: 'chw-filter-villages',
})

export const healthWorkersResource = useCall({
  url: '/api/v2/method/chw.api.get_health_workers',
  method: 'GET',
  immediate: false,
  cacheKey: 'chw-filter-health-workers',
})

export const ALL_VILLAGES = 'All Villages'
export const ALL_HEALTH_WORKERS = 'All Health Workers'

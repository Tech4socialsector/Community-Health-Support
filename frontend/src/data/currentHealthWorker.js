import { useCall } from 'frappe-ui'

// The Health Worker record (if any) linked to the logged-in user - fetched
// once and shared, so every new-record form can default its "Data
// Collector" (health_worker_name) field to whoever's actually filling it
// out, without each doctype needing its own hook for this.
export const currentHealthWorkerResource = useCall({
  url: '/api/v2/method/chw.api.get_current_health_worker',
  method: 'GET',
  cacheKey: 'chw-current-health-worker',
})

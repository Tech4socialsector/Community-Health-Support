import { useCall } from 'frappe-ui'

// The logged-in user's own Health Worker record - created for them the
// first time if they have none (Administrator included) - so every new
// record's "Data Collector" (health_worker_name) is filled in automatically.
// Separate from chw.api.get_current_health_worker, which worklists use to
// scope rows and must stay empty for Administrator. Its name starts with "get", so the
// offline layer keeps the last answer and offline forms still get it.
export const dataCollectorResource = useCall({
  url: '/api/v2/method/chw.api.get_or_create_data_collector',
  method: 'POST',
  cacheKey: 'chw-data-collector',
})

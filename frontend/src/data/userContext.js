import { useCall } from 'frappe-ui'

// Whether the logged-in user has a privileged role (System Manager /
// Program Coordinator / Administrator) - gates privileged-only UI like the
// App Settings dialog, without exposing the full role list to the client.
export const userContextResource = useCall({
  url: '/api/v2/method/chw.api.get_current_user_context',
  method: 'GET',
  cacheKey: 'chw-user-context',
})

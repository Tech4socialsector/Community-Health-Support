import { useCall } from 'frappe-ui'

// The app's configurable name/logo, from App Setting (allow_guest=True
// so the Login page can also show it before authentication).
export const brandingResource = useCall({
  url: '/api/v2/method/chw.api.get_app_branding',
  method: 'GET',
  cacheKey: 'chw-app-branding',
})

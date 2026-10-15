import { computed } from 'vue'
import { useCall } from 'frappe-ui'

// The app's configurable name/logo, from App Setting (allow_guest=True
// so the Login page can also show it before authentication).
export const brandingResource = useCall({
  url: '/api/v2/method/chw.api.get_app_branding',
  method: 'GET',
  cacheKey: 'chw-app-branding',
})

// The organisation's own logo, bundled with the app (public/), used
// wherever App Setting has no app_logo of its own. BASE_URL rather than a
// literal /-rooted path - the built files are served from the app's assets
// directory, not the site root (same as lucideSprite.js).
//   DEFAULT_LOGO      - the mark alone (cross + hills), for small spots
//   DEFAULT_LOGO_FULL - the mark with its "Healing hands..." tagline
export const DEFAULT_LOGO = `${import.meta.env.BASE_URL}logo-mark.png`
export const DEFAULT_LOGO_FULL = `${import.meta.env.BASE_URL}logo-full.png`

export const appLogo = computed(() => brandingResource.data?.app_logo || DEFAULT_LOGO)

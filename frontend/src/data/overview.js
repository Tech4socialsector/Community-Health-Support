import { useCall } from 'frappe-ui'

// Mirrors the Desk "chw-dashboard" page exactly (same CHW_DASHBOARD_CARDS,
// same filters) - a separate, privileged-only program overview, not the
// App-Setting-configurable cards on the existing Dashboard.vue/data/dashboard.js.
export const overviewCardsResource = useCall({
  url: '/api/v2/method/chw.api.get_chw_dashboard_cards',
  method: 'GET',
  immediate: false,
  cacheKey: 'chw-overview-cards',
})

// Triggered per-card-click with card_key (+ whatever filters are active at
// that moment) passed to .submit(), not a reactive params object - each
// click is its own one-off fetch, same as the Desk page's own
// frappe.call-per-click.
export const overviewDrilldownCall = useCall({
  url: '/api/v2/method/chw.api.chw_dashboard_drilldown',
  method: 'GET',
  immediate: false,
})

export const OVERVIEW_COLOR_CLASSES = {
  gray: 'border-t-gray-400 bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300',
  purple: 'border-t-purple-500 bg-purple-100 text-purple-600 dark:bg-purple-900/40 dark:text-purple-300',
  blue: 'border-t-blue-500 bg-blue-100 text-blue-600 dark:bg-blue-900/40 dark:text-blue-300',
  green: 'border-t-green-500 bg-green-100 text-green-600 dark:bg-green-900/40 dark:text-green-300',
  orange: 'border-t-orange-500 bg-orange-100 text-orange-600 dark:bg-orange-900/40 dark:text-orange-300',
  red: 'border-t-red-500 bg-red-100 text-red-600 dark:bg-red-900/40 dark:text-red-300',
}

export function overviewColorClasses(color) {
  return OVERVIEW_COLOR_CLASSES[color] || OVERVIEW_COLOR_CLASSES.gray
}

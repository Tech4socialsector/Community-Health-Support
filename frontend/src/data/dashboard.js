import { useCall } from 'frappe-ui'

export const dashboardCardsResource = useCall({
  url: '/api/v2/method/chw.api.get_dashboard_cards',
  method: 'GET',
  immediate: false,
  cacheKey: 'chw-dashboard-cards',
})

export const dashboardStatsResource = useCall({
  url: '/api/v2/method/chw.api.chw_visit_summary',
  method: 'GET',
  immediate: false,
  cacheKey: 'chw-dashboard-stats',
})

const COLOR_CLASSES = {
  blue: 'bg-blue-100 text-blue-600',
  red: 'bg-red-100 text-red-600',
  green: 'bg-green-100 text-green-600',
  purple: 'bg-purple-100 text-purple-600',
  orange: 'bg-orange-100 text-orange-600',
  gray: 'bg-gray-100 text-gray-600',
}

export function colorClasses(color) {
  return COLOR_CLASSES[color] || COLOR_CLASSES.gray
}

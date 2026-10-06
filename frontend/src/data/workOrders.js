import { useCall } from 'frappe-ui'

// Mirrors the Desk "chw-work-order-list" page exactly - same 5
// CHW_WORK_ORDER_TYPES, same 6 status buckets, same backend functions.
export const workOrderSummaryResource = useCall({
  url: '/api/v2/method/chw.api.get_chw_work_order_summary',
  method: 'GET',
  immediate: false,
  cacheKey: 'chw-work-order-summary',
})

export const workOrderDrilldownResource = useCall({
  url: '/api/v2/method/chw.api.chw_work_order_drilldown',
  method: 'GET',
  immediate: false,
  cacheKey: 'chw-work-order-drilldown',
})

export const VISIT_TYPES = ['ANC', 'PNC', 'Palliative Care', 'Postpartum (1-6 weeks)', 'Child (6 wk-1 year)']

// This Week is the working list for the week (any day Mon-Sun); Today is a
// subset of it, not a separate count. Upcoming is a rolling 30-days-from-today
// view. Completed is followups actually logged this week. High Risk is every
// currently-High-Risk patient regardless of due date - not a subset of the
// other 5, same as the Desk page's own STATUS_CARDS.
export const STATUS_CARDS = [
  { key: 'this_week', label: 'This Week', color: '#7C3AED' },
  { key: 'today', label: 'Today', color: '#2563EB' },
  { key: 'upcoming', label: 'Upcoming (30 days)', color: '#C2540A' },
  { key: 'overdue', label: 'Overdue / Missed', color: '#B91C1C' },
  { key: 'completed', label: 'Completed (this week)', color: '#15803D' },
  { key: 'high_risk', label: 'High Risk', color: '#9F1239' },
]

export const STATUS_OPTIONS = [
  { label: 'Select...', value: '' },
  { label: 'All (pending)', value: 'all' },
  { label: 'This Week', value: 'this_week' },
  { label: 'Today', value: 'today' },
  { label: 'Upcoming (30 days)', value: 'upcoming' },
  { label: 'Overdue', value: 'overdue' },
  { label: 'Completed (week)', value: 'completed' },
  { label: 'High Risk', value: 'high_risk' },
]

export const STATUS_BADGE_CLASSES = {
  Overdue: 'bg-red-100 text-red-700',
  Completed: 'bg-green-100 text-green-700',
  Upcoming: 'bg-orange-100 text-orange-700',
  'This Week': 'bg-purple-100 text-purple-700',
  'High Risk': 'bg-pink-100 text-pink-700',
  Today: 'bg-blue-100 text-blue-700',
}

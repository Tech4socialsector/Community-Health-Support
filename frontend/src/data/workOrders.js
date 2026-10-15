import { TONE } from '@/data/ui'

// Shared constants for the Work Orders page - the Vue counterpart of the
// Desk "chw-work-order-list" page: same 5 CHW_WORK_ORDER_TYPES, same 6
// status buckets, same backend functions (chw.api.get_chw_work_order_summary
// / chw_work_order_drilldown / chw_work_order_drilldown_excel).

export const VISIT_TYPES = ['ANC', 'PNC', 'Palliative Care', 'Postpartum (1-6 weeks)', 'Child (6 wk-1 year)']

// Same fixed page size as the Desk popup, so the Excel export (which takes
// start/page_length) matches what's on screen.
export const PAGE_SIZE = 100

// This Week is the working list for the week (any day Mon-Sun); Today is a
// subset of it, not a separate count. Upcoming is a rolling 30-days-from-today
// view. Completed is followups actually logged this week. High Risk is every
// currently-High-Risk patient regardless of due date - not a subset of the
// other 5, same as the Desk page's own STATUS_CARDS.
//
// Each status's colour carries meaning (ui.js TONE): the week's list in
// the brand navy, today blue, upcoming amber, overdue and high risk red,
// completed green - the same tone on its card tile and its row badges.
// `rowLabel` is the status text chw_work_order_drilldown puts on each record.
export const STATUS_CARDS = [
  { key: 'this_week', label: 'This Week', rowLabel: 'This Week', icon: 'calendar-range', tone: 'navy' },
  { key: 'today', label: 'Today', rowLabel: 'Today', icon: 'calendar-check', tone: 'blue' },
  { key: 'upcoming', label: 'Upcoming (30 days)', rowLabel: 'Upcoming', icon: 'calendar-clock', tone: 'amber' },
  { key: 'overdue', label: 'Overdue / Missed', rowLabel: 'Overdue', icon: 'alarm-clock', tone: 'red' },
  { key: 'completed', label: 'Completed (this week)', rowLabel: 'Completed', icon: 'circle-check', tone: 'green' },
  { key: 'high_risk', label: 'High Risk', rowLabel: 'High Risk', icon: 'triangle-alert', tone: 'red' },
].map((card) => ({ ...card, iconClass: TONE[card.tone] }))

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

export const RISK_OPTIONS = [
  { label: 'All', value: '' },
  { label: 'High Risk', value: 'high_risk' },
  { label: 'Normal', value: 'normal' },
]

export function statusBadgeClass(rowStatus) {
  return TONE[STATUS_CARDS.find((c) => c.rowLabel === rowStatus)?.tone] || TONE.gray
}

// Shared helpers for the doctype hook modules (Vue ports of the Desk form
// scripts). Dates are handled as local calendar dates throughout:
// new Date('YYYY-MM-DD') is UTC midnight and toISOString() is UTC, which put
// dates a day out in India between 00:00 and 05:30 - Desk (moment) and the
// server (Python dates) both work in local dates.

import { call, toast } from 'frappe-ui'

const DAY_MS = 86400000

function pad(n) {
  return String(n).padStart(2, '0')
}

// 'YYYY-MM-DD' (or a Datetime string) -> local Date at midnight; null if empty.
export function parseDate(value) {
  if (value instanceof Date) return new Date(value.getFullYear(), value.getMonth(), value.getDate())
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value || '')
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null
}

// local Date -> 'YYYY-MM-DD'
export function toDateStr(date) {
  if (!date) return null
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

export function today() {
  return toDateStr(new Date())
}

export function addDays(value, days) {
  const d = parseDate(value)
  if (!d) return null
  return toDateStr(new Date(d.getFullYear(), d.getMonth(), d.getDate() + Number(days || 0)))
}

// Like relativedelta / moment: 31 Jan + 1 month = 28/29 Feb, not 2/3 Mar.
export function addMonths(value, months) {
  const d = parseDate(value)
  if (!d) return null
  const m = d.getMonth() + Number(months || 0)
  const year = d.getFullYear() + Math.floor(m / 12)
  const month = ((m % 12) + 12) % 12
  const lastDay = new Date(year, month + 1, 0).getDate()
  return toDateStr(new Date(year, month, Math.min(d.getDate(), lastDay)))
}

// Whole days from a to b (b - a); Math.round absorbs daylight-saving hours.
export function daysBetween(a, b) {
  const da = parseDate(a)
  const db = parseDate(b)
  if (!da || !db) return null
  return Math.round((db - da) / DAY_MS)
}

export function compareDates(a, b) {
  return (parseDate(a)?.getTime() ?? 0) - (parseDate(b)?.getTime() ?? 0)
}

// The site's date format (System Settings), as the server's formatdate()
// writes it into text fields such as "next visit window" and risk alerts -
// so a live preview reads exactly like the saved value. dd-mm-yyyy (this
// site's setting) until it's known; CHW roles may not read System Settings.
let dateFormat = 'dd-mm-yyyy'
call('frappe.client.get_single_value', { doctype: 'System Settings', field: 'date_format' })
  .then((f) => {
    if (f) dateFormat = f
  })
  .catch(() => {})

export function formatDate(value) {
  const d = parseDate(value)
  if (!d) return ''
  return dateFormat
    .replace('yyyy', String(d.getFullYear()))
    .replace('mm', pad(d.getMonth() + 1))
    .replace('dd', pad(d.getDate()))
}

// "12 weeks 3 days" between LMP and a date, as the Desk scripts and server
// write POG; '' when the date is before LMP or either is missing.
export function pogText(lmp, date) {
  const days = daysBetween(lmp, date)
  if (days == null || days < 0) return ''
  return `${Math.floor(days / 7)} weeks ${days % 7} days`
}

// Desk's live phone check on every CHW form: a warning only (the value is
// kept); the server refuses non-digits on save.
export function warnIfNotDigits(value) {
  if (value && !/^\d*$/.test(String(value))) {
    toast.warning('Invalid Phone Number: letters are not allowed. Please enter numbers only.')
  }
}

// Desk's BMI: kg / m², 1 decimal; null when height or weight is missing.
export function bmi(heightCm, weightKg) {
  const h = parseFloat(heightCm)
  const w = parseFloat(weightKg)
  if (!h || !w || Number.isNaN(h) || Number.isNaN(w)) return null
  return Math.round((w / (h / 100) ** 2) * 10) / 10
}

// An open urgent follow-up row (added for a high-risk visit): a deeper
// tint than Desk's pale #FEE2E2, so it stands out on a phone at a glance.
export const URGENT_ROW_CLASS = '!bg-[#FCA5A5] font-medium text-red-900 dark:!bg-red-900/60 dark:text-red-100'
export function isOpenUrgent(row) {
  return !!row?.urgent_followup && row.status !== 'Completed'
}

// Red, bold text for the risk-alert fields ("Visit by 12-10-2026").
export const RISK_ALERT_FIELD_CLASS = '[&_input]:!font-semibold [&_input]:!text-red-700 dark:[&_input]:!text-red-300'

// A server value cached per form session (e.g. a visit schedule master).
export function cached(fn) {
  let promise = null
  return () => {
    if (!promise) promise = Promise.resolve(fn()).catch((e) => ((promise = null), Promise.reject(e)))
    return promise
  }
}

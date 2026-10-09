// Ports chw/common/doctype/family_members/family_members.js (the Desk
// form script) age calculation into the Vue app's diff-triggered hook
// contract - see doctype-hooks/index.js and DoctypeForm.vue. Without it the
// Vue form only showed an age after saving. Must give the same answer as
// the server's get_age_values() (dateutil.relativedelta), which recomputes
// it on save anyway.

import { toast } from 'frappe-ui'
import { warnIfNotDigits } from './utils'

// 'YYYY-MM-DD' as a local date - new Date('YYYY-MM-DD') is UTC midnight,
// which is the previous day in timezones west of UTC.
function parseLocalDate(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value || '')
  return match ? new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3])) : null
}

function todayLocal() {
  const now = new Date()
  return new Date(now.getFullYear(), now.getMonth(), now.getDate())
}

// Birth date moved forward `count` months, clamped to that month's last
// day (31 Jan + 1 month = 28/29 Feb) - how relativedelta counts.
function addMonthsClamped(date, count) {
  const m = date.getMonth() + count
  const year = date.getFullYear() + Math.floor(m / 12)
  const month = ((m % 12) + 12) % 12
  const lastDay = new Date(year, month + 1, 0).getDate()
  return new Date(year, month, Math.min(date.getDate(), lastDay))
}

const DAY_MS = 86400000

// Exported so the results can be checked against the server's.
export function ageParts(dob, now) {
  let months = (now.getFullYear() - dob.getFullYear()) * 12 + (now.getMonth() - dob.getMonth())
  if (addMonthsClamped(dob, months) > now) months -= 1
  // Math.round: a daylight-saving shift makes a "day" 23 or 25 hours.
  const days = Math.round((now - addMonthsClamped(dob, months)) / DAY_MS)
  return {
    years: Math.floor(months / 12),
    months: months % 12,
    totalMonths: months,
    days,
    totalDays: Math.round((now - dob) / DAY_MS),
  }
}

// "2 years, 3 months, 10 days" - leading zero units left out ("12 days"),
// matching format_age_detail() on the server.
export function formatAgeDetail(years, months, days) {
  const part = (n, unit) => `${n} ${unit}${n === 1 ? '' : 's'}`
  const parts = []
  if (years) parts.push(part(years, 'year'))
  if (years || months) parts.push(part(months, 'month'))
  parts.push(part(days, 'day'))
  return parts.join(', ')
}

function calculateAge(values) {
  const dob = parseLocalDate(values.date_of_birth)
  if (!dob) {
    // Cleared DOB: same as Desk - empty the derived fields so a stale age
    // isn't left behind; Age can then be typed by hand if DOB is unknown.
    values.age = ''
    values.age_in_months = 0
    values.age_in_days = 0
    values.age_detail = ''
    return
  }

  const now = todayLocal()
  if (dob > now) {
    toast.warning('Date of Birth cannot be in the future.')
    values.date_of_birth = ''
    values.age = ''
    values.age_in_months = 0
    values.age_in_days = 0
    values.age_detail = ''
    return
  }

  const age = ageParts(dob, now)
  values.age = String(age.years)
  values.age_in_months = age.totalMonths
  values.age_in_days = age.totalDays
  values.age_detail = formatAgeDetail(age.years, age.months, age.days)
}

export default {
  onFieldChange(fieldname, values) {
    if (fieldname === 'date_of_birth') calculateAge(values)
    if (fieldname === 'phone_number') warnIfNotDigits(values.phone_number)

    // Desk always resets these on any occupation change (even back to
    // "Studying"/"Other"), so a stale value from an earlier choice never
    // resurfaces hidden behind depends_on.
    if (fieldname === 'occupation') {
      values.education = ''
      values.education_status = ''
      values.other_occupation = ''
    }

    // Type of disability only applies when Disability is "Yes".
    if (fieldname === 'disability' && values.disability !== 'Yes') values.type_of_disability = ''
  },
}

// Ports chw/common/doctype/family_members/family_members.js (the Desk
// form script) age calculation into the Vue app's diff-triggered hook
// contract - see doctype-hooks/index.js and DoctypeForm.vue. Without it the
// Vue form only showed an age after saving. Must give the same answer as
// the server's get_age_values() (dateutil.relativedelta), which recomputes
// it on save anyway.
// Also ports the Charity Assessment preview, following family_members.py's
// update_charity_assessment(), which recomputes it on every save.

import { toast } from 'frappe-ui'
import { warnIfNotDigits } from './utils'

// Same list and order as CHARITY_CRITERIA_FIELDS on the server.
const CHARITY_CRITERIA_FIELDS = [
  'charity_breadwinner_occupation',
  'charity_dependent_ratio',
  'charity_health_condition',
  'charity_living_conditions',
  'charity_disability_severity',
  'charity_mch_assessment',
]

// Some criteria only apply some of the time (mirrors each field's own
// depends_on in family_members.json) - a field hidden by its own condition
// must not count toward "every criterion answered" below, or the suggested
// % would never appear for a record that will never show that field.
const CHARITY_CRITERIA_APPLICABLE = {
  charity_disability_severity: (doc) => doc.is_the_person_currently_pregnant !== 'Yes',
  charity_mch_assessment: (doc) => doc.does_the_person_require_palliative_care !== 'Yes',
}

function applicableCharityFields(doc) {
  return CHARITY_CRITERIA_FIELDS.filter((f) => (CHARITY_CRITERIA_APPLICABLE[f] || (() => true))(doc))
}

export function charityPercentageBand(score) {
  if (score >= 20) return '>80%'
  if (score >= 17) return '60-80%'
  if (score >= 12) return '40-60%'
  if (score >= 7) return '20-40%'
  return '0-20%'
}

// Options are listed worst-need-first, so an answer scores its distance from
// the end of its own list (first = 4 ... last = 1); read from the doctype's
// options so a reworded option can't drift from the server's _option_score.
function optionScore(options, value) {
  if (!value) return 0
  const list = String(options || '').split('\n').filter(Boolean)
  const idx = list.indexOf(value)
  return idx >= 0 ? list.length - idx : 0
}

export function charityAssessment(doc, getOptions) {
  const applicable = applicableCharityFields(doc)
  const answered = applicable.filter((f) => doc[f])
  if (!answered.length) return { score: 0, band: '' }
  const score = applicable.reduce((sum, f) => sum + optionScore(getOptions(f), doc[f]), 0)
  // A band only once every criterion that applies to this record is
  // answered - a partial score would understate need and suggest too low a
  // charity %.
  return { score, band: answered.length === applicable.length ? charityPercentageBand(score) : '' }
}

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
  onFieldChange(fieldname, values, ctx) {
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

    // The last two don't carry a score themselves, but decide whether
    // Disability Severity / MCH Assessment apply at all (depends_on) - so
    // toggling either one can complete (or reopen) the suggested % on its own.
    if (
      CHARITY_CRITERIA_FIELDS.includes(fieldname) ||
      fieldname === 'is_the_person_currently_pregnant' ||
      fieldname === 'does_the_person_require_palliative_care'
    ) {
      const { score, band } = charityAssessment(values, (f) => ctx.getField(f)?.options)
      values.charity_assessment_score = score
      values.suggested_charity_percentage = band
    }
  },
}

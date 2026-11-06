// Ports chw/common/doctype/family_members/family_members.js (the Desk
// form script) age calculation into the Vue app's diff-triggered hook
// contract - see doctype-hooks/index.js and DoctypeForm.vue. Without it the
// Vue form only showed an age after saving. Must give the same answer as
// the server's get_age_values() (dateutil.relativedelta), which recomputes
// it on save anyway.

import { toast } from 'frappe-ui'
import { warnIfNotDigits } from './utils'
import { t } from '@/data/i18n'

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

function calculateAge(values) {
  const dob = parseLocalDate(values.date_of_birth)
  if (!dob) {
    // Cleared DOB: same as Desk - empty the derived fields so a stale age
    // isn't left behind; Age can then be typed by hand if DOB is unknown.
    values.age = ''
    return
  }

  const now = todayLocal()
  if (dob > now) {
    toast.warning(t('Date of Birth cannot be in the future.'))
    values.date_of_birth = ''
    values.age = ''
    return
  }

  const age = ageParts(dob, now)
  values.age = String(age.years)
}

// Cancer screening eligibility, as the form changes - same rule as the
// server's chw/cancer/eligibility.py (which sets it again on save): a woman
// aged 30-65, or a tobacco user of any age, unless a known cancer patient.
// Only while the Cancer programme is on, i.e. its section is shown.
const ELIGIBILITY_INPUTS = new Set(['gender', 'age', 'date_of_birth', 'tobacco_user', 'known_cancer_patient', 'cancer_eligibility_manual'])

function setCancerEligibility(values, ctx) {
  if (ctx.getField('cancer_family_member_details_section')?.hidden) return
  if (values.cancer_eligibility_manual) return
  const ageText = String(values.age ?? '').trim()
  const age = ageText ? parseInt(ageText, 10) : null
  const woman = values.gender === 'Female'
  let eligible = 'No'
  let reason
  if (values.known_cancer_patient === 'Yes') reason = t('Known cancer patient')
  else if (woman && age != null && age >= 30 && age <= 65) eligible = 'Yes'
  else if (values.tobacco_user === 'Yes') eligible = 'Yes'
  else if (woman) reason = age == null ? t('Age not known') : t('Age mismatch (not 30–65)')
  else reason = t('Not a woman aged 30–65 and not a tobacco user')
  values.cancer_screening_eligible = eligible
  values.cancer_not_eligible_reason = eligible === 'Yes' ? '' : reason
}

export default {
  onAfterLoad(values, ctx) {
    if (ctx.isNew) setCancerEligibility(values, ctx)
  },

  onFieldChange(fieldname, values, ctx) {
    if (fieldname === 'date_of_birth') calculateAge(values)
    if (ELIGIBILITY_INPUTS.has(fieldname)) setCancerEligibility(values, ctx)
    if (fieldname === 'phone_number') warnIfNotDigits(values.phone_number)
    // Age is typed only when the date of birth isn't known (it's read-only
    // once a DOB is set) - whole years, as the server checks on save.
    if (fieldname === 'age' && !values.date_of_birth) {
      const age = String(values.age ?? '').trim()
      if (age && (!/^\d+$/.test(age) || Number(age) > 120)) {
        toast.remove('chw-age-warning')
        toast.warning(t('Age must be a whole number of years (0 to 120), e.g. 45.'), { id: 'chw-age-warning' })
      }
    }

    // Desk always resets these on any occupation change (even back to
    // "Studying"/"Other"), so a stale value from an earlier choice never
    // resurfaces hidden behind depends_on.
    if (fieldname === 'occupation') {
      values.education = ''
      values.education_status = ''
      values.other_occupation = ''
    }

  },
}

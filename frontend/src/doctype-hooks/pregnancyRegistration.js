// Ports chw/common/doctype/pregnancy_registration/pregnancy_registration.js
// (the Desk form script) into the Vue app's hook contract - see
// doctype-hooks/index.js and DoctypeForm.vue. The derived values follow
// pregnancy_registration.py validate(), which recomputes them on save, so
// the form shows what will be saved.

import { addDays, daysBetween, today, warnIfNotDigits } from './utils'

// Python's divmod/floor division (Math.floor and a sign-safe remainder), so
// a future LMP reads "-1 weeks 6 days" like the server, not "-1 weeks -1 days".
function pogParts(lmp) {
  const days = daysBetween(lmp, today())
  const weeks = Math.floor(days / 7)
  return { weeks, days: days - weeks * 7 }
}

export function trimesterFor(weeks) {
  if (weeks <= 13) return 'First trimester'
  if (weeks <= 27) return 'Second trimester'
  return 'Third trimester'
}

function calculateFromLmp(values, ctx) {
  if (!values.lmp_date) {
    // Server: POG and trimester are emptied without an LMP; the EDD is
    // left as it was (Desk did nothing at all here).
    values.pog = ''
    values.trimester = ''
    return
  }
  values.estimated_date_of_delivery = addDays(values.lmp_date, 281)
  const { weeks, days } = pogParts(values.lmp_date)
  values.pog = `${weeks} weeks ${days} days`
  values.trimester = trimesterFor(weeks)
  // The server freezes this on the first save only - preview it on a new record.
  if (ctx.isNew) values.trimester_at_registration = values.trimester
}

// Python's round(x, 1): round-half-even on the exact binary value. Only
// quarters (.25/.75) are exact ties at one decimal; everything else is
// rounded correctly by toFixed.
export function pyRound1(x) {
  const q = x * 4
  if (Number.isInteger(q) && q % 2 !== 0) {
    const t = Math.floor(x * 10)
    return (t % 2 === 0 ? t : t + 1) / 10
  }
  return Number(x.toFixed(1))
}

// Python float() of a string: a plain decimal number, nothing else
// ("70kg" fails on the server, so no parseFloat here).
function pyFloat(value) {
  if (typeof value === 'number') return value
  const s = String(value ?? '').trim()
  return /^[+-]?(\d+\.?\d*|\.\d+)(e[+-]?\d+)?$/i.test(s) ? Number(s) : null
}

// calculate_bmi(): kg / m², 1 decimal; empty without a height or weight, or
// when weight (a Data field) isn't a number.
export function registrationBmi(height, weight) {
  if (!height || !weight) return null
  const weightKg = pyFloat(weight)
  if (weightKg == null) return null
  const heightM = Number(height) / 100
  return pyRound1(weightKg / heightM ** 2)
}

export default {
  getLinkQuery(fieldname) {
    if (fieldname === 'familymember_id') return { filters: { gender: 'Female' } }
    return null
  },

  onFieldChange(fieldname, values, ctx) {
    if (fieldname === 'lmp_date') calculateFromLmp(values, ctx)
    if (fieldname === 'phone_number') warnIfNotDigits(values.phone_number)
    if (fieldname === 'height' || fieldname === 'weight') {
      values.bmi_calculation = registrationBmi(values.height, values.weight)
    }
  },
}

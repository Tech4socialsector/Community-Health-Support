// Ports chw/common/doctype/preconception_reg_and_followup/
// preconception_reg_and_followup.js (the Desk form script) into the Vue
// app's hook contract - see doctype-hooks/index.js and DoctypeForm.vue.
// Row BMI follows the server's calculate_followup_bmi(), which recomputes it
// on every save, so the live value is the saved one.

import { today } from './utils'

// frappe.utils.flt: commas ignored, anything unparseable is 0.
function flt(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0
  const s = String(value ?? '').replace(/,/g, '').trim()
  return /^[+-]?(\d+\.?\d*|\.\d+)(e[+-]?\d+)?$/i.test(s) ? Number(s) : 0
}

// Python's round(x, 1) (half-even on exact .25/.75 ties), then str() -
// toFixed(1) alone would round 22.25 up where the server gives "22.2".
function pyRound1Str(x) {
  const q = x * 4
  if (Number.isInteger(q) && q % 2 !== 0) {
    const t = Math.floor(x * 10)
    return ((t % 2 === 0 ? t : t + 1) / 10).toFixed(1)
  }
  return x.toFixed(1)
}

// kg / (cm/100)², as a 1-decimal string; '' when height or weight is missing
// (or height reads as 0).
export function followupBmi(height, weight) {
  if (!height || !weight) return ''
  const heightM = flt(height) / 100
  return heightM ? pyRound1Str(flt(weight) / heightM ** 2) : ''
}

export default {
  onChildRowAdd(tableField, row) {
    // The visit is being logged as it happens - default it to today (the
    // field default usually already has).
    if (tableField === 'followup_visits' && !row.date_of_visit) row.date_of_visit = today()
  },

  onChildFieldChange(tableField, fieldname, row) {
    if (tableField === 'followup_visits' && (fieldname === 'height' || fieldname === 'weight')) {
      row.bmi = followupBmi(row.height, row.weight)
    }
  },
}

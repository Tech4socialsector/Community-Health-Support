// Ports chw/common/doctype/child_growth_monitoring/child_growth_monitoring.js
// (the Desk form script) into the Vue app's hook contract - see
// doctype-hooks/index.js and DoctypeForm.vue. Results must match what the
// controller (child_growth_monitoring.py) recomputes on save: age, age in
// months and care stage via relativedelta, and the next follow-up date.
//
// Not ported: Desk's onload Health Worker default (DoctypeForm.vue applies
// it generically) and its familymember_id -> date_of_birth lookup (the
// field's fetch_from already fills it).

import { addDays, addMonths, parseDate, today, toDateStr, warnIfNotDigits } from './utils'

const TABLE = 'growth_followup'
const STAGE_5Y_TO_11Y = '5 Years to 11 Years'

function getCareStage(ageInMonths) {
  if (ageInMonths <= 6) return '0-6 Months'
  if (ageInMonths <= 60) return '6 Months to 5 Years'
  if (ageInMonths <= 132) return STAGE_5Y_TO_11Y
  return 'Above 11 Years'
}

// Whole months from dob to date, counted the way the server's relativedelta
// does: the most months that can be added to dob (month-end clamped, so
// 31 Jan + 1 month = 28 Feb) without passing date.
function monthsBetween(dobStr, dateStr) {
  const dob = parseDate(dobStr)
  const date = parseDate(dateStr)
  let months = (date.getFullYear() - dob.getFullYear()) * 12 + (date.getMonth() - dob.getMonth())
  if (addMonths(toDateStr(dob), months) > toDateStr(date)) months -= 1
  return months
}

// Per-form state. Hook modules are singletons shared by every open form, so
// anything remembered between calls is keyed on that form's `values`.
const states = new WeakMap()
function stateFor(values, ctx) {
  let s = states.get(values)
  if (!s) {
    // A saved record's DOB is already accounted for; on a new one any DOB
    // that turns up is news.
    s = { dob: ctx?.isNew ? null : values.date_of_birth || null, calcSeq: 0, genSeq: 0 }
    states.set(values, s)
  }
  return s
}

// Desk's calculate_age. A future DOB is refused and cleared (Desk shows an
// error dialog); the clearing then comes back as a DOB change of its own,
// which empties the derived fields - again as in Desk.
function calculateAge(values, ctx) {
  if (!values.date_of_birth) {
    values.age = ''
    values.age_in_months = 0
    values.care_stage = ''
    return false
  }
  const now = today()
  if (values.date_of_birth > now) {
    ctx.toast.error('Invalid Date of Birth: Date of Birth cannot be in the future.')
    values.date_of_birth = ''
    return false
  }
  const ageInMonths = monthsBetween(values.date_of_birth, now)
  values.age = String(Math.floor(ageInMonths / 12))
  values.age_in_months = ageInMonths
  values.care_stage = getCareStage(ageInMonths)
  return true
}

// Malnutrition Category Master's interval for a classification (Normal /
// MAM / SAM); 30 days when it isn't set or can't be read, as on the server.
async function getIntervalDays(ctx, classification) {
  try {
    const res = await ctx.call('frappe.client.get_value', {
      doctype: 'Malnutrition Category Master',
      filters: classification,
      fieldname: 'interval_days',
    })
    return res?.interval_days || 30
  } catch {
    return 30
  }
}

// Pre-fill the table, only while it's empty: 0-5 years every "Normal"
// interval (the same monthly schedule as the retired Malnutrition doctype),
// then yearly visits from age 6 to 11 - the rows the server's
// generate_visit_schedule() would make.
async function generateVisitSchedule(values, ctx) {
  if (!values.date_of_birth || (values[TABLE] || []).length) return
  const state = stateFor(values, ctx)
  const seq = ++state.genSeq
  const dob = values.date_of_birth
  const intervalDays = await getIntervalDays(ctx, 'Normal')
  // Dropped if DOB changed or rows appeared while the interval was loading.
  if (seq !== state.genSeq || values.date_of_birth !== dob || (values[TABLE] || []).length) return

  const rows = []
  const endDate0to5y = addMonths(dob, 60)
  let visitDate = addDays(dob, intervalDays)
  while (visitDate <= endDate0to5y) {
    rows.push({ date: visitDate, stage: getCareStage(monthsBetween(dob, visitDate)), status: 'Pending' })
    visitDate = addDays(visitDate, intervalDays)
  }
  for (let m = 72; m <= 132; m += 12) {
    rows.push({ date: addMonths(dob, m), stage: STAGE_5Y_TO_11Y, status: 'Pending' })
  }
  values[TABLE] = rows
  await calculateNextFollowupDate(values, ctx)
}

async function calculateNextFollowupDate(values, ctx) {
  const current = values.next_followup_date
  const lastAuto = values.next_followup_date_auto
  if (current && lastAuto && current !== lastAuto) {
    // User has manually overridden the date; leave it alone.
    return
  }

  const datedRows = (values[TABLE] || []).filter((row) => row.date)
  if (!datedRows.length) return

  // Only the newest calculation may write - an older one still waiting on
  // an interval lookup must not overwrite it.
  const state = stateFor(values, ctx)
  const seq = ++state.calcSeq
  const setNextDate = (date) => {
    if (seq !== state.calcSeq) return
    values.next_followup_date = date
    values.next_followup_date_auto = date
  }

  // Next visit due is the earliest visit not yet marked Completed.
  const pendingRows = datedRows.filter((row) => row.status !== 'Completed')
  if (pendingRows.length) {
    setNextDate(pendingRows.reduce((min, row) => (row.date < min ? row.date : min), pendingRows[0].date))
    return
  }

  // All done: continue from the latest visit (first of equal dates, like
  // max() on the server) - yearly in the 5-11 stage, otherwise after the
  // interval for that visit's classification.
  const lastRow = datedRows.reduce((latest, row) => (row.date > latest.date ? row : latest), datedRows[0])
  if (lastRow.stage === STAGE_5Y_TO_11Y) {
    setNextDate(addMonths(lastRow.date, 12))
    return
  }
  if (lastRow.classification) {
    const intervalDays = await getIntervalDays(ctx, lastRow.classification)
    setNextDate(addDays(lastRow.date, intervalDays))
  } else {
    setNextDate(addDays(lastRow.date, 30))
  }
}

// Desk's set_row_classification, on the live row: oedema means SAM
// outright, otherwise MUAC (cm) < 11.5 SAM, < 12.5 MAM, else Normal; blank
// when neither is recorded.
function setRowClassification(row) {
  let classification = ''
  if (row.edema === 'Yes') {
    classification = 'SAM'
  } else if (row.muac !== undefined && row.muac !== null && row.muac !== '') {
    const muac = Number(row.muac)
    if (muac < 11.5) classification = 'SAM'
    else if (muac < 12.5) classification = 'MAM'
    else classification = 'Normal'
  }
  row.classification = classification
}

export default {
  onAfterLoad(values, ctx) {
    // Re-baseline after opening / saving, so a reloaded DOB isn't news.
    stateFor(values, ctx).dob = values.date_of_birth || null
  },

  // Desk's set_query: only children up to 11 years can be picked.
  getLinkQuery(fieldname) {
    if (fieldname === 'familymember_id') return { filters: { age_in_months: ['<=', 132] } }
    return null
  },

  onFieldChange(fieldname, values, ctx) {
    const state = stateFor(values, ctx)

    // Desk's date_of_birth handler. Compared against the last seen value on
    // every call rather than trusting `fieldname`: DOB arrives by fetch from
    // the family member together with name, village, phone ... and only one
    // of those may be reported. Our own writes fall through as no-ops.
    const dob = values.date_of_birth || null
    if (dob !== state.dob) {
      state.dob = dob
      if (calculateAge(values, ctx)) generateVisitSchedule(values, ctx)
    }

    if (fieldname === 'phone_number') warnIfNotDigits(values.phone_number)
  },

  onChildRowRemove(tableField, removedRows, values, ctx) {
    if (tableField === TABLE) calculateNextFollowupDate(values, ctx)
  },

  // Child Growth Followup's muac / edema / date / status handlers. The
  // classification this hook writes is deliberately not listened to.
  onChildFieldChange(tableField, fieldname, row, values, ctx) {
    if (tableField !== TABLE) return
    if (fieldname === 'muac' || fieldname === 'edema') {
      setRowClassification(row)
      calculateNextFollowupDate(values, ctx)
    } else if (fieldname === 'date' || fieldname === 'status') {
      calculateNextFollowupDate(values, ctx)
    }
  },
}

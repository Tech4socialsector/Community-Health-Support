// Ports chw/common/doctype/postpartum_reg_and_followup/
// postpartum_reg_and_followup.js (the Desk form script) into the Vue app's
// hook contract - see doctype-hooks/index.js and DoctypeForm.vue. The server
// never builds this schedule itself (validate() only inserts urgent rows and
// recomputes the summary fields), so without this port a record made in the
// Vue app would have no follow-up visits at all. The summary calculation
// mirrors the controller's set_next_visit_date(), so the live preview reads
// exactly like the saved values.
//
// Kept as Desk has it: no work on refresh (only row tinting, which rowClass
// does), and a row's date_of_visit change does not recalculate.

import { addDays, cached, formatDate, isOpenUrgent, RISK_ALERT_FIELD_CLASS, URGENT_ROW_CLASS } from './utils'

const TABLE = 'followup_visits'

// frappe.utils.flt: commas ignored, anything unparseable is 0. Same helpers
// as doctype-hooks/preconception.js's followupBmi - kept duplicated here as
// this file already duplicates its own DEFAULT_VISIT_SCHEDULE rather than
// share state across unrelated programs.
function flt(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0
  const s = String(value ?? '').replace(/,/g, '').trim()
  return /^[+-]?(\d+\.?\d*|\.\d+)(e[+-]?\d+)?$/i.test(s) ? Number(s) : 0
}

// Python's round(x, 1) (half-even on exact .25/.75 ties), then str().
function pyRound1Str(x) {
  const q = x * 4
  if (Number.isInteger(q) && q % 2 !== 0) {
    const t = Math.floor(x * 10)
    return ((t % 2 === 0 ? t : t + 1) / 10).toFixed(1)
  }
  return x.toFixed(1)
}

// kg / (cm/100)², as a 1-decimal string; '' when height or weight is missing
// (or height reads as 0). Mirrors the server's calculate_followup_bmi().
export function followupBmi(height, weight) {
  if (!height || !weight) return ''
  const heightM = flt(height) / 100
  return heightM ? pyRound1Str(flt(weight) / heightM ** 2) : ''
}
const SCHEDULE_METHOD = 'chw.common.doctype.postpartum_reg_and_followup.postpartum_reg_and_followup.get_visit_schedule'

// Last-resort fallback only, used if the Visit Schedule Master has no
// Postpartum rows configured yet - same as DEFAULT_VISIT_SCHEDULE in the
// .py/.js. (opens_day, closes_day) from the delivery date: visit 1 opens at
// delivery, visit 2 is the last week of the 6-week postpartum period.
const DEFAULT_VISIT_SCHEDULE = [
  [0, 7],
  [35, 42],
]
const DEFAULT_RISK_ALERT_DAYS = 1

// Per-form state. Hook modules are singletons shared by every open form, so
// anything remembered between calls is keyed on that form's `values`.
// ctx.call is only handed to each hook, so the latest one is kept here for
// the cached schedule fetch.
const states = new WeakMap()
function stateFor(values, ctx) {
  let s = states.get(values)
  if (!s) {
    s = { call: null, calcSeq: 0, genSeq: 0 }
    // The master is fetched once per open form, like a cached frappe.call.
    s.schedule = cached(async () => {
      const rows = await s.call(SCHEDULE_METHOD, {})
      if (rows && rows.length) return rows
      return DEFAULT_VISIT_SCHEDULE.map(([opens, closes]) => ({
        window_opens_day: opens,
        window_closes_day: closes,
        risk_alert_within_days: DEFAULT_RISK_ALERT_DAYS,
      }))
    })
    states.set(values, s)
  }
  if (ctx?.call) s.call = ctx.call
  return s
}

// The master's schedule; null (and a console note) if it can't be read -
// Desk then does nothing either, rather than laying out a guessed schedule.
async function getFullSchedule(values) {
  try {
    return await stateFor(values).schedule()
  } catch (e) {
    console.warn('Could not load the Postpartum visit schedule', e)
    return null
  }
}

// visit_number is 1-indexed, matching row position - row 1 is visit 1. No
// fixed cap: however many rows the master has is how many visits there are.
function getVisitWindow(visitNumber, scheduleRows) {
  if (visitNumber < 1 || visitNumber > scheduleRows.length) return null
  const row = scheduleRows[visitNumber - 1]
  return {
    start_offset: row.window_opens_day,
    end_offset: row.window_closes_day,
    risk_alert_within_days: row.risk_alert_within_days || DEFAULT_RISK_ALERT_DAYS,
  }
}

// 'YYYY-MM-DD' strings sort as dates. First of equal dates wins, like
// Python's min()/max() in the controller.
function earliest(rows) {
  return rows.reduce((best, row) => ((row.date_of_visit || '') < (best.date_of_visit || '') ? row : best), rows[0])
}
function latest(rows) {
  return rows.reduce((best, row) => ((row.date_of_visit || '') > (best.date_of_visit || '') ? row : best), rows[0])
}

// Live, not sticky - only the most recently COMPLETED visit counts, and
// either the mother's or the baby's condition being Risk makes it high risk,
// as in the server's currently_high_risk().
function currentlyHighRisk(rows) {
  const completed = rows.filter((row) => row.status === 'Completed')
  if (!completed.length) return false
  const last = latest(completed)
  return last.mother_condition === 'Risk' || last.baby_condition === 'Risk'
}

// "Date of Next Visit" is filled on the latest row only; "Next Visit Window"
// is a read-only range shown on every row - formatted as the server's
// formatdate() writes it.
function syncRowFields(values, windowStart, windowEnd) {
  const rows = values[TABLE] || []
  let display = ''
  if (windowStart && windowEnd) {
    display = `${formatDate(windowStart)} to ${formatDate(windowEnd)}`
    // An urgent-followup row's own window is the Risk alert deadline, not
    // this regular schedule's window - never overwritten by it.
    const lastRow = rows.length ? rows[rows.length - 1] : null
    if (lastRow && !lastRow.urgent_followup) lastRow.date_of_next_visit = windowEnd
  }
  for (const row of rows) {
    if (row.urgent_followup) continue
    row.next_visit_window = display
  }
}

function setSummary(values, nextDate, riskAlert) {
  values.next_visit_date = nextDate
  values.next_visit_date_auto = nextDate
  values.postpartum_risk_alert = riskAlert || ''
}

async function calculateNextVisitDate(values) {
  if (!values.delivery_date) return
  const state = stateFor(values)
  // Only the newest calculation may write - an older one still waiting on
  // the schedule must not overwrite it.
  const seq = ++state.calcSeq
  const rows = values[TABLE] || []

  // An open Urgent-tagged row always wins first - the row itself is only
  // inserted server-side on save, but once one exists the preview respects
  // it. "From" is the visit before it (the trigger), "To" its own date; the
  // urgent date already IS the early-visit signal, so no separate alert.
  const urgentRows = rows.filter(isOpenUrgent)
  if (urgentRows.length) {
    const pendingUrgent = earliest(urgentRows)
    const triggerIndex = rows.indexOf(pendingUrgent) - 1
    const triggerDate = triggerIndex >= 0 ? rows[triggerIndex].date_of_visit : pendingUrgent.date_of_visit
    setSummary(values, pendingUrgent.date_of_visit, '')
    syncRowFields(values, triggerDate, pendingUrgent.date_of_visit)
    return
  }

  // Risk and the visit number are taken before the schedule wait, as Desk does.
  // An urgent follow-up is an extra visit, not one of the numbered schedule
  // visits - excluded so completing it doesn't skip a window.
  const highRisk = currentlyHighRisk(rows)
  const visitNumber = rows.filter((row) => row.status === 'Completed' && !row.urgent_followup).length + 1

  const scheduleRows = await getFullSchedule(values)
  if (!scheduleRows || seq !== state.calcSeq || !values.delivery_date) return

  const window = getVisitWindow(visitNumber, scheduleRows)
  if (!window) {
    // Every scheduled visit has been completed.
    setSummary(values, null, '')
    syncRowFields(values, null, null)
    return
  }

  const windowStart = addDays(values.delivery_date, window.start_offset)
  const windowEnd = addDays(values.delivery_date, window.end_offset)
  // High Risk only - a nudge to visit early, counted from the window's
  // start (not its end). Blank otherwise.
  const riskAlert = highRisk ? `Visit by ${formatDate(addDays(windowStart, window.risk_alert_within_days))}` : ''
  setSummary(values, windowEnd, riskAlert)
  syncRowFields(values, windowStart, windowEnd)
}

// The whole schedule is known as soon as the delivery date is - one row per
// configured visit. Only ever runs on an empty table; with rows already
// there (generated earlier or added by hand) it just recalculates.
async function generateVisitSchedule(values) {
  if (!values.delivery_date || (values[TABLE] || []).length) {
    await calculateNextVisitDate(values)
    return
  }
  const state = stateFor(values)
  const seq = ++state.genSeq
  const scheduleRows = await getFullSchedule(values)
  if (!scheduleRows || seq !== state.genSeq) return
  // Re-checked after the wait so a quick second edit can't lay it out twice.
  const deliveryDate = values.delivery_date
  if (!deliveryDate || (values[TABLE] || []).length) {
    await calculateNextVisitDate(values)
    return
  }
  values[TABLE] = scheduleRows.map((row) => ({
    window_start_date: addDays(deliveryDate, row.window_opens_day),
    date_of_visit: addDays(deliveryDate, row.window_closes_day),
    status: 'Pending',
    urgent_followup: 0,
  }))
  await calculateNextVisitDate(values)
}

// A row added by hand still gets its target date from the delivery date for
// whichever position it lands in (Desk fills only date_of_visit here, not
// the window start). A row beyond the configured schedule gets nothing.
async function fillNewRowDate(row, values) {
  if (row.date_of_visit || !values.delivery_date) {
    await calculateNextVisitDate(values)
    return
  }
  const deliveryDate = values.delivery_date
  const visitNumber = (values[TABLE] || []).indexOf(row) + 1
  const scheduleRows = await getFullSchedule(values)
  if (!scheduleRows) return
  const window = getVisitWindow(visitNumber, scheduleRows)
  if (!window) return
  row.date_of_visit = addDays(deliveryDate, window.end_offset)
  await calculateNextVisitDate(values)
}

export default {
  onFieldChange(fieldname, values, ctx) {
    stateFor(values, ctx)
    // delivery_date is typed by hand (not fetched), so its own change event
    // is reliable; our own writes (next_visit_date ...) are ignored here.
    if (fieldname === 'delivery_date') generateVisitSchedule(values)
  },

  onChildRowAdd(tableField, row, idx, values, ctx) {
    stateFor(values, ctx)
    if (tableField === TABLE) fillNewRowDate(row, values)
  },

  onChildRowRemove(tableField, removedRows, values, ctx) {
    stateFor(values, ctx)
    if (tableField === TABLE) calculateNextVisitDate(values)
  },

  // Desk's Postpartum Followup status handler, plus the height/weight -> bmi
  // trigger (ported from Preconception's own hook - Desk never had it
  // either, see calculate_postpartum_followup_bmi). mother_condition /
  // baby_condition just re-tint rows, which rowClass does live.
  onChildFieldChange(tableField, fieldname, row, values, ctx) {
    stateFor(values, ctx)
    if (tableField !== TABLE) return
    if (fieldname === 'status') calculateNextVisitDate(values)
    if (fieldname === 'height' || fieldname === 'weight') row.bmi = followupBmi(row.height, row.weight)
  },

  // Same height/weight -> bmi calc, but fired on every keystroke rather
  // than waiting for the deferred diff watch above - so BMI fills in while
  // typing, not only once the field is left (blurred) or the form is saved.
  onChildFieldInput(tableField, fieldname, row) {
    if (tableField === TABLE && (fieldname === 'height' || fieldname === 'weight')) {
      row.bmi = followupBmi(row.height, row.weight)
    }
  },

  // Desk's highlight_risk_rows: only the open (not Completed) urgent row.
  rowClass(tableField, row) {
    return tableField === TABLE && isOpenUrgent(row) ? URGENT_ROW_CLASS : ''
  },

  fieldClass(fieldname) {
    return fieldname === 'postpartum_risk_alert' ? RISK_ALERT_FIELD_CLASS : ''
  },
}

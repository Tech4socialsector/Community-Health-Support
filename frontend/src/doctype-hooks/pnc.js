// Ports chw/common/doctype/pnc/pnc.js (the Desk form script) into the Vue
// app's hook contract - see doctype-hooks/index.js and DoctypeForm.vue.
// Records are entered from both Desk and this app, so the live results here
// must match Desk's and what pnc.py computes on save. The mother/baby visit
// rows in particular are only ever generated on the client (the server
// never adds the scheduled rows), so without this the Vue form saved PNC
// records with no schedule at all.

import { call } from 'frappe-ui'
import {
  addDays,
  cached,
  formatDate,
  isOpenUrgent,
  parseDate,
  RISK_ALERT_FIELD_CLASS,
  today,
  toDateStr,
  URGENT_ROW_CLASS,
  warnIfNotDigits,
} from './utils'

const TRACK_TABLES = ['mother', 'baby']

// Last-resort fallback, as in Desk and pnc.py, if the PNC Visit Interval
// Master has no Visit Schedule rows yet: (opens_day, closes_day) per visit.
const DEFAULT_VISIT_SCHEDULE = [
  [0, 7],
  [35, 42],
]
const DEFAULT_RISK_ALERT_DAYS = 1

// Through the whitelisted get_visit_schedule - the master's child table
// has no permission rules of its own, so it can't be listed directly. The
// schedule is one-time setup, so it's fetched once per session.
const getFullSchedule = cached(async () => {
  const rows = await call('chw.common.doctype.pnc.pnc.get_visit_schedule')
  if (rows && rows.length) return rows
  return DEFAULT_VISIT_SCHEDULE.map(([opens, closes]) => ({
    window_opens_day: opens,
    window_closes_day: closes,
    risk_alert_within_days: DEFAULT_RISK_ALERT_DAYS,
  }))
})

// visitNumber is 1-indexed by row position - row 1 is visit 1; past the
// last configured row there are no more visits.
function getVisitWindow(visitNumber, scheduleRows) {
  if (visitNumber < 1 || visitNumber > scheduleRows.length) return null
  const row = scheduleRows[visitNumber - 1]
  return {
    startOffset: Number(row.window_opens_day) || 0,
    endOffset: Number(row.window_closes_day) || 0,
    riskAlertWithinDays: Number(row.risk_alert_within_days) || DEFAULT_RISK_ALERT_DAYS,
  }
}

// The server compares rows with getdate(), which reads an empty date as
// today - mirrored so ties/ordering pick the same row.
function dateKey(value) {
  return toDateStr(parseDate(value)) || today()
}

// First item with the smallest key - Python's min() keeps the first of
// equal keys, which the Desk sort didn't guarantee.
function earliestBy(items, key) {
  return items.reduce((best, item) => (best === null || key(item) < key(best) ? item : best), null)
}

// Assign only on a real change, so recalculating with the same answer
// doesn't mark the form dirty or wake the change watchers again.
function setIfChanged(obj, field, value) {
  if ((obj[field] ?? null) !== (value ?? null)) obj[field] = value
}

// Mirrors _compute_track in pnc.py: one track per table (mother, baby).
function computeTrack(values, rows, scheduleRows) {
  // An open urgent row (inserted by the server on save after a Risk visit)
  // always wins on its table; its window runs from the row before it (the
  // Risk visit) to its own date, and the date itself is the alert.
  const urgent = earliestBy(rows.filter(isOpenUrgent), (row) => dateKey(row.date))
  if (urgent) {
    const triggerIndex = rows.indexOf(urgent) - 1
    const triggerDate = triggerIndex >= 0 ? rows[triggerIndex].date : urgent.date
    return { nextDate: urgent.date, windowStart: triggerDate, windowEnd: urgent.date, riskAlert: '', isUrgent: true }
  }

  // Each visit's window is a direct lookup in the master's schedule, not a
  // repeating interval from the last visit.
  const completedCount = rows.filter((row) => row.status === 'Completed').length
  const window = getVisitWindow(completedCount + 1, scheduleRows)
  if (!window) {
    // every visit on this table has been completed
    return { nextDate: null, windowStart: null, windowEnd: null, riskAlert: '', isUrgent: false }
  }

  const windowStart = addDays(values.date_of_delivery, window.startOffset)
  const windowEnd = addDays(values.date_of_delivery, window.endOffset)
  // High Risk only - a nudge to go early, counted from the window's start.
  const riskAlert =
    values.high_risk === 'Yes' ? `Visit by ${formatDate(addDays(windowStart, window.riskAlertWithinDays))}` : ''
  return { nextDate: windowEnd, windowStart, windowEnd, riskAlert, isUrgent: false }
}

// "Date of Next Visit" on the latest row only; "Next Visit Window" on
// every row of that table.
function syncRowFields(values, tableField, windowStart, windowEnd) {
  const rows = values[tableField] || []
  let display = ''
  if (windowStart && windowEnd) {
    display = `${formatDate(windowStart)} to ${formatDate(windowEnd)}`
    if (rows.length) setIfChanged(rows[rows.length - 1], 'date_of_next_visit', windowEnd)
  }
  rows.forEach((row) => setIfChanged(row, 'next_visit_window', display))
}

// Bumped per recalculation: a slower, older call must not overwrite the
// result of a newer one.
let calcSeq = 0

async function calculateNextPncVisitDate(values) {
  if (!values.date_of_delivery) return
  const seq = ++calcSeq
  let scheduleRows
  try {
    scheduleRows = await getFullSchedule()
  } catch {
    return
  }
  if (seq !== calcSeq || !values.date_of_delivery) return

  // Mother and baby are tracked independently against the same schedule
  // (both are checked on the same household visit); the shared Next PNC
  // Visit Date shows whichever track is due first.
  const motherTrack = computeTrack(values, values.mother || [], scheduleRows)
  const babyTrack = computeTrack(values, values.baby || [], scheduleRows)
  syncRowFields(values, 'mother', motherTrack.windowStart, motherTrack.windowEnd)
  syncRowFields(values, 'baby', babyTrack.windowStart, babyTrack.windowEnd)

  const candidates = [motherTrack, babyTrack].filter((t) => t.nextDate)
  if (!candidates.length) {
    // every scheduled visit, for both mother and baby, is complete
    setIfChanged(values, 'next_pnc_visit_date', null)
    setIfChanged(values, 'next_pnc_visit_date_auto', null)
    setIfChanged(values, 'pnc_visit_risk_alert', '')
    return
  }

  // An open urgent row on either track outranks an ordinary due date on
  // the other, even a sooner one - a fresh risk mustn't be buried behind a
  // routine visit.
  const urgentCandidates = candidates.filter((t) => t.isUrgent)
  const winner = earliestBy(urgentCandidates.length ? urgentCandidates : candidates, (t) => dateKey(t.nextDate))
  setIfChanged(values, 'next_pnc_visit_date', winner.nextDate)
  setIfChanged(values, 'next_pnc_visit_date_auto', winner.nextDate)
  setIfChanged(values, 'pnc_visit_risk_alert', winner.riskAlert || '')
}

let generateSeq = 0

// The whole schedule is known once the delivery date is: one row per
// configured visit on BOTH tables, same dates. Only on a fresh record - if
// either table already has rows, both are left alone and only the summary
// fields are recalculated.
async function generateVisitSchedule(values) {
  const deliveryDate = values.date_of_delivery
  const hasRows = () => (values.mother || []).length || (values.baby || []).length
  if (!deliveryDate || hasRows()) return calculateNextPncVisitDate(values)

  const seq = ++generateSeq
  let scheduleRows
  try {
    scheduleRows = await getFullSchedule()
  } catch {
    return
  }
  // The delivery date changed meanwhile, or rows appeared - don't add a
  // second schedule.
  if (seq !== generateSeq || values.date_of_delivery !== deliveryDate) return
  if (hasRows()) return calculateNextPncVisitDate(values)

  const mother = []
  const baby = []
  scheduleRows.forEach((row) => {
    const windowStart = addDays(deliveryDate, row.window_opens_day)
    const windowEnd = addDays(deliveryDate, row.window_closes_day)
    mother.push({ window_start_date: windowStart, date: windowEnd, status: 'Pending' })
    baby.push({ window_start_date: windowStart, date: windowEnd, status: 'Pending' })
  })
  values.mother = mother
  values.baby = baby
  return calculateNextPncVisitDate(values)
}

// A row added by hand still gets its target date from the delivery date
// (by its position in the schedule), so the CHW never sees a blank date.
// A row past the configured visits gets none.
async function fillNewRowDate(row, idx, values) {
  if (row.date || !values.date_of_delivery) return calculateNextPncVisitDate(values)
  let scheduleRows
  try {
    scheduleRows = await getFullSchedule()
  } catch {
    return
  }
  const window = getVisitWindow(idx + 1, scheduleRows)
  if (!window || row.date || !values.date_of_delivery) return
  row.date = addDays(values.date_of_delivery, window.endOffset)
  return calculateNextPncVisitDate(values)
}

export default {
  // health_worker_name is defaulted generically for every doctype (see
  // applyCurrentHealthWorkerDefault in DoctypeForm.vue), and Desk's
  // refresh only repainted row highlights, which rowClass does reactively -
  // so no onLoad / onAfterLoad here. Desk's birth_registration_id handler
  // only waited for date_of_delivery to be fetched; that fetch fires
  // onFieldChange('date_of_delivery') here, which covers it.

  onFieldChange(fieldname, values) {
    if (fieldname === 'date_of_delivery') return generateVisitSchedule(values)
    if (fieldname === 'high_risk') return calculateNextPncVisitDate(values)
    if (fieldname === 'phone_number') warnIfNotDigits(values.phone_number)
  },

  // Only status and the condition fields matter; everything this module
  // writes into rows (date, next_visit_window, date_of_next_visit) falls
  // through here, so its echoes are ignored.
  onChildFieldChange(tableField, fieldname, row, values) {
    if (!TRACK_TABLES.includes(tableField)) return
    if (fieldname === 'status') return calculateNextPncVisitDate(values)
    const conditionField = tableField === 'mother' ? 'patient_condition' : 'baby_condition'
    if (fieldname === conditionField) {
      // high_risk has no entry point of its own on the form - a Risk
      // finding on either table raises it (never lowers it), as on save.
      if (row[conditionField] === 'Risk') values.high_risk = 'Yes'
      return calculateNextPncVisitDate(values)
    }
  },

  onChildRowAdd(tableField, row, idx, values) {
    if (TRACK_TABLES.includes(tableField)) return fillNewRowDate(row, idx, values)
  },

  onChildRowRemove(tableField, removedRows, values) {
    if (TRACK_TABLES.includes(tableField)) return calculateNextPncVisitDate(values)
  },

  // Only the currently open urgent follow-up row is tinted - not the
  // Risk visit that triggered it, nor an urgent row already completed.
  rowClass(tableField, row) {
    return TRACK_TABLES.includes(tableField) && isOpenUrgent(row) ? URGENT_ROW_CLASS : ''
  },

  fieldClass(fieldname) {
    return fieldname === 'pnc_visit_risk_alert' ? RISK_ALERT_FIELD_CLASS : ''
  },
}

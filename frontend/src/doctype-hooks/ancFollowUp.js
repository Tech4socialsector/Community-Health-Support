// Ports chw/common/doctype/anc_follow_up/anc_follow_up.js (the Desk form
// script) into the Vue app's hook contract - see doctype-hooks/index.js and
// DoctypeForm.vue. Records are entered from both Desk and this app, so the
// live results here must match Desk's and what anc_follow_up.py computes on
// save. The Nurse visit schedule in particular is only ever generated on the
// client (the server never adds those rows), so without this the Vue form
// saved ANC records with no schedule at all.
//
// The three follow-up tables describe the same patient, recorded by a
// different staff type. LMP/POG sync and urgent-row highlighting apply to
// all three, but the monthly-window schedule (rows, Next ANC Visit Date,
// risk alert, urgent chain) is driven by the Nurse table alone.

import { call } from 'frappe-ui'
import {
  addDays,
  daysBetween,
  formatDate,
  isOpenUrgent,
  parseDate,
  pogText,
  RISK_ALERT_FIELD_CLASS,
  today,
  toDateStr,
  URGENT_ROW_CLASS,
  warnIfNotDigits,
  cached,
} from './utils'

const FOLLOWUP_TABLE_FIELDS = ['anc_followup', 'anc_followup_for_nurse', 'anc_followup_for_docter']
const NURSE_TABLE_FIELD = 'anc_followup_for_nurse'

// Same fallbacks as get_window_policy() in both Desk and the server.
const DEFAULT_WINDOW_DAYS = 30
const DEFAULT_VISITS_PER_WINDOW = 1
const DEFAULT_RISK_ALERT_DAYS = 7
const DEFAULT_AUTOMATIC_WINDOW_COUNT = 6

// Not cached: high_risk is raised on the Pregnancy Registration by this
// very form's save (sync_patient_condition_to_pregnancy), so a stale copy
// would hide the risk alert until the page is reloaded.
async function getPregnancyInfo(pregnantId) {
  const res = await call('frappe.client.get_value', {
    doctype: 'Pregnancy Registration',
    filters: pregnantId,
    fieldname: ['lmp_date', 'high_risk'],
  })
  return res || {}
}

// ANC Visit Interval Master is a one-time-setup Single - one policy for
// every patient - so it's fetched once per session.
const getWindowPolicy = cached(async () => {
  const msg =
    (await call('frappe.client.get_value', {
      doctype: 'ANC Visit Interval Master',
      filters: 'ANC Visit Interval Master',
      fieldname: ['interval_days', 'visits_required_per_window', 'risk_alert_within_days', 'automatic_window_count'],
    })) || {}
  return {
    windowDays: Number(msg.interval_days) || DEFAULT_WINDOW_DAYS,
    visitsPerWindow: Number(msg.visits_required_per_window) || DEFAULT_VISITS_PER_WINDOW,
    alertWithinDays: Number(msg.risk_alert_within_days) || DEFAULT_RISK_ALERT_DAYS,
    automaticWindowCount: Number(msg.automatic_window_count) || DEFAULT_AUTOMATIC_WINDOW_COUNT,
  }
})

// The server compares rows with getdate(), which reads an empty date as
// today - mirrored so ties/ordering pick the same row.
function dateKey(value) {
  return toDateStr(parseDate(value)) || today()
}

// First row with the smallest / largest date - Python's min()/max() keep
// the first of equal keys, which the Desk sort didn't guarantee.
function earliestBy(rows, key) {
  return rows.reduce((best, row) => (best === null || key(row) < key(best) ? row : best), null)
}
function latestBy(rows, key) {
  return rows.reduce((best, row) => (best === null || key(row) > key(best) ? row : best), null)
}

function getWindowIndex(referenceDate, lmpDate, windowDays) {
  const daysElapsed = daysBetween(lmpDate, referenceDate)
  if (daysElapsed < 0) return 1
  return Math.floor(daysElapsed / windowDays) + 1
}

// A window only closes once its quota of completed visits is met.
function getCurrentWindow(startingWindow, completedCount, visitsPerWindow) {
  let window = startingWindow
  let remaining = completedCount
  while (remaining >= visitsPerWindow) {
    remaining -= visitsPerWindow
    window += 1
  }
  return window
}

// Assign only on a real change, so recalculating with the same answer
// doesn't mark the form dirty or wake the change watchers again.
function setIfChanged(obj, field, value) {
  if ((obj[field] ?? null) !== (value ?? null)) obj[field] = value
}

// "Date of Next Visit" (last row only) and "Next Visit Window" (every row)
// are filled on the Nurse table only - Volunteer's and Doctor's are left to
// manual entry, as on the server.
function syncChildRowFields(values, windowStart, windowEnd) {
  const display = windowStart && windowEnd ? `${formatDate(windowStart)} to ${formatDate(windowEnd)}` : ''
  const rows = values[NURSE_TABLE_FIELD] || []
  if (windowStart && windowEnd && rows.length) {
    setIfChanged(rows[rows.length - 1], 'date_of_next_visit', windowEnd)
  }
  rows.forEach((row) => setIfChanged(row, 'next_visit_window', display))
}

function setNextVisit(values, date, riskAlert) {
  setIfChanged(values, 'next_anc_visit_date', date)
  setIfChanged(values, 'next_anc_visit_date_auto', date)
  setIfChanged(values, 'next_anc_visit_risk_alert', riskAlert || '')
}

// An open urgent row (inserted by the server on save after a Risk visit)
// always wins - the preview must respect it rather than recompute over it.
// Its window runs from the row before it (the Risk visit) to its own date.
function getPendingUrgent(values) {
  const rows = values[NURSE_TABLE_FIELD] || []
  const urgent = earliestBy(rows.filter(isOpenUrgent), (row) => dateKey(row.date))
  if (!urgent) return null
  const triggerIndex = rows.indexOf(urgent) - 1
  const triggerDate = triggerIndex >= 0 ? rows[triggerIndex].date : urgent.date
  return { date: urgent.date, triggerDate }
}

// Bumped per recalculation: a slower, older call must not overwrite the
// result of a newer one.
let calcSeq = 0

async function calculateNextAncVisitDate(values) {
  const seq = ++calcSeq

  if (values.status === 'Closed') {
    // She's delivered - no more ANC visits are due.
    setNextVisit(values, null, '')
    syncChildRowFields(values, null, null)
    return
  }
  if (!values.pregnant_id) return

  const urgent = getPendingUrgent(values)
  if (urgent) {
    // The urgent date itself is the early-visit signal - no alert on top.
    setNextVisit(values, urgent.date, '')
    syncChildRowFields(values, urgent.triggerDate, urgent.date)
    return
  }

  let info, policy
  try {
    info = await getPregnancyInfo(values.pregnant_id)
    if (!info.lmp_date) return
    policy = await getWindowPolicy()
  } catch {
    return
  }
  if (seq !== calcSeq) return

  const { windowDays, visitsPerWindow, alertWithinDays, automaticWindowCount } = policy
  const nurseRows = values[NURSE_TABLE_FIELD] || []
  const completedCount = nurseRows.filter((row) => row.status === 'Completed').length
  // Windows count from when the record was created (today for a new one),
  // exactly as the server's set_next_anc_visit_date does.
  const startingWindow = getWindowIndex(values.creation || today(), info.lmp_date, windowDays)
  const currentWindow = getCurrentWindow(startingWindow, completedCount, visitsPerWindow)
  const windowStart = addDays(info.lmp_date, (currentWindow - 1) * windowDays)
  const windowEnd = addDays(windowStart, windowDays)

  // High Risk only - a nudge to visit early within the window; the due
  // date itself is the same either way.
  const riskAlert = info.high_risk === 'Yes' ? `Visit by ${formatDate(addDays(windowStart, alertWithinDays))}` : ''

  if (currentWindow <= automaticWindowCount) {
    setNextVisit(values, windowEnd, riskAlert)
    syncChildRowFields(values, windowStart, windowEnd)
    return
  }

  // Manual phase: the Nurse row with the latest visit date carries the
  // real "Date of Next Visit". Checked in the server's order (no recorded
  // date first, then a hand-edited override) so the preview doesn't change
  // on save - Desk checked the override first.
  const manualRows = nurseRows.filter((row) => row.date_of_next_visit)
  if (!manualRows.length) {
    // Never blank: suggest her current window until a date is recorded.
    setNextVisit(values, windowEnd, riskAlert)
    syncChildRowFields(values, windowStart, windowEnd)
    return
  }

  const current = values.next_anc_visit_date
  const lastAuto = values.next_anc_visit_date_auto
  if (current && lastAuto && dateKey(current) !== dateKey(lastAuto)) {
    // Hand-edited date: leave it alone - no window or alert to show.
    setIfChanged(values, 'next_anc_visit_risk_alert', '')
    syncChildRowFields(values, null, null)
    return
  }

  const latestRow = latestBy(manualRows, (row) => dateKey(row.date))
  // A typed date isn't a calculated window - no range or alert.
  setNextVisit(values, latestRow.date_of_next_visit, '')
  syncChildRowFields(values, null, null)
}

let generateSeq = 0

// Lays out the remaining automatic-phase monthly windows as Nurse rows the
// first time a pregnancy is picked - only on an empty Nurse table, and not
// at all if the Nurse table has been hidden via Customize Form.
async function generateVisitSchedule(values, ctx) {
  const nurseField = ctx.getField(NURSE_TABLE_FIELD)
  const nurseHidden = ctx.meta && (!nurseField || !!nurseField.hidden)
  const pregnantId = values.pregnant_id
  if (!pregnantId || nurseHidden || (values[NURSE_TABLE_FIELD] || []).length) {
    return calculateNextAncVisitDate(values)
  }

  const seq = ++generateSeq
  let info, policy
  try {
    info = await getPregnancyInfo(pregnantId)
    if (!info.lmp_date) return
    policy = await getWindowPolicy()
  } catch {
    return
  }
  // The pregnancy changed meanwhile, or rows appeared (another generation
  // or a hand-added row) - don't add a second schedule.
  if (seq !== generateSeq || values.pregnant_id !== pregnantId) return
  if ((values[NURSE_TABLE_FIELD] || []).length) return calculateNextAncVisitDate(values)

  const { windowDays, automaticWindowCount } = policy
  // A late registration (already past the automatic phase) gets no rows -
  // she starts straight in the manual phase.
  const startingWindow = getWindowIndex(today(), info.lmp_date, windowDays)
  const rows = []
  for (let idx = startingWindow; idx <= automaticWindowCount; idx++) {
    const windowStart = addDays(info.lmp_date, (idx - 1) * windowDays)
    const windowEnd = addDays(windowStart, windowDays)
    rows.push({
      window_start_date: windowStart,
      date: windowEnd,
      status: 'Pending',
      lmp_date: info.lmp_date,
      pog_weeks: pogText(info.lmp_date, windowEnd),
    })
  }
  values[NURSE_TABLE_FIELD] = [...(values[NURSE_TABLE_FIELD] || []), ...rows]
  return calculateNextAncVisitDate(values)
}

// LMP Date and POG at that visit are reference info derived from the
// pregnancy's LMP - the same values the server writes on save. Reads
// row.date after the fetch, so an out-of-order reply still writes the
// latest date's POG.
async function syncRowPog(row, values) {
  if (!values.pregnant_id) return
  let info
  try {
    info = await getPregnancyInfo(values.pregnant_id)
  } catch {
    return
  }
  if (!info.lmp_date) return
  setIfChanged(row, 'lmp_date', info.lmp_date)
  setIfChanged(row, 'pog_weeks', row.date ? pogText(info.lmp_date, row.date) : '')
}

// Volunteer/Doctor rows get their date from the field's "Today" default,
// which doesn't count as a date change - so LMP and POG are filled the
// moment the row is added, like the Nurse schedule rows already are.
async function fillNewRowPregnancyInfo(row, values) {
  if (!values.pregnant_id) return
  let info
  try {
    info = await getPregnancyInfo(values.pregnant_id)
  } catch {
    return
  }
  if (!info.lmp_date) return
  setIfChanged(row, 'lmp_date', info.lmp_date)
  setIfChanged(row, 'pog_weeks', pogText(info.lmp_date, row.date || today()))
}

export default {
  // health_worker_name is defaulted generically for every doctype (see
  // applyCurrentHealthWorkerDefault in DoctypeForm.vue), and Desk's
  // refresh only repainted row highlights, which rowClass does reactively -
  // so no onLoad / onAfterLoad here.

  onFieldChange(fieldname, values, ctx) {
    if (fieldname === 'pregnant_id') return generateVisitSchedule(values, ctx)
    if (fieldname === 'phone_number') warnIfNotDigits(values.phone_number)
  },

  // Only date and status matter; everything this module writes into rows
  // (lmp_date, pog_weeks, next_visit_window, date_of_next_visit) falls
  // through here, so its echoes are ignored.
  onChildFieldChange(tableField, fieldname, row, values) {
    if (!FOLLOWUP_TABLE_FIELDS.includes(tableField)) return
    const drivesSchedule = tableField === NURSE_TABLE_FIELD
    if (fieldname === 'date') {
      syncRowPog(row, values)
      if (drivesSchedule) return calculateNextAncVisitDate(values)
    }
    if (fieldname === 'status' && drivesSchedule) return calculateNextAncVisitDate(values)
  },

  // Desk registered these on the parent doctype, where Frappe never fires
  // them; ported as intended. Nurse rows are added with no date (no
  // default), so there's nothing to fill there.
  onChildRowAdd(tableField, row, idx, values) {
    if (tableField === 'anc_followup' || tableField === 'anc_followup_for_docter') {
      return fillNewRowPregnancyInfo(row, values)
    }
  },

  onChildRowRemove(tableField, removedRows, values) {
    if (tableField === NURSE_TABLE_FIELD) return calculateNextAncVisitDate(values)
  },

  // Only the currently open urgent follow-up row is tinted - not the
  // Risk visit that triggered it, nor an urgent row already completed.
  rowClass(tableField, row) {
    return FOLLOWUP_TABLE_FIELDS.includes(tableField) && isOpenUrgent(row) ? URGENT_ROW_CLASS : ''
  },

  fieldClass(fieldname) {
    return fieldname === 'next_anc_visit_risk_alert' ? RISK_ALERT_FIELD_CLASS : ''
  },
}

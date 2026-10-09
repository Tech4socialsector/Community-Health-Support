// Ports chw/common/doctype/child_6w_to_1_year_reg_and_followup/
// child_6w_to_1_year_reg_and_followup.js (the Desk form script) into the Vue
// app's hook contract - see doctype-hooks/index.js and DoctypeForm.vue.
// The server never builds this schedule itself (validate() only inserts
// urgent rows and recomputes the summary fields), so without this port a
// record made in the Vue app would have no follow-up visits at all. The
// summary calculation mirrors the controller's set_next_visit_date(), so the
// live preview reads exactly like the saved values.

import { addDays, cached, formatDate, isOpenUrgent, RISK_ALERT_FIELD_CLASS, URGENT_ROW_CLASS } from './utils'

const TABLE = 'followup_visits'
const SCHEDULE_METHOD =
  'chw.common.doctype.child_6w_to_1_year_reg_and_followup.child_6w_to_1_year_reg_and_followup.get_visit_schedule'

// Last-resort fallback only, used if Child 6w-1y Visit Interval Master
// hasn't been configured yet - same table as DEFAULT_VISIT_SCHEDULE in the
// .py/.js. (label, opens_day, closes_day) from the child's date of birth.
const DEFAULT_VISIT_SCHEDULE = [
  ['6th Week', 35, 42],
  ['10th Week', 63, 70],
  ['12th Week', 77, 84],
  ['14th Week', 91, 98],
  ['6th Month', 150, 180],
  ['9th Month', 240, 270],
  ['12th Month', 330, 360],
  ['18th Month', 510, 540],
]
const DEFAULT_RISK_ALERT_DAYS = 7

// Per-form state. Hook modules are singletons shared by every open form, so
// anything remembered between calls is keyed on that form's `values`.
// ctx.call is only handed to each hook, so the latest one is kept here for
// the cached schedule fetch.
const states = new WeakMap()
function stateFor(values, ctx) {
  let s = states.get(values)
  if (!s) {
    s = {
      call: null,
      calcSeq: 0,
      genSeq: 0,
      // Last seen schedule anchors - see onFieldChange.
      dob: values.date_of_birth || null,
      deliveryDate: values.delivery_date || null,
    }
    // The master is fetched once per open form, like a cached frappe.call.
    s.schedule = cached(async () => {
      const rows = await s.call(SCHEDULE_METHOD, {})
      if (rows && rows.length) return rows
      return DEFAULT_VISIT_SCHEDULE.map(([label, opens, closes]) => ({
        milestone_label: label,
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
    console.warn('Could not load the Child 6w-1y visit schedule', e)
    return null
  }
}

// visit_number is 1-indexed, matching row position - row 1 is visit 1. No
// fixed cap: however many rows the master has is how many visits there are.
function getVisitWindow(visitNumber, scheduleRows) {
  if (visitNumber < 1 || visitNumber > scheduleRows.length) return null
  const row = scheduleRows[visitNumber - 1]
  return {
    milestone_label: row.milestone_label,
    start_offset: row.window_opens_day,
    end_offset: row.window_closes_day,
    risk_alert_within_days: row.risk_alert_within_days || DEFAULT_RISK_ALERT_DAYS,
  }
}

// Date of Birth (fetched from a linked Birth Registration) is preferred;
// Delivery Date anchors the schedule whenever no Birth Registration is linked.
function getBirthDate(values) {
  return values.date_of_birth || values.delivery_date
}

// 'YYYY-MM-DD' strings sort as dates. First of equal dates wins, like
// Python's min()/max() in the controller.
function earliest(rows) {
  return rows.reduce((best, row) => ((row.date_of_visit || '') < (best.date_of_visit || '') ? row : best), rows[0])
}
function latest(rows) {
  return rows.reduce((best, row) => ((row.date_of_visit || '') > (best.date_of_visit || '') ? row : best), rows[0])
}

// Live, not sticky - only the most recently COMPLETED visit's own Baby
// Condition counts, as in the server's currently_high_risk().
function currentlyHighRisk(rows) {
  const completed = rows.filter((row) => row.status === 'Completed')
  if (!completed.length) return false
  return latest(completed).baby_condition === 'Risk'
}

// "Date of Next Visit" is filled on the latest row only; "Next Visit Window"
// is a read-only range shown on every row - formatted as the server's
// formatdate() writes it.
function syncRowFields(values, windowStart, windowEnd) {
  const rows = values[TABLE] || []
  let display = ''
  if (windowStart && windowEnd) {
    display = `${formatDate(windowStart)} to ${formatDate(windowEnd)}`
    if (rows.length) rows[rows.length - 1].date_of_next_visit = windowEnd
  }
  for (const row of rows) row.next_visit_window = display
}

function setSummary(values, nextDate, riskAlert) {
  values.next_visit_date = nextDate
  values.next_visit_date_auto = nextDate
  values.child_risk_alert = riskAlert || ''
}

async function calculateNextVisitDate(values) {
  const birthDate = getBirthDate(values)
  if (!birthDate) return
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

  const scheduleRows = await getFullSchedule(values)
  if (!scheduleRows || seq !== state.calcSeq) return

  const currentRows = values[TABLE] || []
  const completedCount = currentRows.filter((row) => row.status === 'Completed').length
  const window = getVisitWindow(completedCount + 1, scheduleRows)
  if (!window) {
    // Every configured visit has been completed - done for this child.
    setSummary(values, null, '')
    syncRowFields(values, null, null)
    return
  }

  const windowStart = addDays(birthDate, window.start_offset)
  const windowEnd = addDays(birthDate, window.end_offset)
  // High Risk only - a nudge to visit early, counted from the window's
  // start (not its end). Blank otherwise.
  const riskAlert = currentlyHighRisk(currentRows)
    ? `Visit by ${formatDate(addDays(windowStart, window.risk_alert_within_days))}`
    : ''
  setSummary(values, windowEnd, riskAlert)
  syncRowFields(values, windowStart, windowEnd)
}

// The whole schedule is known as soon as the birth date is - one row per
// configured visit, laid out at once. Only ever runs on an empty table; with
// rows already there (generated earlier or added by hand) it just
// recalculates the summary fields.
async function generateVisitSchedule(values) {
  const birthDate = getBirthDate(values)
  if (!birthDate || (values[TABLE] || []).length) {
    await calculateNextVisitDate(values)
    return
  }
  const state = stateFor(values)
  const seq = ++state.genSeq
  const scheduleRows = await getFullSchedule(values)
  if (!scheduleRows || seq !== state.genSeq) return
  // Re-checked after the wait: two triggers in quick succession (opening
  // the form, then the fetched date of birth) must not lay it out twice.
  const anchor = getBirthDate(values)
  if (!anchor || (values[TABLE] || []).length) {
    await calculateNextVisitDate(values)
    return
  }
  values[TABLE] = scheduleRows.map((row) => ({
    milestone_label: row.milestone_label,
    window_start_date: addDays(anchor, row.window_opens_day),
    date_of_visit: addDays(anchor, row.window_closes_day),
    status: 'Pending',
    urgent_followup: 0,
  }))
  await calculateNextVisitDate(values)
}

// A row added by hand still gets its target date, window start and
// milestone label from the birth date, for whichever position it lands in -
// the CHW never sees a blank row with no suggested date. A row beyond the
// configured schedule gets nothing (and, as in Desk, no recalculation).
async function fillNewRowDate(row, values) {
  const birthDate = getBirthDate(values)
  if (row.date_of_visit || !birthDate) {
    await calculateNextVisitDate(values)
    return
  }
  const visitNumber = (values[TABLE] || []).indexOf(row) + 1
  const scheduleRows = await getFullSchedule(values)
  if (!scheduleRows) return
  const window = getVisitWindow(visitNumber, scheduleRows)
  if (!window) return
  row.window_start_date = addDays(birthDate, window.start_offset)
  row.date_of_visit = addDays(birthDate, window.end_offset)
  row.milestone_label = window.milestone_label
  await calculateNextVisitDate(values)
}

export default {
  // Desk refresh: build the schedule if the table is still empty (a no-op
  // otherwise, beyond recalculating) - on every open and after each save,
  // since a fetched date of birth may never raise a change of its own.
  onAfterLoad(values, ctx) {
    const state = stateFor(values, ctx)
    state.dob = values.date_of_birth || null
    state.deliveryDate = values.delivery_date || null
    generateVisitSchedule(values)
  },

  onFieldChange(fieldname, values, ctx) {
    const state = stateFor(values, ctx)
    // Desk's date_of_birth / delivery_date (and birth_registration_id, which
    // fetches date_of_birth) handlers. Compared against the last seen value
    // on every call rather than trusting `fieldname`: a fetch fills several
    // fields in one go and only one of them may be reported. Our own writes
    // (next_visit_date, child_risk_alert ...) fall through as no-ops.
    const dob = values.date_of_birth || null
    const deliveryDate = values.delivery_date || null
    if (dob !== state.dob || deliveryDate !== state.deliveryDate) {
      state.dob = dob
      state.deliveryDate = deliveryDate
      generateVisitSchedule(values)
    }
  },

  onChildRowAdd(tableField, row, idx, values, ctx) {
    stateFor(values, ctx)
    if (tableField === TABLE) fillNewRowDate(row, values)
  },

  onChildRowRemove(tableField, removedRows, values, ctx) {
    stateFor(values, ctx)
    if (tableField === TABLE) calculateNextVisitDate(values)
  },

  // Desk's Child 6w to 1 Year Followup date_of_visit / status handlers. The
  // fields this hook writes on rows (next_visit_window, date_of_next_visit,
  // window_start_date, milestone_label) are deliberately not listened to.
  onChildFieldChange(tableField, fieldname, row, values, ctx) {
    stateFor(values, ctx)
    if (tableField !== TABLE) return
    if (fieldname === 'date_of_visit' || fieldname === 'status') calculateNextVisitDate(values)
  },

  // Desk's highlight_risk_rows: only the open (not Completed) urgent row.
  rowClass(tableField, row) {
    return tableField === TABLE && isOpenUrgent(row) ? URGENT_ROW_CLASS : ''
  },

  fieldClass(fieldname) {
    return fieldname === 'child_risk_alert' ? RISK_ALERT_FIELD_CLASS : ''
  },
}

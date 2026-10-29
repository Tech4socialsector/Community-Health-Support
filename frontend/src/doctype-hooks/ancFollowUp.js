// Ports chw/common/doctype/anc_follow_up/anc_follow_up.js (the Desk form
// script) into the Vue app's hook contract - see doctype-hooks/index.js and
// DoctypeForm.vue. Records are entered from both Desk and this app, so the
// live results here must match Desk's and what anc_follow_up.py computes on
// save. The Volunteer visit schedule in particular is only ever generated
// on the client (the server never adds those rows), so without this the
// Vue form saved ANC records with no schedule at all.
//
// The three follow-up tables describe the same patient, recorded by a
// different staff type. LMP/POG sync and urgent-row highlighting apply to
// all three, but the monthly-window schedule (rows, Next ANC Visit Date,
// risk alert, urgent chain) is driven by the Volunteer table alone.

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
} from './utils'

const FOLLOWUP_TABLE_FIELDS = ['anc_followup', 'anc_followup_for_nurse', 'anc_followup_for_docter']
const VOLUNTEER_TABLE_FIELD = 'anc_followup'

// Every Volunteer row field except the ones this module (or the schedule
// generator) fills in itself - once any one of these actually holds
// something, the visit has been recorded, so Status flips to Completed on
// its own instead of also asking the volunteer to flip the dropdown by
// hand. Clearing a field back to blank doesn't walk Completed back - that's
// an edit to a recorded visit, not an undone one. Mirrors
// VOLUNTEER_VISIT_CONTENT_FIELDS in anc_follow_up.py and anc_follow_up.js.
const VOLUNTEER_VISIT_CONTENT_FIELDS = [
  'month', 'bp', 'weight', 'anemia', 'edema', 'grbs', 'tt', 'hemoglobin_level', 'monthly_checkup', 'ironcal',
  'any_other_complaitsremark', 'hr', 'rr', 'temp', 'height', 'bmi', 'mch_nurse_noti_ed_of_abnormal_vital_signs',
  'feeling_well', 'good_energy', 'pink_tongue', 'good_fetal_movement', 'vaginal_bleeding', 'leaking_fluid',
  'severe_abdominal_pain', 'severe_headacheblurred_vision', 'swelling_of_handsface', 'fever',
  'extreme_dizziness_or_fatigue', 'reduced_fetal_movement', 'itching_of_palms_or_soles_of_feet_especially_at_night',
  'palpitations', 'mch_nurse_notified_of_danger_signs', 'problems_identified', 'support_care_provided',
  'folic_acid_counseling_1st_trimester', 'trimester_specific_care_handout', 'pregnancy_exercises_handout',
  'nutrition_counseling__my_pregnancy_plate_handout', 'iron_and_calcium_2nd_and_3rd_trimester',
  'plan_for_delivery_facility_delivery_encouragement', 'kegel_exercises_pregnancy_and_postnatal',
  'family_planning_teaching_and_handout', 'exclusive_breastfeeding', 'postpartum_depression_handout',
  'refferal_needed', 'refferal_need', 'referral_clinic_type', 'care_plan_created',
  'reports_or_info_sent_to_mch_nurse', 'place', 'signature_of_mch_nurse', 'date_reffe', 'patient_condition',
  'vitamins', 'anemia__11gm',
]

// Lab Investigations lives only on Nurse's and Doctor's rows (never
// Volunteer's) - filled once per trimester, by whichever of the two gets
// there first, then mirrored onto every row of both tables so it reads the
// same everywhere and is locked from further edits for the rest of that
// trimester. Mirrors chw.common.doctype.anc_follow_up.anc_follow_up's own
// sync_lab_investigations() - the server re-derives the same thing on save
// regardless, this just keeps the live preview in step with it.
const LAB_INVESTIGATION_TABLE_FIELDS = ['anc_followup_for_nurse', 'anc_followup_for_docter']
const LAB_INVESTIGATION_GROUPS = [
  {
    trimester: 1,
    fields: ['hb', 'blood_group', 'platelet_count', 'hiv', 'hbsag', 'hcv', 'vdrl', 'hba1c__grbs', 'tsh', 'urine_r__e'],
    statusField: 'lab_1st_trimester_status',
    filledByField: 'lab_1st_trimester_filled_by',
  },
  { trimester: 2, fields: ['hb_2nd', 'bs', 'urine'], statusField: 'lab_2nd_trimester_status', filledByField: 'lab_2nd_trimester_filled_by' },
  { trimester: 3, fields: ['hb_3rd', 'bs_3rd', 'grbs_3rd'], statusField: 'lab_3rd_trimester_status', filledByField: 'lab_3rd_trimester_filled_by' },
]

// Scan Investigations - same mirror-and-lock mechanic as Lab Investigations,
// minus the trimester gate: every group is open from the start, since each
// scan happens at its own point in the pregnancy, not along trimester lines.
const SCAN_INVESTIGATION_GROUPS = [
  { fields: ['date_of_scan', 'ga_us', 'ga_at_scan', 'edd_by_us'], statusField: 'scan_dating_status', filledByField: 'scan_dating_filled_by' },
  { fields: ['d_o_s', 'ga', 'normal_or_abnormal', 'if_abnormal'], statusField: 'scan_nt_status', filledByField: 'scan_nt_filled_by' },
  {
    fields: ['date_of_scan_copy', 'ga_copy', 'normal_or_abnormal_copy', 'if_abnormal_copy'],
    statusField: 'scan_anatomy_status',
    filledByField: 'scan_anatomy_filled_by',
  },
  {
    fields: ['date_of_scan_copy_copy', 'ga_copy_copy', 'position', 'cephalic', 'growth', 'if_abnormal_copy_copy'],
    statusField: 'scan_growth_status',
    filledByField: 'scan_growth_filled_by',
  },
]

// Same fallbacks as get_window_policy() in both Desk and the server.
const DEFAULT_WINDOW_DAYS = 30
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

// Reads from the shared Visit Schedule Master (Applies To = "ANC
// Follow-up") instead of ANC's own separate master - see
// chw.chw_master.visit_schedule. High Risk picks which configured row
// applies, so this is cached per risk value rather than once per session.
const windowPolicyCache = {}
async function getWindowPolicy(highRisk) {
  const key = highRisk || 'No'
  if (!windowPolicyCache[key]) {
    windowPolicyCache[key] = call('chw.common.doctype.anc_follow_up.anc_follow_up.get_window_policy_for_js', {
      high_risk: key,
    })
      .then((msg) => ({
        windowDays: Number(msg?.window_days) || DEFAULT_WINDOW_DAYS,
        alertWithinDays: Number(msg?.alert_within_days) || DEFAULT_RISK_ALERT_DAYS,
        automaticWindowCount: Number(msg?.automatic_window_count) || DEFAULT_AUTOMATIC_WINDOW_COUNT,
      }))
      .catch((e) => {
        delete windowPolicyCache[key]
        throw e
      })
  }
  return windowPolicyCache[key]
}

// The server compares rows with getdate(), which reads an empty date as
// today - mirrored so ties/ordering pick the same row.
function dateKey(value) {
  return toDateStr(parseDate(value)) || today()
}

// Same thresholds as the server's _trimester_number(), just expressed as
// 1/2/3 for Nurse's and Doctor's current_trimester_no field.
function trimesterNumber(lmpDate, asOfDate) {
  const daysPregnant = daysBetween(lmpDate, asOfDate || today())
  const weeks = Math.floor(Math.max(daysPregnant, 0) / 7)
  if (weeks <= 13) return 1
  if (weeks <= 27) return 2
  return 3
}

// Not cached across page loads, only within this one form session - the
// logged-in user doesn't change mid-edit.
let currentUserFullNamePromise = null
function getCurrentUserFullName() {
  const user = window.frappe?.session?.user
  if (!user || user === 'Guest') return Promise.resolve('Someone')
  if (!currentUserFullNamePromise) {
    currentUserFullNamePromise = call('frappe.client.get_value', {
      doctype: 'User',
      filters: user,
      fieldname: 'full_name',
    })
      .then((r) => r?.full_name || user)
      .catch(() => user)
  }
  return currentUserFullNamePromise
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

// Every completed visit closes its own window and advances to the next one
// - one visit always closes one window.
function getCurrentWindow(startingWindow, completedCount) {
  return startingWindow + completedCount
}

// Assign only on a real change, so recalculating with the same answer
// doesn't mark the form dirty or wake the change watchers again.
function setIfChanged(obj, field, value) {
  if ((obj[field] ?? null) !== (value ?? null)) obj[field] = value
}

// Flips a Volunteer row to Completed the moment it actually has a visit
// recorded in it. Returns whether it did, so the caller can re-run whatever
// a manual Status change would have (the schedule recalculation).
function autoCompleteVolunteerRow(row) {
  if (row.status === 'Completed') return false
  if (!VOLUNTEER_VISIT_CONTENT_FIELDS.some((f) => row[f])) return false
  setIfChanged(row, 'status', 'Completed')
  return true
}

// "Date of Next Visit" (last row only) and "Next Visit Window" (every row)
// are filled on the Volunteer table only - Nurse's and Doctor's are left to
// manual entry, as on the server.
function syncChildRowFields(values, windowStart, windowEnd) {
  const display = windowStart && windowEnd ? `${formatDate(windowStart)} to ${formatDate(windowEnd)}` : ''
  const rows = values[VOLUNTEER_TABLE_FIELD] || []
  if (windowStart && windowEnd && rows.length) {
    setIfChanged(rows[rows.length - 1], 'date_of_next_visit', windowEnd)
  }
  rows.forEach((row) => setIfChanged(row, 'next_visit_window', display))
}

// Manual phase has no single calculated window to share across rows any
// more - each row's own "Next Visit Window" instead shows just that row's
// own visit date through to whatever Date of Next Visit was typed on it, if
// any; a row with nothing typed in shows nothing.
function syncManualPhaseRowWindows(values) {
  const rows = values[VOLUNTEER_TABLE_FIELD] || []
  rows.forEach((row) => {
    if (row.urgent_followup) return
    const display = row.date_of_next_visit && row.date ? `${formatDate(row.date)} to ${formatDate(row.date_of_next_visit)}` : ''
    setIfChanged(row, 'next_visit_window', display)
  })
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
  const rows = values[VOLUNTEER_TABLE_FIELD] || []
  const urgent = earliestBy(rows.filter(isOpenUrgent), (row) => dateKey(row.date))
  if (!urgent) return null
  const triggerIndex = rows.indexOf(urgent) - 1
  const triggerDate = triggerIndex >= 0 ? rows[triggerIndex].date : urgent.date
  return { date: urgent.date, triggerDate }
}

// Bumped per recalculation: a slower, older call must not overwrite the
// result of a newer one.
let calcSeq = 0

// This function is itself what writes date_of_next_visit onto a row in
// automatic phase (and the urgent branch) - without this guard, that write
// would re-trigger onChildFieldChange's own listener for that same field
// (added so a nurse's manual typing into it, in manual phase, live-updates
// the preview) and recalculate forever. Anything this function writes while
// the counter is above zero is its own echo, not a human edit.
let activeCalcCount = 0

async function calculateNextAncVisitDate(values) {
  const seq = ++calcSeq
  activeCalcCount++
  try {
    await calculateNextAncVisitDateInner(values, seq)
  } finally {
    activeCalcCount--
  }
}

async function calculateNextAncVisitDateInner(values, seq) {
  if (values.status === 'Closed') {
    // She's delivered - no more ANC visits are due.
    setNextVisit(values, null, '')
    syncChildRowFields(values, null, null)
    return
  }
  if (!values.pregnant_id) return

  let info, policy
  try {
    info = await getPregnancyInfo(values.pregnant_id)
    if (!info.lmp_date) return
    policy = await getWindowPolicy(info.high_risk)
  } catch {
    return
  }
  if (seq !== calcSeq) return

  const { windowDays, alertWithinDays, automaticWindowCount } = policy
  const nurseRows = values[VOLUNTEER_TABLE_FIELD] || []
  // An urgent follow-up is an extra visit squeezed in between regular
  // windows, not one of the regular 30-day slots - completing it must not
  // advance the regular schedule by a window it was never part of.
  const completedCount = nurseRows.filter((row) => row.status === 'Completed' && !row.urgent_followup).length
  // Windows count from when the record was created (today for a new one),
  // exactly as the server's set_next_anc_visit_date does.
  const startingWindow = getWindowIndex(values.creation || today(), info.lmp_date, windowDays)
  const currentWindow = getCurrentWindow(startingWindow, completedCount)
  // Computed up front, before the urgent short-circuit below, so the field
  // it gates (the Volunteer row's own Date of Next Visit) stays correctly
  // shown/hidden live, even while an urgent follow-up happens to be active.
  setIfChanged(values, 'schedule_in_manual_phase', currentWindow > automaticWindowCount ? 1 : 0)

  const urgent = getPendingUrgent(values)
  if (urgent) {
    // The urgent date itself is the early-visit signal - no alert on top.
    setNextVisit(values, urgent.date, '')
    syncChildRowFields(values, urgent.triggerDate, urgent.date)
    return
  }

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

  // Manual phase: there's no further automatic window to calculate, so
  // nothing is invented here. Everything stays blank until a nurse types a
  // Date of Next Visit on a row herself; whichever row's own visit happened
  // most recently is the one that counts.
  setIfChanged(values, 'next_anc_visit_risk_alert', '')

  const current = values.next_anc_visit_date
  const lastAuto = values.next_anc_visit_date_auto
  if (current && lastAuto && dateKey(current) !== dateKey(lastAuto)) {
    // A coordinator typed directly into Next ANC Visit Date itself,
    // bypassing the rows entirely - respected as-is, never recalculated
    // back out from under them.
    syncManualPhaseRowWindows(values)
    return
  }

  const manualRows = nurseRows.filter((row) => row.date_of_next_visit)
  if (!manualRows.length) {
    setIfChanged(values, 'next_anc_visit_date', null)
    setIfChanged(values, 'next_anc_visit_date_auto', null)
    syncManualPhaseRowWindows(values)
    return
  }

  const latestRow = latestBy(manualRows, (row) => dateKey(row.date))
  setIfChanged(values, 'next_anc_visit_date', latestRow.date_of_next_visit)
  setIfChanged(values, 'next_anc_visit_date_auto', latestRow.date_of_next_visit)
  syncManualPhaseRowWindows(values)
}

let generateSeq = 0

// Lays out the remaining automatic-phase monthly windows as Volunteer rows
// the first time a pregnancy is picked - only on an empty Volunteer table,
// and not at all if the Volunteer table has been hidden via Customize Form.
async function generateVisitSchedule(values, ctx) {
  const volunteerField = ctx.getField(VOLUNTEER_TABLE_FIELD)
  const volunteerHidden = ctx.meta && (!volunteerField || !!volunteerField.hidden)
  const pregnantId = values.pregnant_id
  if (!pregnantId || volunteerHidden || (values[VOLUNTEER_TABLE_FIELD] || []).length) {
    return calculateNextAncVisitDate(values)
  }

  const seq = ++generateSeq
  let info, policy
  try {
    info = await getPregnancyInfo(pregnantId)
    if (!info.lmp_date) return
    policy = await getWindowPolicy(info.high_risk)
  } catch {
    return
  }
  // The pregnancy changed meanwhile, or rows appeared (another generation
  // or a hand-added row) - don't add a second schedule.
  if (seq !== generateSeq || values.pregnant_id !== pregnantId) return
  if ((values[VOLUNTEER_TABLE_FIELD] || []).length) return calculateNextAncVisitDate(values)

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
  values[VOLUNTEER_TABLE_FIELD] = [...(values[VOLUNTEER_TABLE_FIELD] || []), ...rows]
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

// Nurse/Doctor rows get their date from the field's "Today" default, which
// doesn't count as a date change - so LMP and POG are filled the moment
// the row is added. Volunteer's own Date has no default at all (either
// calculated by the schedule or typed in by hand), so this also covers it.
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

// Shared by syncLabInvestigations and syncScanInvestigations: for each
// group, find the first row (by idx, Nurse before Doctor on a tie) with any
// of its fields filled, and mirror its values + status + filled-by onto
// every row of every table.
async function applyInvestigationGroups(rowsByTable, groups) {
  for (const group of groups) {
    const candidates = []
    for (const rows of Object.values(rowsByTable)) {
      for (const row of rows) {
        if (group.fields.some((f) => row[f])) candidates.push(row)
      }
    }
    if (!candidates.length) continue

    // Same tie-break as the server: earliest row by idx, Nurse before
    // Doctor on a tie (table iteration order above).
    candidates.sort((a, b) => (a.idx || 0) - (b.idx || 0))
    const source = candidates[0]
    const groupValues = {}
    for (const f of group.fields) groupValues[f] = source[f]
    const existingFilledBy = source[group.filledByField]

    const applyMirror = (filledBy) => {
      for (const rows of Object.values(rowsByTable)) {
        for (const row of rows) {
          for (const [f, v] of Object.entries(groupValues)) setIfChanged(row, f, v)
          setIfChanged(row, group.statusField, 'Completed')
          setIfChanged(row, group.filledByField, filledBy)
        }
      }
    }

    if (existingFilledBy) {
      applyMirror(existingFilledBy)
    } else {
      applyMirror(await getCurrentUserFullName())
    }
  }
}

async function syncLabInvestigations(values) {
  if (!values.pregnant_id) return
  let info
  try {
    info = await getPregnancyInfo(values.pregnant_id)
  } catch {
    return
  }
  if (!info.lmp_date) return
  const currentTrimesterNo = trimesterNumber(info.lmp_date)

  const rowsByTable = {}
  for (const tableField of LAB_INVESTIGATION_TABLE_FIELDS) {
    rowsByTable[tableField] = values[tableField] || []
  }
  for (const rows of Object.values(rowsByTable)) {
    for (const row of rows) setIfChanged(row, 'current_trimester_no', currentTrimesterNo)
  }

  const dueGroups = LAB_INVESTIGATION_GROUPS.filter((g) => g.trimester <= currentTrimesterNo)
  await applyInvestigationGroups(rowsByTable, dueGroups)
}

// Not trimester-gated - no pregnancy info needed at all, just whoever's
// logged in now, in case a group gets completed by this call.
// Per-visit, not shared across rows: each row's own Status/Filled By
// reflect only that same row's own fields - no scanning other rows, no
// mirroring, no locking. A freshly added row has nothing in it, so it's
// simply Pending until that visit's own fields get filled.
async function syncScanInvestigations(values) {
  let fullNamePromise = null
  for (const tableField of LAB_INVESTIGATION_TABLE_FIELDS) {
    for (const row of values[tableField] || []) {
      for (const group of SCAN_INVESTIGATION_GROUPS) {
        const isFilled = group.fields.some((f) => row[f])
        if (!isFilled) {
          setIfChanged(row, group.statusField, 'Pending')
          setIfChanged(row, group.filledByField, null)
          continue
        }
        if (row[group.statusField] !== 'Completed') {
          if (!row[group.filledByField]) {
            fullNamePromise = fullNamePromise || getCurrentUserFullName()
            setIfChanged(row, group.filledByField, await fullNamePromise)
          }
          setIfChanged(row, group.statusField, 'Completed')
        }
      }
    }
  }
}

// Per-visit, like Scan Investigations - Nurse's and Doctor's rows only, no
// mirroring, no locking.
async function syncTtStatus(values) {
  let fullNamePromise = null
  for (const tableField of LAB_INVESTIGATION_TABLE_FIELDS) {
    for (const row of values[tableField] || []) {
      if (!row.tt_status) {
        setIfChanged(row, 'tt_status_filled_by', null)
        continue
      }
      if (!row.tt_status_filled_by) {
        fullNamePromise = fullNamePromise || getCurrentUserFullName()
        setIfChanged(row, 'tt_status_filled_by', await fullNamePromise)
      }
    }
  }
}

// Per-visit, across all three tables - Volunteer, Nurse and Doctor can each
// independently flag a visit as Risk.
async function syncRiskFilledBy(values) {
  let fullNamePromise = null
  for (const tableField of FOLLOWUP_TABLE_FIELDS) {
    for (const row of values[tableField] || []) {
      if (row.patient_condition !== 'Risk') {
        setIfChanged(row, 'risk_filled_by', null)
        continue
      }
      if (!row.risk_filled_by) {
        fullNamePromise = fullNamePromise || getCurrentUserFullName()
        setIfChanged(row, 'risk_filled_by', await fullNamePromise)
      }
    }
  }
}

export default {
  // health_worker_name is defaulted generically for every doctype (see
  // applyCurrentHealthWorkerDefault in DoctypeForm.vue), and Desk's
  // refresh only repainted row highlights, which rowClass does reactively.
  // Lab Investigations is the exception: current_trimester_no (and whether
  // a trimester is already locked) can go stale just from time passing
  // since the record was last saved, so it's refreshed the moment the form
  // opens, not only on an edit.
  onAfterLoad(values, ctx) {
    syncLabInvestigations(values)
    syncScanInvestigations(values)
    syncTtStatus(values)
    syncRiskFilledBy(values)
    // A new record opened with Pregnant ID already filled in via the URL
    // (e.g. from Pregnancy Registration's own "New ANC Follow-up" link)
    // never fires onFieldChange('pregnant_id') below, so without this the
    // Volunteer schedule would never get generated. Existing records are
    // left alone here - an empty Volunteer table on a saved record (closed
    // pregnancies especially) is never something simply opening it should
    // start filling in.
    if (ctx.isNew && values.pregnant_id && !(values[VOLUNTEER_TABLE_FIELD] || []).length) {
      return generateVisitSchedule(values, ctx)
    }
  },

  // Desk's set_query (anc_follow_up.js): only pregnancies registered for a
  // family member - Pregnancy Registration itself only accepts women, so
  // this leaves women only. Plain filters, so it works offline too.
  getLinkQuery(fieldname) {
    if (fieldname === 'pregnant_id') return { filters: { familymember_id: ['is', 'set'] } }
    return null
  },

  onFieldChange(fieldname, values, ctx) {
    if (fieldname === 'pregnant_id') {
      syncLabInvestigations(values)
      syncScanInvestigations(values)
      return generateVisitSchedule(values, ctx)
    }
    if (fieldname === 'phone_number') warnIfNotDigits(values.phone_number)
  },

  // lmp_date, pog_weeks and next_visit_window are purely this module's own
  // output, never listened to. date_of_next_visit is too, in automatic
  // phase - but in manual phase it's a nurse's own typed input, so it IS
  // listened to there (guarded by activeCalcCount so this module's own
  // automatic-phase write of that same field, further down, doesn't
  // re-trigger itself).
  onChildFieldChange(tableField, fieldname, row, values) {
    if (!FOLLOWUP_TABLE_FIELDS.includes(tableField)) return
    const drivesSchedule = tableField === VOLUNTEER_TABLE_FIELD
    if (fieldname === 'date') {
      syncRowPog(row, values)
      if (drivesSchedule) return calculateNextAncVisitDate(values)
    }
    if (fieldname === 'status' && drivesSchedule) return calculateNextAncVisitDate(values)
    if (fieldname === 'date_of_next_visit' && drivesSchedule && activeCalcCount === 0) {
      return calculateNextAncVisitDate(values)
    }

    if (drivesSchedule && VOLUNTEER_VISIT_CONTENT_FIELDS.includes(fieldname) && autoCompleteVolunteerRow(row)) {
      return calculateNextAncVisitDate(values)
    }

    if (fieldname === 'patient_condition') return syncRiskFilledBy(values)

    if (LAB_INVESTIGATION_TABLE_FIELDS.includes(tableField)) {
      if (LAB_INVESTIGATION_GROUPS.some((g) => g.fields.includes(fieldname))) return syncLabInvestigations(values)
      if (SCAN_INVESTIGATION_GROUPS.some((g) => g.fields.includes(fieldname))) return syncScanInvestigations(values)
      if (fieldname === 'tt_status') return syncTtStatus(values)
    }
  },

  // Desk registered these on the parent doctype, where Frappe never fires
  // them; ported as intended.
  onChildRowAdd(tableField, row, idx, values) {
    if (tableField === 'anc_followup_for_nurse' || tableField === 'anc_followup_for_docter') {
      fillNewRowPregnancyInfo(row, values)
      syncLabInvestigations(values)
      return syncScanInvestigations(values)
    }
    if (tableField === VOLUNTEER_TABLE_FIELD) {
      // Only reached in the manual phase (bulk auto-generation already
      // fills every automatic-phase row itself) - Window Start is read-only
      // and has no default, so unlike Nurse/Doctor it would otherwise stay
      // blank forever on a hand-added row.
      row.window_start_date = today()
      // The previous row's own typed Date of Next Visit already said when
      // this visit is due - carried over here so the nurse isn't asked to
      // type the same date twice.
      const rows = values[VOLUNTEER_TABLE_FIELD] || []
      const previousRow = rows[rows.indexOf(row) - 1]
      if (previousRow && previousRow.date_of_next_visit) {
        row.date = previousRow.date_of_next_visit
      }
      return fillNewRowPregnancyInfo(row, values)
    }
  },

  onChildRowRemove(tableField, removedRows, values) {
    if (tableField === VOLUNTEER_TABLE_FIELD) return calculateNextAncVisitDate(values)
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

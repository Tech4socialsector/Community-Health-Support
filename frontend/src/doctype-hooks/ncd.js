// Ports chw/common/doctype/ncd/ncd.js (the Desk form script) into the Vue
// app's hook contract - see doctype-hooks/index.js and DoctypeForm.vue.
// The visit schedule and next-visit date follow ncd.py (generate_visit_schedule,
// set_next_followup_date) so what the form shows is what gets saved: the
// server only fills the schedule when the table is empty, so rows built here
// are kept as they are.

import { addDays, today, warnIfNotDigits } from './utils'

const HIGH_RISK_INTERVAL_DAYS = 30
const NORMAL_RISK_DEFAULT_INTERVAL_DAYS = 60
const SCHEDULE_DURATION_DAYS = 365

// Same as get_interval_days() on both sides: 30 days for a high-risk member,
// else the disease's own interval, else 60. A missing/zero interval falls
// back to 60 like the server's `or`; a negative one would loop forever there,
// so it's treated the same as missing here.
async function getIntervalDays(values, ctx, highRisk = values.high_risk) {
  if (highRisk === 'Yes') return HIGH_RISK_INTERVAL_DAYS
  if (values.disease) {
    try {
      const res = await ctx.call('frappe.client.get_value', {
        doctype: 'NCD Disease',
        filters: values.disease,
        fieldname: 'interval_days',
      })
      const days = Number(res?.interval_days)
      if (days > 0) return days
    } catch {
      // unreadable disease master - default interval
    }
  }
  return NORMAL_RISK_DEFAULT_INTERVAL_DAYS
}

// high_risk is fetched from the family member (fetch_from), and that fetch
// lands only after the familymember_id change - building the schedule from
// the old/empty high_risk would save 60-day rows for a high-risk member, and
// the server never rebuilds them. So read it from the member directly.
async function memberHighRisk(values, ctx) {
  try {
    const res = await ctx.call('frappe.client.get_value', {
      doctype: 'Family members',
      filters: values.familymember_id,
      fieldname: 'high_risk',
    })
    return res?.high_risk ?? null
  } catch {
    return values.high_risk
  }
}

// Latest call wins: disease, familymember_id and the fetched high_risk can
// all fire within a moment of each other, and Desk would add the year of
// visits once per event that saw an empty table.
let scheduleSeq = 0

async function generateVisitSchedule(values, ctx) {
  const seq = ++scheduleSeq
  if (!values.familymember_id || (values.ncd_followup || []).length) {
    await calculateNextVisitDate(values, ctx)
    return
  }

  const highRisk = await memberHighRisk(values, ctx)
  const intervalDays = await getIntervalDays(values, ctx, highRisk)
  if (seq !== scheduleSeq || !values.familymember_id || (values.ncd_followup || []).length) return

  // A year of Pending visits, first one interval from today.
  const rows = []
  const endDate = addDays(today(), SCHEDULE_DURATION_DAYS)
  let visitDate = addDays(today(), intervalDays)
  while (visitDate <= endDate) {
    rows.push({ date: visitDate, status: 'Pending' })
    visitDate = addDays(visitDate, intervalDays)
  }
  if (!Array.isArray(values.ncd_followup)) values.ncd_followup = []
  values.ncd_followup.push(...rows)
  await calculateNextVisitDate(values, ctx)
}

let nextDateSeq = 0

function setNextDate(values, date) {
  values.next_followup_date = date
  values.next_followup_date_auto = date
}

async function calculateNextVisitDate(values, ctx) {
  const seq = ++nextDateSeq

  // The server empties both dates on save once the patient has died (and
  // the field is hidden then), so show that straight away.
  if (values.status === 'Death') {
    setNextDate(values, null)
    return
  }

  // next_followup_date differing from the last auto value means the user
  // set it by hand - leave it alone.
  const current = values.next_followup_date
  const lastAuto = values.next_followup_date_auto
  if (current && lastAuto && current !== lastAuto) return

  const datedRows = (values.ncd_followup || []).filter((row) => row.date)
  if (!datedRows.length) return

  // Next visit due is the earliest visit not yet marked Completed.
  const pendingRows = datedRows.filter((row) => row.status !== 'Completed')
  if (pendingRows.length) {
    setNextDate(values, pendingRows.reduce((earliest, row) => (row.date < earliest ? row.date : earliest), pendingRows[0].date))
    return
  }

  // Every visit done: one interval after the latest.
  const lastDate = datedRows.reduce((latest, row) => (row.date > latest ? row.date : latest), datedRows[0].date)
  const intervalDays = await getIntervalDays(values, ctx)
  if (seq !== nextDateSeq) return
  setNextDate(values, addDays(lastDate, intervalDays))
}

export default {
  getLinkQuery(fieldname) {
    // NCD tracking is only for members above 30 (the server refuses others).
    if (fieldname === 'familymember_id') return { filters: { age: ['>', 30] } }
    return null
  },

  async onFieldChange(fieldname, values, ctx) {
    if (fieldname === 'phone_number') warnIfNotDigits(values.phone_number)
    if (fieldname === 'disease' || fieldname === 'high_risk' || fieldname === 'familymember_id') {
      await generateVisitSchedule(values, ctx)
    }
    if (fieldname === 'status') await calculateNextVisitDate(values, ctx)
  },

  async onChildFieldChange(tableField, fieldname, row, values, ctx) {
    if (tableField === 'ncd_followup' && (fieldname === 'date' || fieldname === 'status')) {
      await calculateNextVisitDate(values, ctx)
    }
  },

  async onChildRowRemove(tableField, removedRows, values, ctx) {
    if (tableField === 'ncd_followup') await calculateNextVisitDate(values, ctx)
  },
}

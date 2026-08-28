// Ports chw/common/doctype/child_growth_monitoring/child_growth_monitoring.js
// (a frappe.ui.form.on desk client script) into the Vue app's diff-triggered
// hook contract. See doctype-hooks/index.js and DoctypeForm.vue for how
// onLoad/onFieldChange/onChildFieldChange get called.

import { toast } from 'frappe-ui'

function getCareStage(ageInMonths) {
  if (ageInMonths <= 6) return '0-6 Months'
  if (ageInMonths <= 60) return '6 Months to 5 Years'
  if (ageInMonths <= 132) return '5 Years to 11 Years'
  return 'Above 11 Years'
}

function monthsBetween(dobStr, dateStr) {
  const dob = new Date(dobStr)
  const date = new Date(dateStr)

  let years = date.getFullYear() - dob.getFullYear()
  let months = date.getMonth() - dob.getMonth()
  const days = date.getDate() - dob.getDate()

  if (days < 0) months -= 1
  if (months < 0) {
    years -= 1
    months += 12
  }
  return years * 12 + months
}

function todayStr() {
  return new Date().toISOString().slice(0, 10)
}

function addDays(dateStr, days) {
  const d = new Date(dateStr)
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

function addMonths(dateStr, months) {
  const d = new Date(dateStr)
  d.setMonth(d.getMonth() + months)
  return d.toISOString().slice(0, 10)
}

function calculateAge(values) {
  if (!values.date_of_birth) {
    values.age = ''
    values.age_in_months = 0
    values.care_stage = ''
    return
  }

  const dob = new Date(values.date_of_birth)
  const now = new Date(todayStr())

  if (dob > now) {
    toast.warning('Date of Birth cannot be in the future.')
    values.date_of_birth = ''
    return
  }

  const ageInMonths = monthsBetween(values.date_of_birth, todayStr())
  values.age = String(Math.floor(ageInMonths / 12))
  values.age_in_months = ageInMonths
  values.care_stage = getCareStage(ageInMonths)
}

async function generateVisitSchedule(values, ctx) {
  if (!values.date_of_birth || (values.growth_followup || []).length) return

  const dob = values.date_of_birth
  let intervalDays = 30
  try {
    const res = await ctx.call('frappe.client.get_value', {
      doctype: 'Malnutrition Category Master',
      filters: 'Normal',
      fieldname: 'interval_days',
    })
    intervalDays = res?.interval_days || 30
  } catch {
    // fall back to the 30-day default
  }

  const rows = []
  const endDate0to5y = addMonths(dob, 60)
  let visitDate = addDays(dob, intervalDays)
  while (visitDate <= endDate0to5y) {
    rows.push({
      date: visitDate,
      stage: getCareStage(monthsBetween(dob, visitDate)),
      status: 'Pending',
    })
    visitDate = addDays(visitDate, intervalDays)
  }

  for (let m = 72; m <= 132; m += 12) {
    rows.push({
      date: addMonths(dob, m),
      stage: '5 Years to 11 Years',
      status: 'Pending',
    })
  }

  values.growth_followup = [...(values.growth_followup || []), ...rows]
  calculateNextFollowupDate(values)
}

function calculateNextFollowupDate(values) {
  const current = values.next_followup_date
  const lastAuto = values.next_followup_date_auto
  if (current && lastAuto && current !== lastAuto) {
    // user has manually overridden the date; leave it alone
    return
  }

  const datedRows = (values.growth_followup || []).filter((row) => row.date)
  if (!datedRows.length) return

  const pendingRows = datedRows.filter((row) => row.status !== 'Completed')

  const setNextDate = (calculatedDate) => {
    values.next_followup_date = calculatedDate
    values.next_followup_date_auto = calculatedDate
  }

  if (pendingRows.length) {
    const nextDate = pendingRows.reduce((earliest, row) => (row.date < earliest ? row.date : earliest), pendingRows[0].date)
    setNextDate(nextDate)
    return
  }

  const lastRow = datedRows.reduce((latest, row) => (row.date > latest.date ? row : latest), datedRows[0])

  if (lastRow.stage === '5 Years to 11 Years') {
    setNextDate(addMonths(lastRow.date, 12))
    return
  }

  if (lastRow.classification) {
    setNextDate(addDays(lastRow.date, 30))
  } else {
    setNextDate(addDays(lastRow.date, 30))
  }
}

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
  async onLoad(values, ctx) {
    if (ctx.isNew && !values.health_worker_name) {
      try {
        const healthWorker = await ctx.call('chw.api.get_current_health_worker')
        if (healthWorker) values.health_worker_name = healthWorker
      } catch {
        // no linked Health Worker for this user; leave blank
      }
    }
  },

  async onFieldChange(fieldname, values, ctx) {
    if (fieldname === 'familymember_id') {
      if (!values.familymember_id) return
      try {
        const res = await ctx.call('frappe.client.get_value', {
          doctype: 'Family members',
          filters: values.familymember_id,
          fieldname: 'date_of_birth',
        })
        if (res?.date_of_birth) values.date_of_birth = res.date_of_birth
      } catch {
        // family member has no date_of_birth on record
      }
    }

    if (fieldname === 'date_of_birth') {
      calculateAge(values)
      await generateVisitSchedule(values, ctx)
    }

    if (fieldname === 'phone_number') {
      if (values.phone_number && !/^\d*$/.test(values.phone_number)) {
        toast.warning('Phone number can only contain digits.')
      }
    }
  },

  onChildFieldChange(tableField, fieldname, row, values) {
    if (tableField !== 'growth_followup') return

    if (fieldname === 'muac' || fieldname === 'edema') {
      setRowClassification(row)
      calculateNextFollowupDate(values)
    }

    if (fieldname === 'date' || fieldname === 'status') {
      calculateNextFollowupDate(values)
    }
  },
}

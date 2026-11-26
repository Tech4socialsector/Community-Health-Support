// Ports chw/cancer/doctype/main_screening_form/main_screening_form.js (the
// Desk form script) into the Vue app's hook contract - see
// doctype-hooks/index.js and DoctypeForm.vue.

import { session } from '@/data/session'

// Finish sits at the end of each screening's Referral part - boxed in amber
// so it's easy to spot.
const FINISH_FIELDS = new Set(['oral_finished', 'breast_finished', 'cervical_finished'])
const FINISH_BOX =
  'w-fit rounded-lg bg-amber-50 px-3.5 py-2.5 ring-1 ring-amber-300 dark:bg-amber-900/30 dark:ring-amber-700 [&_label]:font-semibold [&_label]:text-amber-900 dark:[&_label]:text-amber-100'

// Each screening's status, worked out as the answers change - the same rule
// as the server's set_*_screening_status (main_screening_form.py), which
// sets it again on save. Same function in the Desk form script.
function screeningStatus(v, site, notScreened, pending, referred) {
  const applies = v.consent_given === 'Yes' && (site === 'oral' || v.gender !== 'Male')
  if (!applies) return v.consent_given === 'Yes' ? 'Not Applicable' : 'Pending'
  const finished = !!Number(v[`${site}_finished`] || 0)
  if (notScreened) return finished ? notScreened : 'In Progress'
  if (pending) return 'Pending'
  if (!finished) return 'In Progress'
  return referred ? 'Moved to Clinical Evaluation' : 'Completed'
}
function setScreeningStatuses(v) {
  const cervicalPending =
    !['Done', 'Not Done'].includes(v.cervical_screening) ||
    (v.cervical_screening === 'Done' && [v.cervical_visual_inspection, v.hr_hpv_dna, v.cytology, v.visual_test].includes('Not now'))
  const statuses = {
    oral_screening_status: screeningStatus(
      v,
      'oral',
      v.oral_examination === 'No' ? 'Not Screened' : null,
      !['Yes', 'No'].includes(v.oral_examination),
      v.refferal === 'Yes',
    ),
    breast_screening_status: screeningStatus(v, 'breast', null, !['Yes', 'No'].includes(v.breast_symptoms), v.breast_referral === 'Yes'),
    cervical_screening_status: screeningStatus(
      v,
      'cervical',
      v.cervical_screening === 'Not Done' ? 'Not Done' : null,
      cervicalPending,
      v.cervical_referral === 'Yes',
    ),
  }
  for (const [field, status] of Object.entries(statuses)) if (v[field] !== status) v[field] = status
}
const STATUS_FIELDS = new Set(['oral_screening_status', 'breast_screening_status', 'cervical_screening_status'])

// Frappe's Datetime value, local time: 'YYYY-MM-DD HH:mm:ss'.
function nowDatetime() {
  const d = new Date()
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
}

export default {
  fieldClass(fieldname) {
    return FINISH_FIELDS.has(fieldname) ? FINISH_BOX : ''
  },

  async onAfterLoad(values, ctx) {
    // New screening: Completed By and the consent witness are the person
    // logged in (their full name - "Administrator" for Administrator). The
    // witness can still be changed; the server fills both if left empty.
    if (!ctx.isNew || (values.completed_by && values.consent_witness)) return
    let name = session.full_name
    if (!name && session.user) {
      try {
        const r = await ctx.call('frappe.client.get_value', { doctype: 'User', filters: session.user, fieldname: 'full_name' })
        name = r?.full_name
      } catch {
        // offline - the user ID below
      }
    }
    name = name || session.user
    if (!name) return
    if (!values.completed_by) values.completed_by = name
    if (!values.consent_witness) values.consent_witness = name
  },

  onFieldChange(fieldname, values, ctx) {
    // Any answer can move a screening's status - keep all three current.
    if (!STATUS_FIELDS.has(fieldname)) setScreeningStatuses(values)

    // Finish ticked: Finished on / by show at once (now, the person logged
    // in); unticked: cleared. The server stamps the same on save.
    if (FINISH_FIELDS.has(fieldname)) {
      const site = fieldname.replace('_finished', '')
      if (values[fieldname]) {
        values[`${site}_finished_on`] = nowDatetime()
        values[`${site}_finished_by`] = session.user
      } else {
        values[`${site}_finished_on`] = null
        values[`${site}_finished_by`] = null
      }
      return
    }
  },
}

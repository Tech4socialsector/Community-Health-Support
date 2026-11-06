// Ports chw/cancer/doctype/main_screening_form/main_screening_form.js (the
// Desk form script) into the Vue app's hook contract - see
// doctype-hooks/index.js and DoctypeForm.vue.
//
// Oral Screening Questionnaire: once the screening is saved with Oral
// Examination = "No", it can't be reopened. Desk makes the field read-only;
// here a change away from the saved "No" is put back with a message. The
// server (main_screening_form.py) refuses it on save either way.

import { toast } from 'frappe-ui'
import { t } from '@/data/i18n'
import { session } from '@/data/session'

const savedOral = new WeakMap()

// Finish sits at the end of each screening's Referral part - boxed in amber
// so it's easy to spot.
const FINISH_FIELDS = new Set(['oral_finished', 'breast_finished', 'cervical_finished'])
const FINISH_BOX =
  'w-fit rounded-lg bg-amber-50 px-3.5 py-2.5 ring-1 ring-amber-300 dark:bg-amber-900/30 dark:ring-amber-700 [&_label]:font-semibold [&_label]:text-amber-900 dark:[&_label]:text-amber-100'

export default {
  fieldClass(fieldname) {
    return FINISH_FIELDS.has(fieldname) ? FINISH_BOX : ''
  },

  async onAfterLoad(values, ctx) {
    savedOral.set(values, ctx.isNew ? null : values.oral_examination || null)
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
    if (fieldname !== 'oral_examination') return
    if (savedOral.get(values) === 'No' && values.oral_examination !== 'No') {
      values.oral_examination = 'No'
      toast.warning(t('Oral Examination was saved as No, so the oral screening can\'t be reopened for this person.'))
    }
  },
}

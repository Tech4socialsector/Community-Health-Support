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

const savedOral = new WeakMap()

export default {
  onAfterLoad(values, ctx) {
    savedOral.set(values, ctx.isNew ? null : values.oral_examination || null)
  },

  onFieldChange(fieldname, values, ctx) {
    if (fieldname !== 'oral_examination') return
    if (savedOral.get(values) === 'No' && values.oral_examination !== 'No') {
      values.oral_examination = 'No'
      toast.warning(t('Oral Examination was saved as No, so the oral screening can\'t be reopened for this person.'))
    }
  },
}

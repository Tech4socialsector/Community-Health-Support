// Ports chw/cancer/doctype/outreach_clinic/outreach_clinic.js into the Vue
// app's hook contract - see doctype-hooks/index.js and places.js.

import { placeFieldChange, placeLinkQuery } from './places'
import { warnIfNotDigits } from './utils'
import { t } from '@/data/i18n'

const ID_PARTS = ['state', 'district', 'taluk_block', 'gram_panchayat', 'pincode']
let previewSeq = 0

// The Outreach Clinic ID builds up while the District, Block and Panchayat
// are picked: 37 -> 3707 -> 3707411 (2 + 2 + 3 digit codes), before Save.
// One clinic per panchayat - an ID already used is pointed out at once.
async function previewId(values, ctx) {
  if (!ctx.isNew) return
  const seq = ++previewSeq
  const r = await ctx
    .call('chw.cancer.doctype.outreach_clinic.outreach_clinic.preview_id', {
      district: values.district || null,
      taluk_block: values.taluk_block || null,
      gram_panchayat: values.gram_panchayat || null,
    })
    .catch(() => null)
  if (!r || seq !== previewSeq) return
  if ((values.outreach_clinic_id || '') !== (r.id || '')) values.outreach_clinic_id = r.id || null
  if (r.exists) ctx.toast?.warning?.(t('Outreach Clinic {0} already exists for this panchayat - open it instead.', [r.exists]))
  else if (r.missing) ctx.toast?.warning?.(t('{0} has no code yet - give it one to complete the Outreach Clinic ID.', [t(r.missing)]))
}

export default {
  async onAfterLoad(values, ctx) {
    await previewId(values, ctx)
  },
  async onFieldChange(fieldname, values, ctx) {
    if (fieldname === 'pincode') warnIfNotDigits(values.pincode)
    if (fieldname === 'gram_panchayat' && Array.isArray(values.villages) && values.villages.length) values.villages = []
    await placeFieldChange(fieldname, values, ctx)
    if (ID_PARTS.includes(fieldname)) await previewId(values, ctx)
  },
  getLinkQuery(fieldname, values, { tableField } = {}) {
    if (tableField === 'villages' || fieldname === 'village') return placeLinkQuery('village', values)
    return placeLinkQuery(fieldname, values)
  },
}

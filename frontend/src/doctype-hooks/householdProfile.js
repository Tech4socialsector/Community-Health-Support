// Ports chw/common/doctype/household_profile/household_profile.js (the Desk
// form script) into the Vue app's hook contract - see doctype-hooks/index.js
// and DoctypeForm.vue.
// Desk's geo_location handler is not ported: the doctype has no such field.
//
// Place: District -> Taluk/Block -> Panchayat -> Village (optional). Each
// list shows only the places under the level above, picking a lower level
// fills the ones above, and changing a level clears what no longer fits
// (see places.js). The cancer section's State is plain text, so it isn't
// part of this chain.
//
// Cancer outreach (only while the Outreach Clinic ID field is in use - see
// OUTREACH form_fields in chw/programmes.py): the clinic list shows the
// worker's own Active clinics, a worker with one clinic gets it filled in,
// and the clinic fills the village (when it covers one), pincode and state;
// the village list then shows only that clinic's villages.

import { warnIfNotDigits } from './utils'
import { HOUSEHOLD_LEVELS, placeFieldChange, placeLinkQuery } from './places'

function outreachInUse(ctx) {
  const f = ctx.getField?.('outreach_clinic')
  if (!f || f.hidden) return false
  const section = ctx.getField?.('outreach_section')
  return !section?.hidden
}

// What the last chosen clinic filled in, so removing the clinic takes back
// its pincode/state but leaves ones the worker typed.
let fromClinic = {}

const CLINIC_PLACE = ['district', 'taluk_block', 'gram_panchayat', 'village']

async function fillFromClinic(values, ctx) {
  const clinic = values.outreach_clinic
  if (!clinic) {
    // Clinic removed: its place goes with it.
    for (const f of CLINIC_PLACE) if (values[f]) values[f] = null
    if (fromClinic.pin_code && String(values.pin_code) === String(fromClinic.pin_code)) values.pin_code = null
    if (fromClinic.state && values.state === fromClinic.state) values.state = null
    fromClinic = {}
    return
  }
  const d = await ctx.call('chw.cancer.outreach.clinic_details', { clinic }).catch(() => null)
  if (!d || values.outreach_clinic !== clinic) return
  // Another clinic: its pincode/state replace the previous clinic's.
  if (fromClinic.pin_code && String(values.pin_code) === String(fromClinic.pin_code)) values.pin_code = null
  if (fromClinic.state && values.state === fromClinic.state) values.state = null
  fromClinic = { pin_code: d.pincode ? Number(d.pincode) : null, state: d.state || null }
  // The clinic decides the place: its district, block and panchayat.
  for (const f of ['district', 'taluk_block', 'gram_panchayat']) if (d[f] && String(values[f] ?? '') !== String(d[f])) values[f] = String(d[f])
  if (d.village && !values.village) values.village = d.village
  else if (values.village && d.villages?.length && !d.villages.includes(values.village)) values.village = d.village || null
  if (d.pincode && !values.pin_code) values.pin_code = Number(d.pincode)
  if (d.state && !values.state) values.state = d.state
}

export default {
  async onAfterLoad(values, ctx) {
    fromClinic = {}
    if (!ctx.isNew || values.outreach_clinic || !outreachInUse(ctx)) return
    const mine = await ctx.call('chw.cancer.outreach.my_clinics').catch(() => [])
    if (mine?.length === 1 && !values.outreach_clinic) values.outreach_clinic = mine[0]
  },
  async onFieldChange(fieldname, values, ctx) {
    if (fieldname === 'phone_no') warnIfNotDigits(values.phone_no)
    if (fieldname === 'outreach_clinic') await fillFromClinic(values, ctx)
    else await placeFieldChange(fieldname, values, ctx, HOUSEHOLD_LEVELS)
  },
  getLinkQuery(fieldname, values) {
    if (fieldname === 'outreach_clinic') return { query: 'chw.cancer.outreach.clinic_query', onlySelect: true }
    if (fieldname === 'village' && values.outreach_clinic) {
      return { query: 'chw.cancer.outreach.village_query', filters: { outreach_clinic: values.outreach_clinic } }
    }
    // No State link on this form - the chain starts at District.
    return placeLinkQuery(fieldname, { ...values, state: null, pincode: null })
  },
}

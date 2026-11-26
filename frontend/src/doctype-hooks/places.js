// State -> District -> Taluk Block -> Gram Panchayat, shared by the forms
// that pick a place (Outreach Clinic). Desk does the same in
// outreach_clinic.js; the server re-checks the chain on save
// (chw.places.check_chain).
//
// Three ways, all on one form:
//   top-down   each list shows only the places under the one above
//   bottom-up  picking a Block or Panchayat first fills the levels above
//   manual     "+ Create a new ..." opens with the levels above filled in
// Plus: a known pincode fills State / District / Block (and the Panchayat
// when it's the only one with that pincode).

// Each form passes the levels it has, top first: Outreach Clinic uses
// State -> Panchayat, Household profile District -> Village.
export const CLINIC_LEVELS = ['state', 'district', 'taluk_block', 'gram_panchayat']
export const HOUSEHOLD_LEVELS = ['district', 'taluk_block', 'gram_panchayat', 'village']
const DOCTYPE = { district: 'District', taluk_block: 'Taluk Block', gram_panchayat: 'Gram Panchayat', village: 'Village' }

// The Link query for one place field: filtered by the level above, and
// "+ Create" pre-filled with it. An empty level above filters nothing.
export function placeLinkQuery(fieldname, values) {
  if (fieldname === 'district') {
    return values.state ? { filters: { state: values.state }, createDefaults: { state: values.state } } : null
  }
  if (fieldname === 'taluk_block') {
    if (values.district) return { filters: { district: values.district }, createDefaults: { district: values.district } }
    if (values.state) return { filters: { state: values.state } }
    return null
  }
  if (fieldname === 'gram_panchayat') {
    const createDefaults = { taluk_block: values.taluk_block || undefined, pincode: values.pincode || undefined }
    if (values.taluk_block) return { filters: { taluk_block: values.taluk_block }, createDefaults }
    if (values.district) return { filters: { district: values.district }, createDefaults }
    if (values.state) return { filters: { state: values.state }, createDefaults }
    return { createDefaults }
  }
  if (fieldname === 'village' || fieldname === 'villages') {
    return values.gram_panchayat
      ? { filters: { village_code: values.gram_panchayat }, createDefaults: { village_code: values.gram_panchayat } }
      : null
  }
  return null
}

// While this hook fills levels itself, their own changes mustn't clear the
// levels below (a fill-upwards sets District, which would clear the Block
// just picked).
let filling = false

// Pincode fills only empty levels - never overwrites a place already picked.
function set(values, field, value) {
  if (value == null || value === '' || values[field]) return
  values[field] = value
}

// Returns true when it handled the field.
export async function placeFieldChange(fieldname, values, { call }, LEVELS = CLINIC_LEVELS) {
  if (filling) return false
  const i = LEVELS.indexOf(fieldname)
  if (i !== -1) {
    const value = values[fieldname]
    filling = true
    try {
      if (!value) return true
      // Bottom-up: fill what's above.
      if (i > 0) {
        const doctype = DOCTYPE[fieldname]
        const above = await call('chw.places.parents_of', { doctype, name: value }).catch(() => ({}))
        if (values[fieldname] !== value) return true
        for (const f of LEVELS.slice(0, i)) {
          // A different place above means the one above was wrong for this pick.
          // Only a real change - the server sends District as a number,
          // the form holds text, and a same-value write would mark the
          // record "Not saved".
          if (above?.[f] && String(values[f] ?? '') !== String(above[f])) values[f] = String(above[f])
        }
        if (fieldname === 'gram_panchayat' && above?.pincode && !values.pincode) values.pincode = String(above.pincode)
      }
      // Top-down: a level below that isn't inside the new pick is cleared.
      await clearBelow(i, values, call, LEVELS)
    } finally {
      filling = false
    }
    return true
  }
  if (fieldname === 'pincode') {
    const pin = String(values.pincode || '').replace(/\D/g, '')
    if (pin.length !== 6) return true
    const found = await call('chw.places.from_pincode', { pincode: pin }).catch(() => ({}))
    if (!found || String(values.pincode || '').replace(/\D/g, '') !== pin) return true
    filling = true
    try {
      for (const f of LEVELS) if (f !== 'village') set(values, f, found[f])
    } finally {
      filling = false
    }
    return true
  }
  return false
}

async function clearBelow(i, values, call, LEVELS) {
  // A level below goes when it isn't inside every level picked above it -
  // or when the level right above it was just cleared.
  let clearedAbove = false
  for (let j = i + 1; j < LEVELS.length; j++) {
    const below = LEVELS[j]
    const value = values[below]
    if (!value) {
      continue
    }
    if (clearedAbove) {
      values[below] = null
      continue
    }
    const doctype = DOCTYPE[below]
    const above = await call('chw.places.parents_of', { doctype, name: value }).catch(() => null)
    if (!above) continue
    // An old place with no parent saved yet can't be judged - it stays.
    const wrong = LEVELS.slice(0, j).some((f) => values[f] && above[f] && String(above[f]) !== String(values[f]))
    if (wrong) {
      values[below] = null
      clearedAbove = true
    }
  }
}

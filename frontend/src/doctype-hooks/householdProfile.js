// Ports chw/common/doctype/household_profile/household_profile.js (the Desk
// form script) into the Vue app's hook contract - see doctype-hooks/index.js
// and DoctypeForm.vue. The charity score follows household_profile.py
// update_charity_assessment(), which recomputes it on every save.
// Desk's geo_location handler is not ported: the doctype has no such field.

import { warnIfNotDigits } from './utils'

// Same list and order as CHARITY_CRITERIA_FIELDS on the server.
const CHARITY_CRITERIA_FIELDS = [
  'charity_breadwinner_occupation',
  'charity_dependent_ratio',
  'charity_health_condition',
  'charity_living_conditions',
  'charity_disability_severity',
]

export function charityPercentageBand(score) {
  if (score >= 17) return '>80%'
  if (score >= 14) return '60-80%'
  if (score >= 10) return '40-60%'
  if (score >= 6) return '20-40%'
  return '0-20%'
}

// Options are listed worst-need-first, so an answer scores its distance from
// the end of its own list (first = 4 ... last = 1); read from the doctype's
// options so a reworded option can't drift from the server's _option_score.
function optionScore(options, value) {
  if (!value) return 0
  const list = String(options || '').split('\n').filter(Boolean)
  const idx = list.indexOf(value)
  return idx >= 0 ? list.length - idx : 0
}

export function charityAssessment(doc, getOptions) {
  const answered = CHARITY_CRITERIA_FIELDS.filter((f) => doc[f])
  if (!answered.length) return { score: 0, band: '' }
  const score = CHARITY_CRITERIA_FIELDS.reduce((sum, f) => sum + optionScore(getOptions(f), doc[f]), 0)
  // A band only once all five are answered - a partial score would
  // understate need and suggest too low a charity %.
  return { score, band: answered.length === CHARITY_CRITERIA_FIELDS.length ? charityPercentageBand(score) : '' }
}

export default {
  onFieldChange(fieldname, values, ctx) {
    if (fieldname === 'phone_no') warnIfNotDigits(values.phone_no)
    if (CHARITY_CRITERIA_FIELDS.includes(fieldname)) {
      const { score, band } = charityAssessment(values, (f) => ctx.getField(f)?.options)
      values.charity_assessment_score = score
      values.charity_percentage_band = band
    }
  },
}

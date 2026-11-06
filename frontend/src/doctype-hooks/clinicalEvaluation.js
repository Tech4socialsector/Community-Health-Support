// Ports chw/cancer/doctype/clinical_evaluation/clinical_evaluation.js (the
// Desk form script) into the Vue app's hook contract - see
// doctype-hooks/index.js and DoctypeForm.vue.
//
// Main Screening Form lists only referred people: at least one screening
// finished with Referral = Yes (chw.cancer.queries.referred_screenings).
// The server checks the same on save (clinical_evaluation.py). No "Create a
// new" there - a new screening isn't referred yet.
//
// Only the tabs of the screenings that were referred are shown (depends_on
// the hidden <site>_referred ticks, set here from the picked screening).

const SITES = ['oral', 'breast', 'cervical']
const REFERRED_SITES_METHOD = 'chw.cancer.doctype.clinical_evaluation.clinical_evaluation.get_referred_sites'

// A tab that isn't referred has its first question set to No, as the server
// does on save; one that becomes shown starts unanswered again.
async function setReferredSites(values, ctx) {
  if (Number(values.docstatus || 0) !== 0) return
  const screening = values.main_screening_form
  let sites = {}
  if (screening) {
    try {
      sites = (await ctx.call(REFERRED_SITES_METHOD, { main_screening_form: screening })) || {}
    } catch {
      return // offline / unreadable - the server sets them on save
    }
    if (values.main_screening_form !== screening) return
  }
  for (const site of SITES) {
    const was = Number(values[`${site}_referred`] || 0)
    const referred = sites[site] ? 1 : 0
    if (was !== referred) values[`${site}_referred`] = referred
    if (!screening) continue
    const question = `${site}_clinical_evaluation`
    if (!referred && values[question] !== 'No') values[question] = 'No'
    else if (referred && !was && values[question] === 'No') values[question] = ''
  }
}

export default {
  // Submit is this form's Finish (Clinical Forms v2) - the server's
  // before_submit checks (breast biopsy "Not now", cervical treatment plan)
  // run then. Finished evaluations show as Completed on the clinic worklist.
  submitLabel: 'Finish evaluation',
  submittedLabel: 'Finished',

  onAfterLoad(values, ctx) {
    // The screening may have been referred / finished since this was saved.
    setReferredSites(values, ctx)
  },

  onFieldChange(fieldname, values, ctx) {
    if (fieldname === 'main_screening_form') setReferredSites(values, ctx)
  },

  getLinkQuery(fieldname) {
    if (fieldname === 'main_screening_form') return { query: 'chw.cancer.queries.referred_screenings', onlySelect: true }
    return null
  },
}

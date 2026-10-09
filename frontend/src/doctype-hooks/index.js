import ancFollowUp from './ancFollowUp'
import child6wTo1Year from './child6wTo1Year'
import childGrowthMonitoring from './childGrowthMonitoring'
import familyMembers from './familyMembers'
import householdProfile from './householdProfile'
import ncd from './ncd'
import pnc from './pnc'
import postpartum from './postpartum'
import preconception from './preconception'
import pregnancyRegistration from './pregnancyRegistration'

// Registry mapping doctype name -> hook module. Each module re-implements
// the doctype's Desk form script (frappe.ui.form.on(...)), which doesn't
// run in this Vue app. DoctypeForm.vue calls, when present:
//
//   onLoad(values, ctx)              new record, once, before defaults
//   onAfterLoad(values, ctx)         Desk "refresh": form opened (new or
//                                    saved record) and again after each save
//   onFieldChange(fieldname, values, ctx)
//                                    a field of the record changed (typed,
//                                    fetched, or set by another hook)
//   onChildFieldChange(tableField, fieldname, row, values, ctx)
//                                    a field of an existing row changed;
//                                    `row` is the live row - set values on it
//   onChildRowAdd(tableField, row, idx, values, ctx)
//                                    Desk <table>_add; row already has its
//                                    field defaults (e.g. status "Pending")
//   onChildRowRemove(tableField, removedRows, values, ctx)
//                                    Desk <table>_remove
//   getLinkQuery(fieldname, values, { row, tableField })
//                                    Desk set_query -> { filters } / { query }
//   rowClass(tableField, row, values) CSS class for a grid row (highlighting)
//   fieldClass(fieldname, values)     CSS class for a field's wrapper
//
// `values` is the reactive record (set fields on it directly); ctx is
// { isNew, call, toast, meta, getField(fieldname) }. Hooks may be async;
// values set after an await are picked up like any other change.
const HOOKS = {
  'ANC Follow-up': ancFollowUp,
  'Child 6w to 1 Year Reg and Followup': child6wTo1Year,
  'Child Growth Monitoring': childGrowthMonitoring,
  'Family members': familyMembers,
  'Household profile': householdProfile,
  NCD: ncd,
  PNC: pnc,
  'Postpartum Reg and Followup': postpartum,
  'Preconception Reg and Followup': preconception,
  'Pregnancy Registration': pregnancyRegistration,
}

export function getDoctypeHooks(doctype) {
  return HOOKS[doctype] || null
}

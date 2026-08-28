import childGrowthMonitoring from './childGrowthMonitoring'

// Registry mapping doctype name -> hook module. Each module can export
// onLoad(values, ctx), onFieldChange(fieldname, values, ctx), and
// onChildFieldChange(tableField, fieldname, row, values) - these reimplement
// the doctype's frappe.ui.form.on(...) desk client script, since that API
// doesn't exist for documents edited through this Vue app.
const HOOKS = {
  'Child Growth Monitoring': childGrowthMonitoring,
}

export function getDoctypeHooks(doctype) {
  return HOOKS[doctype] || null
}

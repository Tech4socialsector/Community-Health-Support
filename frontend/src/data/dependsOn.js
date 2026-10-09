// Desk's show/hide and "required when" conditions (depends_on,
// mandatory_depends_on) for the Vue forms. Same rules as Desk's
// frappe/form/layout.js evaluate_depends_on_value():
//   "eval:<js>"  - run with `doc` (the record, or the row inside a child
//                  table) and `parent` (the main record)
//   "fieldname"  - true when that field has a value (a table: any rows)
// Without this every conditional field showed all the time - e.g.
// Pregnancy Registration's high-risk factors appeared even when the woman
// wasn't marked high risk.

// Compiled once per expression: a form re-checks its conditions on every
// keystroke.
const compiled = new Map()

function compile(code) {
  if (!compiled.has(code)) {
    // Same as Desk (frappe.utils.eval): the expression is plain JavaScript
    // written by whoever designed the DocType.
    // eslint-disable-next-line no-new-func
    compiled.set(code, new Function('doc', 'parent', 'frappe', `return (${code})`))
  }
  return compiled.get(code)
}

// Desk scripts sometimes reach for frappe.* helpers inside a condition; the
// few that make sense without Desk loaded.
const frappeShim = {
  session: { get user() { return window.frappe?.session?.user } },
  utils: { now_date: () => new Date().toISOString().slice(0, 10) },
}

export function evaluateDependsOn(expression, doc, parent = doc) {
  if (!expression) return true
  if (typeof expression === 'boolean') return expression
  doc = doc || {}
  if (expression.startsWith('eval:')) {
    try {
      return !!compile(expression.slice(5))(doc, parent || doc, frappeShim)
    } catch (e) {
      // A broken expression would hide the field for good; showing it keeps
      // the data reachable. Desk raises an error dialog instead.
      console.warn(`Invalid depends_on expression: ${expression}`, e)
      return true
    }
  }
  // "fn:" calls a Desk form-script method, which doesn't exist here.
  if (expression.startsWith('fn:')) return true
  const value = doc[expression]
  return Array.isArray(value) ? value.length > 0 : !!value
}

const SECTION_TYPES = new Set(['Section Break', 'Tab Break'])

// Names of the fields currently visible, in Desk's terms: the field's own
// condition holds, and so do those of the section and tab it sits in (a
// hidden section hides everything until the next section; a hidden tab,
// everything until the next tab).
export function visibleFieldnames(metaFields, doc, parent = doc) {
  const visible = new Set()
  let tabVisible = true
  let sectionVisible = true
  for (const f of metaFields || []) {
    if (f.fieldtype === 'Tab Break') {
      tabVisible = !f.hidden && evaluateDependsOn(f.depends_on, doc, parent)
      sectionVisible = true
      continue
    }
    if (f.fieldtype === 'Section Break') {
      sectionVisible = !f.hidden && evaluateDependsOn(f.depends_on, doc, parent)
      continue
    }
    if (SECTION_TYPES.has(f.fieldtype)) continue
    if (tabVisible && sectionVisible && evaluateDependsOn(f.depends_on, doc, parent)) visible.add(f.fieldname)
  }
  return visible
}

// The field as the form should render it now: required if its
// mandatory_depends_on holds (the server enforces the same rule on save).
export function withLiveRequired(field, doc, parent = doc) {
  if (!field.mandatory_depends_on || field.reqd) return field
  return evaluateDependsOn(field.mandatory_depends_on, doc, parent) ? { ...field, reqd: 1 } : field
}

// Field defaults on a new record or a new child-table row, the way Desk
// fills them in when the form opens (frappe.model.get_default_value): the
// server only applies them on save, so without this a new form showed
// "Date = Today", "Status = Pending", "0" counts ... as empty boxes, and any
// condition depending on them behaved differently from Desk until saved.

const LAYOUT = new Set(['Section Break', 'Column Break', 'Tab Break', 'HTML', 'Heading', 'Button', 'Table', 'Table MultiSelect'])

function pad(n) {
  return String(n).padStart(2, '0')
}

function todayStr() {
  const d = new Date()
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

function nowStr() {
  const d = new Date()
  return `${todayStr()} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

export function defaultValueFor(field) {
  const raw = field.default
  if (raw == null || raw === '') return undefined
  const text = String(raw)
  const lower = text.toLowerCase()
  if (field.fieldtype === 'Date' && lower === 'today') return todayStr()
  if (field.fieldtype === 'Datetime' && (lower === 'now' || lower === 'today')) return nowStr()
  if (field.fieldtype === 'Time' && lower === 'now') return nowStr().slice(11)
  if (text === '__user') return window.frappe?.session?.user || undefined
  if (['Int', 'Check'].includes(field.fieldtype)) {
    const n = parseInt(text, 10)
    return Number.isNaN(n) ? undefined : n
  }
  if (['Float', 'Currency', 'Percent'].includes(field.fieldtype)) {
    const n = parseFloat(text)
    return Number.isNaN(n) ? undefined : n
  }
  // Desk evaluates ":field" / "eval:" defaults with its own context; they
  // aren't used by the CHW forms, so they're left for the server.
  if (text.startsWith(':') || text.startsWith('eval:')) return undefined
  return text
}

// Fill every empty field that has a default. Never overwrites a value
// already there (prefilled from a link, set by a hook, or typed).
export function applyDefaults(metaFields, target) {
  for (const field of metaFields || []) {
    if (LAYOUT.has(field.fieldtype)) continue
    const current = target[field.fieldname]
    if (current !== undefined && current !== null && current !== '') continue
    const value = defaultValueFor(field)
    if (value !== undefined) target[field.fieldname] = value
  }
  return target
}

// Display helpers for the read-only record detail page (RecordView.vue) and
// its child tables - turning raw field values into what a person reads.

const LAYOUT_FIELDTYPES = new Set([
  'Section Break',
  'Column Break',
  'Tab Break',
  'HTML',
  'Heading',
  'Button',
  'Fold',
])

export function isLayoutField(field) {
  return LAYOUT_FIELDTYPES.has(field.fieldtype)
}

export function isEmptyValue(value) {
  return value === null || value === undefined || value === '' || (Array.isArray(value) && !value.length)
}

const CHILD_ROW_SYSTEM_KEYS = new Set([
  'name',
  'owner',
  'creation',
  'modified',
  'modified_by',
  'docstatus',
  'idx',
  'parent',
  'parentfield',
  'parenttype',
  'doctype',
])

const numberFormat = new Intl.NumberFormat()

// Frappe sends dates as 'YYYY-MM-DD' - parsed as a local calendar date,
// since new Date('2026-07-08') is UTC midnight and can show as the previous
// day once rendered in local time.
function parseLocalDate(value) {
  const [y, m, d] = String(value).slice(0, 10).split('-').map(Number)
  return y && m && d ? new Date(y, m - 1, d) : null
}

export function formatFieldValue(value, field) {
  if (isEmptyValue(value)) return ''
  switch (field.fieldtype) {
    case 'Date': {
      const d = parseLocalDate(value)
      return d ? d.toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' }) : value
    }
    case 'Datetime': {
      const d = new Date(String(value).replace(' ', 'T'))
      return isNaN(d)
        ? value
        : d.toLocaleString(undefined, { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
    }
    case 'Check':
      return value ? 'Yes' : 'No'
    case 'Int':
    case 'Float':
    case 'Currency':
    case 'Percent':
      return typeof value === 'number' ? numberFormat.format(value) : value
    case 'Table MultiSelect':
      // Rows of a link-only child table - show the linked names, not objects.
      // Every child row also carries Frappe's own bookkeeping keys (parent,
      // owner, doctype, ...), so the linked value is the one key left after
      // skipping those.
      return Array.isArray(value)
        ? value
            .map((row) => {
              const key = Object.keys(row).find((k) => !CHILD_ROW_SYSTEM_KEYS.has(k) && typeof row[k] === 'string' && row[k])
              return key ? row[key] : ''
            })
            .filter(Boolean)
            .join(', ')
        : value
    default:
      return value
  }
}

// ---- Icons for the record detail page ----
// Picked from the field's own name + label, so every form gets sensible
// icons without per-form setup. Checked in order - more specific patterns
// first (e.g. "head of the family" is a person before "family" means a
// group, "occupation" is work before it reads as income).
const FIELD_ICON_RULES = [
  [/head[ _]of|respondent|surveyed|collector|health[ _]worker|volunteer|patient|husband|father|mother|first[ _]name|full[ _]name|\bname\b/i, 'user'],
  [/phone|mobile|contact[ _]?no/i, 'phone'],
  [/gram|panchayat|sub[ _]?cent|phc|hospital|facility/i, 'landmark'],
  [/village|address|location|place|block|district/i, 'map-pin'],
  [/occupation|job|employment/i, 'briefcase'],
  [/income|charity|amount|cost|fee|rupee|salary/i, 'indian-rupee'],
  [/education|school/i, 'graduation-cap'],
  [/gender|\bsex\b/i, 'venus-and-mars'],
  [/date|\bdob\b|\bedd\b|\blmp\b|_on$/i, 'calendar'],
  [/\bage\b|years/i, 'cake'],
  [/family|members|caste|dependent/i, 'users'],
  [/house|housing|home/i, 'house'],
  [/electric/i, 'zap'],
  [/farm|livelihood|crop|land/i, 'sprout'],
  [/water/i, 'droplet'],
  [/toilet|sanitation|latrine/i, 'bath'],
  [/cattle|animal|goat|cow|livestock/i, 'paw-print'],
  [/risk|alert|danger/i, 'triangle-alert'],
  [/weight|height|bmi|muac|\bhb\b|haemoglobin|hemoglobin|\bbp\b|blood[ _]pressure|sugar|glucose/i, 'scale'],
  [/medicine|tablet|iron|folic|calcium|drug|treatment/i, 'pill'],
  [/vaccin|immuni|injection|\btt\b/i, 'syringe'],
  [/pregnan|gravida|delivery|baby|child|birth|infant|newborn/i, 'baby'],
  [/disab|illness|disease|condition|health|diagnos|symptom/i, 'stethoscope'],
  [/history|previous|past/i, 'history'],
  [/status/i, 'badge-check'],
]

const FIELDTYPE_ICONS = {
  Date: 'calendar',
  Datetime: 'calendar',
  Check: 'circle-check',
  Select: 'list',
  Int: 'hash',
  Float: 'hash',
  Currency: 'indian-rupee',
  Percent: 'hash',
  Link: 'link',
  Table: 'layout-list',
  'Table MultiSelect': 'list',
  Attach: 'file-text',
  'Attach Image': 'file-text',
}

export function iconForField(field) {
  const text = `${field.fieldname || ''} ${field.label || ''}`
  for (const [pattern, icon] of FIELD_ICON_RULES) {
    if (pattern.test(text)) return icon
  }
  return FIELDTYPE_ICONS[field.fieldtype] || 'file-text'
}

// ---- Meaning colour of a value ----
// Picked from the Select options these forms actually use (status, risk,
// outcome ...), so the record page's pills and the list view's status dots
// agree. Returns a ui.js TONE key; anything not listed is neutral 'blue'.
const GREEN_VALUES = new Set([
  'yes', 'active', 'alive', 'completed', 'normal', 'healthy', 'stable', 'delivered', 'live birth',
  'discharged', 'approved', 'non reactive', 'responds appropriately', 'good caregiver support',
  'normal delivery', 'fully filled', 'closed', 'regular', 'validated', 'verified',
])
const AMBER_VALUES = new Set([
  'pending', 'moderate', 'mild', 'mam', 'intermittent', 'irregular', 'not delivered', 'draft',
  'temporary', 'average', 'inadequate caregiver support', 'partially completed', 'in progress', 'open',
])
const RED_VALUES = new Set([
  'high risk', 'risk', 'death', 'still birth', 'severe', 'sam', 'suicide risk', 'self-harm risk',
  'violence risk', 'lost to follow-up', 'abnormal', 'relapsed', 'infected', 'rejected', 'cancelled',
  'not responding appropriately', 'reactive', 'no', 'overdue',
])

export function toneFor(value) {
  const v = String(value).trim().toLowerCase()
  if (GREEN_VALUES.has(v)) return 'green'
  if (AMBER_VALUES.has(v)) return 'amber'
  if (RED_VALUES.has(v)) return 'red'
  return 'blue'
}

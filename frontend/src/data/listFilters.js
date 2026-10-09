// The Desk-style "Add a Filter" rules for the Vue list view: which fields
// can be filtered, which conditions suit each field type, and how a
// filter row turns into a Frappe filter ([fieldname, operator, value]).

// Every record has these, whatever the form - Desk offers them too.
export const STANDARD_FILTER_FIELDS = [
  { fieldname: 'name', label: 'ID', fieldtype: 'Data' },
  { fieldname: 'creation', label: 'Created On', fieldtype: 'Datetime' },
  { fieldname: 'modified', label: 'Last Modified', fieldtype: 'Datetime' },
  { fieldname: 'owner', label: 'Created By', fieldtype: 'Data' },
]

const TEXT = ['like', 'not like', '=', '!=', 'is']
const CHOICE = ['=', '!=', 'is']
const RANGE = ['=', '!=', '>', '<', '>=', '<=', 'is']
// A date-time compared by day: "not equals" a whole day has no single
// Frappe filter, so it isn't offered.
const DATETIME = ['=', '>', '<', '>=', '<=', 'is']

export function operatorsFor(field) {
  switch (field?.fieldtype) {
    case 'Select':
    case 'Link':
      return field.fieldtype === 'Link' ? TEXT : CHOICE
    case 'Check':
      return ['=']
    case 'Int':
    case 'Float':
    case 'Currency':
    case 'Percent':
    case 'Date':
      return RANGE
    case 'Datetime':
      return DATETIME
    default:
      return TEXT
  }
}

const isDateLike = (field) => field?.fieldtype === 'Date' || field?.fieldtype === 'Datetime'

export function operatorLabel(operator, field) {
  const dates = isDateLike(field)
  return (
    {
      like: 'Contains',
      'not like': "Doesn't contain",
      '=': dates ? 'On' : 'Equals',
      '!=': dates ? 'Not on' : 'Not equals',
      '>': dates ? 'After' : 'Greater than',
      '<': dates ? 'Before' : 'Less than',
      '>=': dates ? 'On or after' : 'At least',
      '<=': dates ? 'On or before' : 'At most',
      is: 'Is',
    }[operator] || operator
  )
}

// What kind of value box a row needs.
export function valueKind(field, operator) {
  if (operator === 'is') return 'set'
  if (field?.fieldtype === 'Check') return 'check'
  if (field?.fieldtype === 'Select') return 'select'
  if (isDateLike(field)) return 'date'
  if (['Int', 'Float', 'Currency', 'Percent'].includes(field?.fieldtype)) return 'number'
  return 'text'
}

export function selectOptions(field) {
  return (field?.options || '')
    .split('\n')
    .map((v) => v.trim())
    .filter(Boolean)
}

// A row is only applied once it has a value ("is" defaults to "set").
export function isComplete(row) {
  return !!row.fieldname && !!row.operator && row.value !== '' && row.value != null
}

// Filter row -> Frappe filter. Date-times are compared by whole day: "on
// 30 Sep" means from 00:00 to the last microsecond of that day.
export function toServerFilter(row, field) {
  const { fieldname, operator, value } = row
  if (operator === 'is') return [fieldname, 'is', value === 'not set' ? 'not set' : 'set']
  if (operator === 'like' || operator === 'not like') {
    const text = String(value)
    return [fieldname, operator, text.includes('%') ? text : `%${text}%`]
  }
  if (field?.fieldtype === 'Check') return [fieldname, '=', Number(value)]
  if (field?.fieldtype === 'Datetime') {
    const start = `${value} 00:00:00`
    const end = `${value} 23:59:59.999999`
    if (operator === '=') return [fieldname, 'between', [start, end]]
    if (operator === '>') return [fieldname, '>', end]
    if (operator === '<=') return [fieldname, '<=', end]
    return [fieldname, operator, start] // '<' and '>='
  }
  return [fieldname, operator, value]
}

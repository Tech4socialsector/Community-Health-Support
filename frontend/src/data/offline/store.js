// Reading and changing the phone's copy of the data (see db.js) - the same
// questions the server answers online (a record, a list page, a Link
// search, a field value, counts), answered from what was downloaded, plus
// the Outbox of changes made offline.

import { idb } from './db'
import { offlineState } from './state'

// ---- Records ----------------------------------------------------------

// Every record of a doctype, kept in memory after the first read: a list
// or Link search runs on each keystroke, IndexedDB per keystroke is slow on
// a cheap phone. Any write to that doctype drops it.
const memo = new Map()

export async function allRecords(doctype) {
  if (!memo.has(doctype)) memo.set(doctype, idb.getAllByIndex('records', 'doctype', doctype).catch(() => []))
  return memo.get(doctype)
}

function forget(doctype) {
  memo.delete(doctype)
}

export async function getRecord(doctype, name) {
  if (!doctype || name == null) return null
  return (await idb.get('records', [doctype, String(name)]).catch(() => null)) || null
}

export async function putRecords(doctype, docs) {
  if (!docs.length) return
  await idb.putMany('records', docs.map((d) => ({ ...d, doctype, name: String(d.name) })))
  forget(doctype)
}

export async function deleteRecords(doctype, names) {
  if (!names.length) return
  await idb.deleteMany('records', names.map((n) => [doctype, String(n)]))
  forget(doctype)
}

export async function hasDoctype(doctype) {
  const doctypes = (await idb.get('kv', 'doctypes').catch(() => null)) || []
  return doctypes.includes(doctype)
}

// ---- Metas --------------------------------------------------------------

export function getMeta(doctype) {
  return idb.get('metas', doctype).catch(() => null)
}

export async function putMetas(metas) {
  await idb.putMany('metas', Object.values(metas))
}

// ---- Filters, as Frappe reads them --------------------------------------

const blank = (v) => v === null || v === undefined || v === ''

function asNumber(v) {
  const n = Number(v)
  return blank(v) || Number.isNaN(n) ? null : n
}

// Numbers compare as numbers, dates/text as text ('2026-10-12' sorts right).
function compare(a, b) {
  const x = asNumber(a)
  const y = asNumber(b)
  if (x !== null && y !== null) return x - y
  return String(a ?? '').localeCompare(String(b ?? ''))
}

function likeToRegex(pattern) {
  const escaped = String(pattern).replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/%/g, '.*').replace(/_/g, '.')
  return new RegExp(`^${escaped}$`, 'is')
}

function test(value, operator, expected) {
  const op = String(operator || '=').toLowerCase()
  switch (op) {
    case '=':
      return blank(value) && blank(expected) ? true : compare(value, expected) === 0
    case '!=':
      return !(blank(value) && blank(expected)) && compare(value, expected) !== 0
    case '>':
      return !blank(value) && compare(value, expected) > 0
    case '<':
      return !blank(value) && compare(value, expected) < 0
    case '>=':
      return !blank(value) && compare(value, expected) >= 0
    case '<=':
      return !blank(value) && compare(value, expected) <= 0
    case 'like':
      return likeToRegex(expected).test(String(value ?? ''))
    case 'not like':
      return !likeToRegex(expected).test(String(value ?? ''))
    case 'in':
    case 'not in': {
      const list = Array.isArray(expected) ? expected : String(expected).split(',').map((s) => s.trim())
      const found = list.some((e) => compare(value, e) === 0)
      return op === 'in' ? found : !found
    }
    case 'between': {
      const [from, to] = expected || []
      return !blank(value) && compare(value, from) >= 0 && compare(value, to) <= 0
    }
    case 'is':
      return expected === 'not set' ? blank(value) : !blank(value)
    default:
      return compare(value, expected) === 0
  }
}

// {field: value | [op, value]} or [[field, op, value]] / [[doctype, field, op, value]].
function normalizeFilters(filters) {
  if (!filters) return []
  if (typeof filters === 'string') {
    try {
      filters = JSON.parse(filters)
    } catch {
      return []
    }
  }
  if (Array.isArray(filters)) {
    return filters.map((f) => (f.length === 4 ? [f[1], f[2], f[3]] : f.length === 2 ? [f[0], '=', f[1]] : f))
  }
  return Object.entries(filters).map(([k, v]) => (Array.isArray(v) ? [k, v[0], v[1]] : [k, '=', v]))
}

export function matches(doc, filters) {
  return normalizeFilters(filters).every(([field, op, value]) => test(doc[field], op, value))
}

// ---- Answers the server gives online ------------------------------------

// chw.api.get_list_page
export async function listPage({ doctype, fields, filters, search, order_by, start = 0, page_length = 20 }) {
  const meta = await getMeta(doctype)
  let rows = (await allRecords(doctype)).filter((r) => matches(r, filters))
  const term = String(search || '').trim().toLowerCase()
  if (term) {
    const searchFields = new Set(['name'])
    if (meta?.title_field) searchFields.add(meta.title_field)
    for (const f of meta?.fields || []) if (f.in_list_view) searchFields.add(f.fieldname)
    rows = rows.filter((r) => [...searchFields].some((f) => String(r[f] ?? '').toLowerCase().includes(term)))
  }
  const [sortField, sortOrder] = String(order_by || 'modified desc').split(/\s+/)
  rows.sort((a, b) => compare(a[sortField], b[sortField]) * (sortOrder === 'asc' ? 1 : -1))
  const wanted = typeof fields === 'string' ? JSON.parse(fields || '[]') : fields || []
  const pick = (r) => {
    const out = { name: r.name, modified: r.modified, __offline: r.__offline }
    for (const f of wanted) out[f] = r[f]
    return out
  }
  const from = Number(start) || 0
  return { rows: rows.slice(from, from + (Number(page_length) || 20)).map(pick), total: rows.length }
}

// frappe.desk.search.search_link -> [{ value, description }]
export async function searchLink({ doctype, txt, filters, page_length = 20 }) {
  const meta = await getMeta(doctype)
  const fields = new Set(['name'])
  if (meta?.title_field) fields.add(meta.title_field)
  for (const f of String(meta?.search_fields || '').split(',')) if (f.trim()) fields.add(f.trim())
  const term = String(txt || '').trim().toLowerCase()
  const rows = (await allRecords(doctype))
    .filter((r) => matches(r, filters))
    .filter((r) => !term || [...fields].some((f) => String(r[f] ?? '').toLowerCase().includes(term)))
    .sort((a, b) => compare(b.modified, a.modified))
    .slice(0, Number(page_length) || 20)
  return rows.map((r) => {
    const extra = [...fields].filter((f) => f !== 'name').map((f) => r[f]).filter((v) => !blank(v) && v !== r.name)
    return { value: r.name, label: meta?.title_field ? r[meta.title_field] : undefined, description: extra.join(', ') }
  })
}

// frappe.client.get_value
export async function getValue({ doctype, filters, fieldname }) {
  let doc = null
  if (typeof filters === 'string' && !filters.trim().startsWith('{') && !filters.trim().startsWith('[')) {
    doc = await getRecord(doctype, filters)
  } else {
    doc = (await allRecords(doctype)).find((r) => matches(r, filters)) || null
  }
  if (!doc) return null
  let names = fieldname
  if (typeof names === 'string') {
    try {
      names = names.trim().startsWith('[') ? JSON.parse(names) : [names]
    } catch {
      names = [names]
    }
  }
  const out = {}
  for (const f of names || ['name']) out[f] = doc[f] ?? null
  return out
}

// chw.api.get_module_record_counts, for the doctypes on this phone.
export async function recordCounts(doctypes) {
  const counts = {}
  for (const doctype of doctypes) counts[doctype] = (await hasDoctype(doctype)) ? (await allRecords(doctype)).length : null
  return counts
}

export async function connectionCounts(links, name) {
  const out = []
  for (const link of links) {
    if (!(await hasDoctype(link.doctype))) continue
    const count = (await allRecords(link.doctype)).filter((r) => String(r[link.fieldname] ?? '') === String(name)).length
    out.push({ ...link, count })
  }
  return out
}

export async function connectionRecords({ doctype, fieldname, value, limit = 20 }) {
  const meta = await getMeta(doctype)
  return (await allRecords(doctype))
    .filter((r) => String(r[fieldname] ?? '') === String(value))
    .sort((a, b) => compare(b.creation, a.creation))
    .slice(0, Number(limit) || 20)
    .map((r) => ({ name: r.name, title: meta?.title_field ? r[meta.title_field] : null, creation: r.creation }))
}

// ---- Outbox -------------------------------------------------------------

export function randomId() {
  if (crypto?.randomUUID) return crypto.randomUUID()
  return `${Date.now().toString(16)}-${Math.random().toString(16).slice(2)}`
}

let seqCounter = 0
const nextSeq = () => Date.now() * 1000 + (seqCounter++ % 1000)

export const TEMP_PREFIX = 'OFFLINE-'
export const isTempName = (name) => String(name || '').startsWith(TEMP_PREFIX)

// "2026-10-12 14:05:09.123000" - Frappe's own format, so offline records
// sort and show like synced ones.
export function nowString() {
  const d = new Date()
  const p = (n, w = 2) => String(n).padStart(w, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}.${p(d.getMilliseconds(), 3)}000`
}

const VALUE_SKIP = new Set(['Section Break', 'Column Break', 'Tab Break', 'HTML', 'Heading', 'Button'])
const ROW_META = new Set(['name', 'owner', 'creation', 'modified', 'modified_by', 'docstatus', 'idx', 'parent', 'parentfield', 'parenttype', 'doctype'])

function plainRows(rows) {
  return JSON.stringify(
    (rows || []).map((r) => Object.fromEntries(Object.entries(r).filter(([k, v]) => !ROW_META.has(k) && !k.startsWith('__') && !blank(v)))),
  )
}

function sameField(a, b, isTable) {
  if (isTable) return plainRows(a) === plainRows(b)
  if (blank(a) && blank(b)) return true
  return String(a) === String(b)
}

// JSON copy: what goes into IndexedDB must be plain data, not Vue proxies.
const plain = (v) => JSON.parse(JSON.stringify(v ?? null))

async function refreshCounts() {
  const all = await idb.getAll('outbox').catch(() => [])
  offlineState.pending = all.filter((e) => e.status === 'pending' || e.status === 'syncing').length
  offlineState.errors = all.filter((e) => e.status === 'error').length
  offlineState.conflicts = all.filter((e) => e.status === 'conflict').length
}
export { refreshCounts }

export async function outboxEntries() {
  const all = await idb.getAll('outbox').catch(() => [])
  return all.sort((a, b) => a.seq - b.seq)
}

export async function putOutbox(entry) {
  await idb.put('outbox', plain(entry))
  await refreshCounts()
}

export async function removeOutbox(id) {
  await idb.delete('outbox', id)
  await refreshCounts()
}

// A new record saved offline: kept on the phone under a temporary name
// (OFFLINE-…) until the server gives it its real ID on sync.
// `id` is passed when an online save broke off half way: the same id went
// to the server, so if it did arrive, the sync gets that record back
// instead of making a second one.
export async function queueInsert(doc, id = randomId()) {
  const doctype = doc.doctype
  const name = `${TEMP_PREFIX}${id.replace(/-/g, '').slice(0, 10).toUpperCase()}`
  const stamp = nowString()
  const data = plain({ ...doc, name })
  const record = {
    ...data,
    doctype,
    name,
    creation: stamp,
    modified: stamp,
    owner: offlineState.user || null,
    docstatus: 0,
    __offline: 'insert',
  }
  await putRecords(doctype, [record])
  await putOutbox({ id, seq: nextSeq(), action: 'insert', doctype, name, doc: data, status: 'pending', created: stamp })
  return record
}

// An edit saved offline. Only the fields that changed are queued, with
// what they held before - so on sync the server can tell an edit made by
// someone else to the same field (a conflict) from one to other fields.
export async function queueUpdate(doctype, name, values) {
  const record = await getRecord(doctype, name)
  if (!record) throw new Error('This record is not on this phone.')
  const meta = await getMeta(doctype)
  const tableFields = new Set((meta?.fields || []).filter((f) => f.fieldtype === 'Table' || f.fieldtype === 'Table MultiSelect').map((f) => f.fieldname))
  const valueFields = (meta?.fields || []).filter((f) => !VALUE_SKIP.has(f.fieldtype)).map((f) => f.fieldname)

  const changes = {}
  for (const f of valueFields) {
    if (!(f in values)) continue
    if (!sameField(values[f], record[f], tableFields.has(f))) changes[f] = plain(values[f])
  }
  const updated = { ...record, ...changes, modified: nowString() }
  if (!Object.keys(changes).length) return record

  const entries = await outboxEntries()
  if (record.__offline === 'insert') {
    // Not on the server yet: the queued insert simply carries the new values.
    const entry = entries.find((e) => e.action === 'insert' && e.doctype === doctype && e.name === name)
    if (entry) {
      entry.doc = { ...entry.doc, ...changes }
      if (entry.status === 'error') entry.status = 'pending'
      await putOutbox(entry)
    }
    updated.__offline = 'insert'
  } else {
    let entry = entries.find((e) => e.action === 'update' && e.doctype === doctype && e.name === name && e.status !== 'syncing')
    if (!entry) {
      entry = { id: randomId(), seq: nextSeq(), action: 'update', doctype, name, changes: {}, base: {}, base_modified: record.modified, status: 'pending', created: nowString() }
    }
    for (const [f, v] of Object.entries(changes)) {
      // The value before the *first* offline edit is the one the server knew.
      if (!(f in entry.changes)) entry.base[f] = plain(record[f])
      entry.changes[f] = v
    }
    if (entry.status === 'error') entry.status = 'pending'
    await putOutbox(entry)
    updated.__offline = 'update'
  }
  await putRecords(doctype, [updated])
  return updated
}

// ---- Cached answers -----------------------------------------------------

export function getCachedAnswer(key) {
  return idb.get('kv', `answer:${key}`).catch(() => null)
}

export function putCachedAnswer(key, body) {
  return idb.put('kv', body, `answer:${key}`).catch(() => {})
}

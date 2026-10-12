// Offline mode's one switch point. Every request the app makes - frappe-ui's
// call(), useCall, useDoc, createResource - goes through window.fetch, so
// wrapping it here makes every screen work offline without each one
// knowing about it:
//   - reads go to the server while it answers, and teach the phone (forms,
//     records, other answers); with no network they're answered from the
//     phone's copy instead
//   - a new record or an edit with no network goes to the Outbox (see
//     store.js) and is answered as saved; sync.js sends it later
//   - anything else (delete, translate ...) says plainly it needs internet

import { idb } from './db'
import { offlineState, markOnline, markOffline } from './state'
import {
  connectionCounts,
  connectionRecords,
  getCachedAnswer,
  getMeta,
  getRecord,
  getValue,
  hasDoctype,
  isTempName,
  listPage,
  allRecords,
  matches,
  putCachedAnswer,
  putMetas,
  putRecords,
  queueInsert,
  queueUpdate,
  randomId,
  recordCounts,
  searchLink,
} from './store'
import { t } from '@/data/i18n'

let realFetch = null

// A request that hangs (a tower with no data) counts as offline after this.
const READ_TIMEOUT_MS = 15000
// Methods that only read - safe to answer from the phone's copy. Anything
// else is treated as a change and never answered from an old copy.
const READ_RE = /^(get|search|has_|fetch|load|list|count|validate)/
const READ_METHODS = new Set(['frappe.auth.get_logged_user'])
// Too big, too frequent, or already answered from the records themselves.
const NO_CACHE = new Set([
  'frappe.desk.search.search_link',
  'chw.api.get_list_page',
  'chw.offline.get_offline_data',
  'chw.api.get_connection_records',
])

function stable(value) {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((k) => `${JSON.stringify(k)}:${stable(value[k])}`).join(',')}}`
  }
  return JSON.stringify(value ?? null)
}

// Params arrive as JSON text ('["a","b"]') or real values - read both.
function parsed(value) {
  if (typeof value !== 'string') return value
  const s = value.trim()
  if (!s.startsWith('{') && !s.startsWith('[')) return value
  try {
    return JSON.parse(s)
  } catch {
    return value
  }
}

function describe(input, init = {}) {
  if (typeof input !== 'string' && !(input instanceof URL)) return null
  const url = new URL(String(input), window.location.origin)
  if (url.origin !== window.location.origin || !url.pathname.startsWith('/api/')) return null

  const http = String(init.method || 'GET').toUpperCase()
  const params = {}
  url.searchParams.forEach((v, k) => (params[k] = v))
  if (typeof init.body === 'string') {
    try {
      Object.assign(params, JSON.parse(init.body))
    } catch {
      new URLSearchParams(init.body).forEach((v, k) => (params[k] = v))
    }
  } else if (init.body instanceof URLSearchParams) {
    init.body.forEach((v, k) => (params[k] = v))
  } else if (init.body) {
    // FormData (file upload) and the like - never answered offline.
    return { url, http, v2: url.pathname.startsWith('/api/v2/'), kind: 'other', write: http !== 'GET', params }
  }

  const v2 = url.pathname.startsWith('/api/v2/')
  const path = url.pathname
  let m
  const req = { url, http, v2, params, key: `${http} ${path}?${url.searchParams}#${stable(params)}` }
  if ((m = path.match(/^\/api\/(?:v2\/)?method\/(.+)$/))) {
    req.kind = 'method'
    req.method = decodeURIComponent(m[1])
    const last = req.method.split('.').pop()
    req.write = !(http === 'GET' || READ_METHODS.has(req.method) || READ_RE.test(last))
  } else if ((m = path.match(/^\/api\/v2\/doctype\/([^/]+)\/meta$/))) {
    Object.assign(req, { kind: 'meta', doctype: decodeURIComponent(m[1]), write: false })
  } else if ((m = path.match(/^\/api\/v2\/document\/([^/]+)\/([^/]+)$/))) {
    Object.assign(req, { kind: 'doc', doctype: decodeURIComponent(m[1]), name: decodeURIComponent(m[2]), write: http !== 'GET' })
  } else if ((m = path.match(/^\/api\/v2\/document\/([^/]+)$/))) {
    Object.assign(req, { kind: 'doclist', doctype: decodeURIComponent(m[1]), write: http !== 'GET' })
  } else {
    Object.assign(req, { kind: 'other', write: http !== 'GET' })
  }
  return req
}

function respond(req, value) {
  const body = req.v2 ? { data: value } : { message: value }
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json', 'X-CHW-Offline': '1' },
  })
}

function offlineError(req, message) {
  const text = message || t('You are offline. This needs an internet connection.')
  return new Response(
    JSON.stringify({
      message: text,
      _error_message: text,
      exc_type: 'OfflineError',
      errors: [{ type: t('Offline'), message: text }],
    }),
    { status: 503, headers: { 'Content-Type': 'application/json', 'X-CHW-Offline': '1' } },
  )
}

function withTimeout(promise, ms) {
  let timer
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new TypeError('Network timeout')), ms)
    }),
  ]).finally(() => clearTimeout(timer))
}

const looksOffline = () => !offlineState.online || (typeof navigator !== 'undefined' && navigator.onLine === false)

// ---- Learning from the server's answers ----------------------------------

async function learn(req, res) {
  try {
    const text = await res.text()
    if (text.length > 2_000_000) return
    const body = JSON.parse(text)
    const value = req.v2 ? body.data : body.message
    if (req.kind === 'meta' && value?.name) {
      await putMetas({ [value.name]: value })
    } else if (req.kind === 'doc' && value?.name) {
      await keepRecord(req.doctype, value)
    } else if (req.kind === 'method' && req.method === 'frappe.client.get' && value?.name) {
      await keepRecord(value.doctype || req.params.doctype, value)
    }
    if (req.kind === 'method' && !NO_CACHE.has(req.method)) await putCachedAnswer(req.key, text)
  } catch {
    // Only a missed chance to remember - never an error for the screen.
  }
}

// A record seen online refreshes the phone's copy - unless the phone holds
// an offline edit to it, which must not be thrown away.
async function keepRecord(doctype, doc) {
  if (!doctype || !(await hasDoctype(doctype))) return
  const local = await getRecord(doctype, doc.name)
  if (local?.__offline) return
  await putRecords(doctype, [doc])
}

async function cachedResponse(req) {
  const text = await getCachedAnswer(req.key)
  if (!text) return null
  return new Response(text, { status: 200, headers: { 'Content-Type': 'application/json', 'X-CHW-Offline': '1' } })
}

async function cachedValue(method) {
  // The newest stored answer of a no-argument method (e.g. the app modules).
  for (const http of ['GET', 'POST']) {
    for (const prefix of ['/api/v2/method/', '/api/method/']) {
      const text = await getCachedAnswer(`${http} ${prefix}${method}?#{}`)
      if (text) {
        const body = JSON.parse(text)
        return body.data ?? body.message
      }
    }
  }
  return null
}

// ---- Answering from the phone --------------------------------------------

async function answerLocally(req) {
  const p = req.params
  if (req.kind === 'meta') {
    const meta = await getMeta(req.doctype)
    return meta ? respond(req, meta) : null
  }
  if (req.kind === 'doc' && req.http === 'GET') {
    const doc = await getRecord(req.doctype, req.name)
    return doc ? respond(req, doc) : cachedResponse(req)
  }
  if (req.kind !== 'method') return null

  switch (req.method) {
    case 'frappe.client.get': {
      const doc = await getRecord(p.doctype, p.name)
      if (doc) return respond(req, doc)
      break
    }
    case 'frappe.client.get_value':
      if (await hasDoctype(p.doctype)) {
        const value = await getValue({ doctype: p.doctype, filters: parsed(p.filters), fieldname: parsed(p.fieldname) })
        if (value) return respond(req, value)
      }
      break
    case 'frappe.desk.search.search_link':
      if (await hasDoctype(p.doctype)) return respond(req, await searchLink({ ...p, filters: parsed(p.filters) }))
      break
    case 'chw.api.get_list_page':
      if (await hasDoctype(p.doctype)) return respond(req, await listPage({ ...p, filters: parsed(p.filters) }))
      break
    case 'chw.api.get_module_record_counts': {
      const modules = (await cachedValue('chw.api.get_app_modules')) || []
      const doctypes = [...new Set(modules.flatMap((m) => (m.doctypes || []).map((d) => d.doctype_name)))]
      const cached = (await cachedValue('chw.api.get_module_record_counts')) || {}
      const local = await recordCounts(doctypes)
      for (const d of doctypes) if (local[d] == null) local[d] = cached[d] ?? null
      return respond(req, local)
    }
    case 'chw.api.get_doc_connections': {
      const modules = (await cachedValue('chw.api.get_app_modules')) || []
      const item = modules.flatMap((m) => m.doctypes || []).find((d) => d.doctype_name === p.doctype)
      if (item?.links?.length) return respond(req, await connectionCounts(item.links, p.name))
      break
    }
    case 'chw.api.get_connection_records':
      if (await hasDoctype(p.doctype)) return respond(req, await connectionRecords(p))
      break
    case 'frappe.client.has_permission': {
      const cached = await cachedResponse(req)
      if (cached) return cached
      // Never asked online: allow everything but delete - the server still
      // checks every change when it syncs.
      return respond(req, { has_permission: p.perm_type !== 'delete' })
    }
  }
  return cachedResponse(req)
}

// What a write is, in Outbox terms - or null when it can't be done offline.
function outboxTarget(req) {
  const p = req.params
  if (req.kind === 'method' && req.method === 'frappe.client.insert') {
    const doc = parsed(p.doc)
    return doc?.doctype ? { action: 'insert', doc } : null
  }
  if (req.kind === 'method' && req.method === 'frappe.client.save') {
    const doc = parsed(p.doc)
    return doc?.doctype && doc?.name ? { action: 'update', doctype: doc.doctype, name: doc.name, values: doc } : null
  }
  if (req.kind === 'doclist' && req.http === 'POST') return { action: 'insert', doc: { ...p, doctype: req.doctype } }
  if (req.kind === 'doc' && req.http === 'PUT') return { action: 'update', doctype: req.doctype, name: req.name, values: p }
  return null
}

async function saveLocally(req, target, clientId) {
  if (target.action === 'insert') {
    if (!(await hasDoctype(target.doc.doctype))) {
      return offlineError(req, t('This form cannot be saved offline yet. Connect to the internet once so the phone can download it.'))
    }
    const record = await queueInsert(target.doc, clientId)
    window.dispatchEvent(new CustomEvent('chw:queued', { detail: record }))
    return respond(req, record)
  }
  if (!(await getRecord(target.doctype, target.name))) {
    return offlineError(req, t('This record is not on this phone, so it cannot be changed offline.'))
  }
  const record = await queueUpdate(target.doctype, target.name, target.values)
  window.dispatchEvent(new CustomEvent('chw:queued', { detail: record }))
  return respond(req, record)
}

// Records made offline, shown on the first page of their list while
// online too - until they sync, the server doesn't know them.
async function withUnsynced(req, res) {
  const p = req.params
  if (Number(p.start || 0) !== 0 || !(await hasDoctype(p.doctype))) return res
  const local = (await allRecords(p.doctype)).filter((r) => r.__offline === 'insert' && matches(r, parsed(p.filters)))
  if (!local.length) return res
  try {
    const body = await res.clone().json()
    const page = req.v2 ? body.data : body.message
    const fields = parsed(p.fields) || []
    const rows = local.map((r) => Object.fromEntries([['name', r.name], ['modified', r.modified], ['__offline', 'insert'], ...fields.map((f) => [f, r[f]])]))
    page.rows = [...rows, ...(page.rows || [])]
    page.total = (page.total || 0) + rows.length
    return respond(req, page)
  } catch {
    return res
  }
}

async function proxied(input, init = {}) {
  let req = describe(input, init)
  if (!req) return realFetch(input, init)

  // A form still open on a record that has since synced: talk to the
  // server about its real ID.
  if (req.kind === 'doc' && isTempName(req.name)) {
    const realName = ((await idb.get('kv', 'idmap').catch(() => null)) || {})[req.name]
    if (realName) {
      input = String(input).replace(encodeURIComponent(req.name), encodeURIComponent(realName)).replace(req.name, realName)
      req = describe(input, init)
    }
  }

  // Records made offline exist only on this phone until they sync.
  if (req.kind === 'doc' && isTempName(req.name)) {
    if (req.http === 'GET') return (await answerLocally(req)) || offlineError(req)
    if (req.http === 'PUT') return saveLocally(req, outboxTarget(req))
    return offlineError(req, t('This record has not synced yet.'))
  }
  if (req.kind === 'method' && ['frappe.client.get', 'frappe.client.get_value'].includes(req.method) && isTempName(req.params.name ?? req.params.filters)) {
    return (await answerLocally(req)) || offlineError(req)
  }

  if (req.write) {
    const target = outboxTarget(req)
    if (looksOffline()) return target ? saveLocally(req, target) : offlineError(req)
    // A new record goes in under an id of the phone's own, so that if the
    // connection drops after the server saved it - but before the answer
    // came back - the queued retry gets that record, not a duplicate.
    const clientId = target?.action === 'insert' && (await hasDoctype(target.doc.doctype)) ? randomId() : null
    try {
      let res
      if (clientId) {
        res = await realFetch('/api/method/chw.offline.push_insert', {
          ...init,
          method: 'POST',
          body: JSON.stringify({ client_id: clientId, doc: target.doc }),
        })
        if (res.ok) {
          const body = await res.json()
          res = respond(req, body.message?.doc)
          // Same notices a plain insert would show (msgprint on save).
          if (body._server_messages) {
            const out = await res.json()
            out._server_messages = body._server_messages
            res = new Response(JSON.stringify(out), { status: 200, headers: { 'Content-Type': 'application/json' } })
          }
        }
      } else {
        res = await realFetch(input, init)
      }
      markOnline()
      if (res.ok && target) learn({ ...req, kind: 'doc', doctype: target.doctype || target.doc?.doctype }, res.clone())
      return res
    } catch (e) {
      if (init.signal?.aborted) throw e
      markOffline()
      return target ? saveLocally(req, target, clientId || undefined) : offlineError(req)
    }
  }

  if (looksOffline()) {
    const local = await answerLocally(req)
    if (local) return local
    return offlineError(req)
  }
  try {
    const pending = realFetch(input, init)
    let res
    try {
      res = await withTimeout(pending, READ_TIMEOUT_MS)
    } catch (e) {
      if (e?.message !== 'Network timeout') throw e
      // Slow, not necessarily offline (a busy server, a big report): use
      // the phone's copy if there is one, else keep waiting for the server.
      // Never marked offline for slowness alone - only a failed request is.
      const local = await answerLocally(req)
      if (local) return local
      res = await pending
    }
    // A gateway error is the server being unreachable, not an answer.
    if ([502, 503, 504].includes(res.status)) {
      const local = await answerLocally(req)
      if (local) return local
      return res
    }
    markOnline()
    if (res.ok) {
      learn(req, res.clone())
      if (req.kind === 'method' && req.method === 'chw.api.get_list_page') return withUnsynced(req, res)
    }
    return res
  } catch (e) {
    if (init.signal?.aborted) throw e
    markOffline()
    const local = await answerLocally(req)
    if (local) return local
    throw e
  }
}

export function installFetchProxy() {
  if (realFetch || typeof window === 'undefined') return
  realFetch = window.fetch.bind(window)
  window.fetch = proxied
}

// For sync.js: straight to the server, never answered from the phone.
export function networkFetch(input, init) {
  return (realFetch || window.fetch)(input, init)
}

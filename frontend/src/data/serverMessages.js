// Desk shows a server's frappe.msgprint() messages after a save or call
// (e.g. "Baby added to Family members as FM-00066", "PNC could not be
// created automatically"). frappe-ui's data calls drop them, so the Vue app
// never showed them. This watches every successful API response and shows
// its messages as toasts, coloured by the server's indicator. Failed calls
// are skipped: the caller already shows the error, and showing it twice
// would be noise.

import { toast } from 'frappe-ui'

function plain(text) {
  return String(text || '')
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]*>/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function show(raw) {
  let msg = raw
  try {
    msg = typeof raw === 'string' ? JSON.parse(raw) : raw
  } catch {
    msg = { message: raw }
  }
  const text = plain(msg?.message ?? msg)
  if (!text) return
  const indicator = msg?.indicator
  if (indicator === 'green') toast.success(text)
  else if (indicator === 'red') toast.error(text)
  else if (['orange', 'yellow'].includes(indicator)) toast.warning(text)
  else toast.info(text)
}

export function installServerMessages() {
  const originalFetch = window.fetch.bind(window)
  window.fetch = async (...args) => {
    const response = await originalFetch(...args)
    try {
      const url = typeof args[0] === 'string' ? args[0] : args[0]?.url || ''
      const isJson = (response.headers.get('content-type') || '').includes('application/json')
      if (response.ok && isJson && url.includes('/api/')) {
        // A clone, so the caller still gets an unread body.
        response
          .clone()
          .json()
          .then((data) => {
            if (!data?._server_messages) return
            for (const m of JSON.parse(data._server_messages) || []) show(m)
          })
          .catch(() => {})
      }
    } catch {
      // Never let the message display break the request itself.
    }
    return response
  }
}

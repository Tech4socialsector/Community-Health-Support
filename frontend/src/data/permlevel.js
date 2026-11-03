import { reactive, watch } from 'vue'
import { call } from 'frappe-ui'

// Which Document Permission Levels the current user may read/write on this
// doctype - whatever Role Permission Manager / Custom DocPerm says for their
// roles, same source Desk's own form renderer reads. Lets DynamicField and
// ChildTable grey out exactly the fields/tables a permlevel restricts,
// instead of only finding out when a save silently gets reset or rejected.
//
// Uses plain `call()` (not `useCall`) - every other whitelisted RPC check in
// this app (has_permission for create/write/delete) already goes through
// `call()` successfully; `useCall` against this same /api/method/ endpoint
// was silently hitting the server as an unauthenticated Guest (confirmed via
// the server's Error Log - `is_guest = True` on every request, regardless of
// GET or POST), for a reason that didn't trace to anything this app's code
// controls. Not worth chasing further when a proven path already exists.
const cache = new Map()

function fetchPermlevelAccess(doctype) {
  if (!cache.has(doctype)) {
    cache.set(
      doctype,
      call('chw.api.get_permlevel_access', { doctype }).catch(() => ({ read: [0], write: [0] })),
    )
  }
  return cache.get(doctype)
}

export function usePermlevelAccess(doctype) {
  // Matches useCall's shape (a `reactive()` wrapper), which the caller reads
  // as `permlevelResource.data?.write` with no `.value` - a plain `{ data:
  // ref(...) }` would hand back the raw ref there instead of its contents.
  const state = reactive({ data: null })
  watch(
    () => doctype,
    async (dt) => {
      state.data = dt ? await fetchPermlevelAccess(dt) : null
    },
    { immediate: true },
  )
  return state
}

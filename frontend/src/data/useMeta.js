import { computed } from 'vue'
import { useCall } from 'frappe-ui'

// Live doctype metadata (fields, list settings, etc), fetched once per
// doctype and cached - this is the single source of truth DoctypeList and
// DoctypeForm render from. No per-doctype Vue files: adding a field in the
// desk's DocType editor shows up here automatically on next load.
export function useMeta(doctype) {
  return useCall({
    url: `/api/v2/doctype/${doctype}/meta`,
    method: 'GET',
    cacheKey: `chw-meta-${doctype}`,
  })
}

const SKIP_FIELDTYPES = new Set([
  'Section Break',
  'Column Break',
  'Tab Break',
  'HTML',
  'Heading',
  'Button',
])

function isDisplayField(field) {
  return !SKIP_FIELDTYPES.has(field.fieldtype) && !field.hidden
}

// Fields shown as columns on the list view: explicit in_list_view fields, or
// (name + first few visible fields) as a fallback so a doctype with none
// configured still renders something useful.
export function useListFields(metaResource) {
  return computed(() => {
    const meta = metaResource.data
    if (!meta) return []
    let fields = meta.fields.filter((f) => f.in_list_view && isDisplayField(f))
    if (!fields.length) {
      fields = meta.fields.filter(isDisplayField).slice(0, 4)
    }
    return fields
  })
}

// Fields shown on the form: every non-table, non-layout, non-hidden field.
// Table MultiSelect is kept here (not treated like Table) - it renders as a
// single multi-select control via DynamicField, not a child-table grid.
export function useFormFields(metaResource) {
  return computed(() => {
    const meta = metaResource.data
    if (!meta) return []
    return meta.fields.filter((f) => isDisplayField(f) && f.fieldtype !== 'Table')
  })
}

// Child-table fields, rendered as their own grid sections below the main form.
export function useTableFields(metaResource) {
  return computed(() => {
    const meta = metaResource.data
    if (!meta) return []
    return meta.fields.filter((f) => f.fieldtype === 'Table' && !f.hidden)
  })
}

const FILTERABLE_FIELDTYPES = new Set(['Select', 'Link', 'Check', 'Date', 'Datetime', 'Data', 'Int'])

// Fields shown in the list view's filter bar: explicit in_standard_filter
// fields (Frappe's own "which fields get quick filters" convention), or the
// list-view columns as a fallback, narrowed to fieldtypes a plain
// dropdown/text/date control can filter on sensibly.
export function useFilterFields(metaResource) {
  return computed(() => {
    const meta = metaResource.data
    if (!meta) return []
    let fields = meta.fields.filter((f) => f.in_standard_filter && isDisplayField(f))
    if (!fields.length) {
      fields = meta.fields.filter((f) => f.in_list_view && isDisplayField(f))
    }
    return fields.filter((f) => FILTERABLE_FIELDTYPES.has(f.fieldtype))
  })
}

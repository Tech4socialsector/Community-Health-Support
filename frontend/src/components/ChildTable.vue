<template>
  <!-- Desk's child-table grid, at every screen size: label, a bordered
  grid (tick box, No., the in_list_view columns, an edit pencil), and Add
  Row / Delete underneath. A row opens its full set of fields in a dialog,
  like Desk's row form. -->
  <div>
    <h3 class="mb-2 text-sm text-gray-700 dark:text-gray-300">{{ field.label }}</h3>

    <div class="overflow-x-auto rounded-md border border-gray-200 dark:border-gray-700">
      <table class="w-full table-fixed border-collapse text-left text-sm" :style="{ minWidth: rows.length ? tableMinWidth : undefined }">
        <thead class="bg-gray-50 text-xs text-gray-600 dark:bg-gray-800 dark:text-gray-400">
          <tr>
            <th class="w-9 border-b border-r border-gray-200 px-2 py-2 dark:border-gray-700">
              <input
                type="checkbox"
                class="h-3.5 w-3.5 rounded border-gray-300"
                :checked="rows.length > 0 && selectedKeys.size === rows.length"
                :disabled="!rows.length"
                aria-label="Select all rows"
                @change="toggleAll($event.target.checked)"
              />
            </th>
            <th class="w-11 border-b border-r border-gray-200 px-2 py-2 font-medium dark:border-gray-700">No.</th>
            <th
              v-for="col in gridColumns"
              :key="col.fieldname"
              class="truncate border-b border-r border-gray-200 px-2 py-2 font-medium dark:border-gray-700"
              :title="col.label"
            >
              {{ col.label }}
            </th>
            <th class="w-9 border-b border-gray-200 dark:border-gray-700" />
          </tr>
        </thead>
        <tbody>
          <tr v-if="!rows.length">
            <td :colspan="gridColumns.length + 3" class="px-3 py-6 text-center text-sm text-gray-400">No Data</td>
          </tr>
          <tr
            v-for="(row, idx) in rows"
            :key="keyOf(row)"
            class="cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/60"
            :class="[{ 'bg-gray-50 dark:bg-gray-800/60': selectedKeys.has(keyOf(row)) }, rowClass ? rowClass(row) : '']"
            @click="openRow(idx)"
          >
            <td class="border-b border-r border-gray-200 px-2 py-2 dark:border-gray-700" @click.stop>
              <input
                type="checkbox"
                class="h-3.5 w-3.5 rounded border-gray-300"
                :checked="selectedKeys.has(keyOf(row))"
                :aria-label="`Select row ${idx + 1}`"
                @change="toggleRow(row, $event.target.checked)"
              />
            </td>
            <td class="border-b border-r border-gray-200 px-2 py-2 text-gray-500 dark:border-gray-700 dark:text-gray-400">{{ idx + 1 }}</td>
            <td
              v-for="col in gridColumns"
              :key="col.fieldname"
              class="truncate border-b border-r border-gray-200 px-2 py-2 text-gray-900 dark:border-gray-700 dark:text-gray-100"
            >
              {{ formatFieldValue(row[col.fieldname], col) }}
            </td>
            <td class="border-b border-gray-200 px-1 py-1 text-center dark:border-gray-700">
              <button
                type="button"
                class="inline-flex h-7 w-7 items-center justify-center rounded text-gray-400 hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-gray-700"
                :aria-label="`Edit row ${idx + 1}`"
                @click.stop="openRow(idx)"
              >
                <LucideIcon name="pencil" class="h-3.5 w-3.5" />
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <div class="mt-2 flex items-center gap-2">
      <Button size="sm" @click="addRow">Add Row</Button>
      <Button v-if="selectedKeys.size" size="sm" theme="red" @click="deleteSelected">Delete</Button>
    </div>

    <Dialog v-model="showRowEditor" :options="{ title: `${field.label} - Row ${(editingIdx ?? 0) + 1}`, size: 'xl' }">
      <template #body-content>
        <div v-if="editingRow" class="grid grid-cols-1 gap-4">
          <DynamicField
            v-for="col in editorColumns"
            :key="col.fieldname"
            :field="col"
            :doctype="doctype"
            :docname="docname"
            :doc="editingRow"
            :parent-doc="parentDoc"
            :link-query="col.fieldtype === 'Link' && linkQueryFor ? linkQueryFor(col.fieldname, editingRow) : null"
            v-model="editingRow[col.fieldname]"
          />
        </div>
      </template>
      <template #actions>
        <Button variant="solid" class="w-full" @click="showRowEditor = false">
          Done
        </Button>
      </template>
    </Dialog>
  </div>
</template>

<script setup>
import { computed, nextTick, reactive, ref } from 'vue'
import { Button, Dialog } from 'frappe-ui'
import DynamicField from '@/components/DynamicField.vue'
import LucideIcon from '@/components/LucideIcon.vue'
import { useMeta, useFormFields } from '@/data/useMeta'
import { formatFieldValue, isEmptyValue } from '@/data/recordFormat'
import { visibleFieldnames, withLiveRequired } from '@/data/dependsOn'
import { applyDefaults } from '@/data/defaults'
import { rowKey } from '@/data/rowKey'

const { field, modelValue, doctype, docname, parentDoc, linkQueryFor, rowClass } = defineProps({
  field: { type: Object, required: true },
  modelValue: { type: Array, default: () => [] },
  doctype: { type: String, default: null },
  docname: { type: String, default: null },
  // The main record - Desk conditions inside a row can test it as `parent`.
  parentDoc: { type: Object, default: null },
  // From the doctype's hook module: Desk set_query for a Link inside a row,
  // and a CSS class per row (e.g. an open urgent visit tinted red).
  linkQueryFor: { type: Function, default: null },
  rowClass: { type: Function, default: null },
})
const emit = defineEmits(['update:modelValue', 'row-added', 'rows-removed'])

const childMetaResource = useMeta(field.options)
const columns = useFormFields(childMetaResource)

// Desk's grid shows the child doctype's in_list_view fields, as many as fit
// its 12-unit row (each field takes its `columns` setting - Check 1, others
// 2 by default); the rest are on the row form. Same columns on a phone,
// where the grid scrolls sideways, as Desk's does.
const ROW_UNITS = 12
function fitsDeskRow(fields) {
  const shown = []
  let used = 0
  for (const f of fields) {
    const size = Number(f.columns) || (f.fieldtype === 'Check' ? 1 : 2)
    if (used + size > ROW_UNITS) break
    used += size
    shown.push(f)
  }
  return shown.length ? shown : fields.slice(0, 1)
}

const gridColumns = computed(() => {
  const inListView = columns.value.filter((c) => c.in_list_view)
  return fitsDeskRow(inListView.length ? inListView : columns.value.slice(0, 4))
})

// Narrow screens: each column keeps a readable width and the grid scrolls
// sideways instead of squeezing every value to a few letters. An empty grid
// stays screen-wide, so its "No Data" isn't scrolled out of view.
const tableMinWidth = computed(() => `${5 + 2.25 + gridColumns.value.length * 8.5}rem`)

const rows = computed({
  get: () => modelValue || [],
  set: (v) => emit('update:modelValue', v),
})

// Shared with DoctypeForm, which uses the same keys to tell which row changed.
const keyOf = rowKey

function addRow() {
  // Mutate the array in place (it's the same reactive array the parent form
  // owns) rather than reassigning through the computed setter - reassigning
  // round-trips through the parent via emit('update:modelValue', ...), and
  // reading rows.value.length right after that in the same tick can still
  // see the pre-update array, opening the row editor on the wrong (stale)
  // index.
  // Desk fills a new row's field defaults (e.g. a visit's status
  // "Pending") as soon as it's added.
  rows.value.push(applyDefaults(childMetaResource.data?.fields, {}))
  const idx = rows.value.length - 1
  // Desk's <table>_add - the form's script may fill the new row (a visit's
  // dates from the schedule, the pregnancy's LMP ...). The live row, so its
  // changes land in the form.
  emit('row-added', rows.value[idx], idx)
  openRow(idx)
}

// ---- Tick boxes + Delete, as in Desk's grid ----
const selectedKeys = reactive(new Set())

function toggleRow(row, checked) {
  const key = keyOf(row)
  if (checked) selectedKeys.add(key)
  else selectedKeys.delete(key)
}

function toggleAll(checked) {
  selectedKeys.clear()
  if (checked) rows.value.forEach((row) => selectedKeys.add(keyOf(row)))
}

// Removed rows only leave the record when the form is saved - the form's
// "Not saved" label shows until then, as Desk's does.
function deleteSelected() {
  const removed = rows.value.filter((row) => selectedKeys.has(keyOf(row)))
  rows.value = rows.value.filter((row) => !selectedKeys.has(keyOf(row)))
  selectedKeys.clear()
  // Desk's <table>_remove - e.g. recalculate the next visit date.
  if (removed.length) nextTick(() => emit('rows-removed', removed))
}

const showRowEditor = ref(false)
const editingIdx = ref(null)
const editingRow = computed(() => (editingIdx.value == null ? null : rows.value[editingIdx.value]))

// The row form shows what Desk's row form would: fields whose depends_on
// holds for this row (`doc`) and the main record (`parent`), with
// mandatory_depends_on shown as required.
const editorColumns = computed(() => {
  if (!editingRow.value) return []
  const visible = visibleFieldnames(childMetaResource.data?.fields, editingRow.value, parentDoc)
  return columns.value.filter((c) => visible.has(c.fieldname)).map((c) => withLiveRequired(c, editingRow.value, parentDoc))
})

function openRow(idx) {
  editingIdx.value = idx
  showRowEditor.value = true
}
</script>

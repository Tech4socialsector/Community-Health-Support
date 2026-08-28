<template>
  <div>
    <div class="mb-2 flex items-center justify-between">
      <h3 class="text-sm font-medium text-gray-900 dark:text-gray-100">{{ field.label }}</h3>
      <Button variant="ghost" @click="addRow">
        + Add Row
      </Button>
    </div>

    <div class="overflow-x-auto rounded-lg border dark:border-gray-800">
      <table class="w-full min-w-[28rem] border-collapse text-left text-sm">
        <thead class="bg-gray-50 text-xs uppercase text-gray-500 dark:bg-gray-800 dark:text-gray-400">
          <tr>
            <th class="w-10 whitespace-nowrap border-b border-r px-3 py-2 dark:border-gray-800">#</th>
            <th
              v-for="col in summaryColumns"
              :key="col.fieldname"
              class="whitespace-nowrap border-b border-r px-3 py-2 dark:border-gray-800"
            >
              {{ col.label }}
            </th>
            <th class="w-16 border-b dark:border-gray-800"></th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="!rows.length">
            <td :colspan="summaryColumns.length + 2" class="px-3 py-4 text-center text-gray-500 dark:text-gray-400">
              No rows yet.
            </td>
          </tr>
          <tr
            v-for="(row, idx) in rows"
            :key="row.__key"
            class="cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800"
            @click="openRow(idx)"
          >
            <td class="whitespace-nowrap border-b border-r px-3 py-2 text-gray-500 dark:border-gray-800 dark:text-gray-400">
              {{ idx + 1 }}
            </td>
            <td
              v-for="col in summaryColumns"
              :key="col.fieldname"
              class="whitespace-nowrap border-b border-r px-3 py-2 text-gray-900 dark:border-gray-800 dark:text-gray-100"
            >
              {{ formatValue(row[col.fieldname], col) }}
            </td>
            <td class="border-b px-3 py-2 text-right dark:border-gray-800" @click.stop>
              <div class="flex items-center justify-end gap-1">
                <Tooltip text="Edit row">
                  <button
                    type="button"
                    class="flex h-7 w-7 items-center justify-center rounded text-gray-400 hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-gray-800 dark:hover:text-gray-200"
                    @click="openRow(idx)"
                  >
                    <FeatherIcon name="edit-2" class="h-4 w-4" />
                  </button>
                </Tooltip>
                <Tooltip text="Remove row">
                  <button
                    type="button"
                    class="flex h-7 w-7 items-center justify-center rounded text-gray-400 hover:bg-gray-100 hover:text-red-500 dark:hover:bg-gray-800"
                    @click="confirmRemoveRow(idx)"
                  >
                    <FeatherIcon name="trash-2" class="h-4 w-4" />
                  </button>
                </Tooltip>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <Dialog
      v-model="showRowEditor"
      :options="{ title: `${field.label} - Row ${(editingIdx ?? 0) + 1}`, size: 'xl' }"
    >
      <template #body-content>
        <div v-if="editingRow" class="grid grid-cols-1 gap-4">
          <DynamicField
            v-for="col in columns"
            :key="col.fieldname"
            :field="col"
            :doctype="doctype"
            :docname="docname"
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

    <Dialog
      v-model="showRemoveConfirm"
      :options="{
        title: 'Remove row?',
        message: 'This row will be removed once you save the form. This cannot be undone.',
        icon: { name: 'alert-triangle', appearance: 'danger' },
        actions: [
          { label: 'Remove', variant: 'solid', theme: 'red', onClick: doRemoveRow },
          { label: 'Cancel' },
        ],
      }"
    />
  </div>
</template>

<script setup>
import { computed, ref } from 'vue'
import { Button, FeatherIcon, Dialog, Tooltip } from 'frappe-ui'
import DynamicField from '@/components/DynamicField.vue'
import { useMeta, useFormFields } from '@/data/useMeta'

const { field, modelValue, doctype, docname } = defineProps({
  field: { type: Object, required: true },
  modelValue: { type: Array, default: () => [] },
  doctype: { type: String, default: null },
  docname: { type: String, default: null },
})
const emit = defineEmits(['update:modelValue'])

const childMetaResource = useMeta(field.options)
const columns = useFormFields(childMetaResource)

// The row summary in the table only needs enough columns to identify the
// row at a glance - matching Desk's grid, which shows a handful of
// in_list_view fields and pushes the rest behind the row-edit dialog. Wide
// child tables (10+ fields) are unusable as an all-columns-inline table.
const summaryColumns = computed(() => {
  const inListView = columns.value.filter((c) => c.in_list_view)
  return (inListView.length ? inListView : columns.value).slice(0, 3)
})

let rowKeyCounter = 0
const rows = computed({
  get: () => modelValue || [],
  set: (v) => emit('update:modelValue', v),
})

function addRow() {
  // Mutate the array in place (it's the same reactive array the parent form
  // owns) rather than reassigning through the computed setter - reassigning
  // round-trips through the parent via emit('update:modelValue', ...), and
  // reading rows.value.length right after that in the same tick can still
  // see the pre-update array, opening the row editor on the wrong (stale)
  // index.
  const newRow = { __key: `new-${rowKeyCounter++}` }
  rows.value.push(newRow)
  openRow(rows.value.indexOf(newRow))
}

function formatValue(value, field) {
  if (value == null || value === '') return '-'
  if (field.fieldtype === 'Check') return value ? 'Yes' : 'No'
  return value
}

const showRowEditor = ref(false)
const editingIdx = ref(null)
const editingRow = computed(() => (editingIdx.value == null ? null : rows.value[editingIdx.value]))

function openRow(idx) {
  editingIdx.value = idx
  showRowEditor.value = true
}

const showRemoveConfirm = ref(false)
const pendingRemoveIdx = ref(null)

function confirmRemoveRow(idx) {
  pendingRemoveIdx.value = idx
  showRemoveConfirm.value = true
}

function doRemoveRow(close) {
  rows.value = rows.value.filter((_, i) => i !== pendingRemoveIdx.value)
  pendingRemoveIdx.value = null
  close()
}
</script>

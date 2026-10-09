<template>
  <!-- Desk-style filters: one row per filter (field,
  condition, value, remove), "+ Add a Filter", then Apply. Edits stay a
  draft until Apply, so half-built rows never reload the list. -->
  <div class="space-y-3 sm:w-[30rem] sm:max-w-[calc(100vw-2rem)] sm:p-1">
    <!-- The form's own standard filters (Village, Gram Panchayat, Survey
    Date ...) - all of them, labelled, so even a bare date box says what it
    filters. Same draft-until-Apply rule as the rows below. -->
    <template v-if="quickFields.length">
      <div class="grid grid-cols-2 gap-x-2 gap-y-2.5">
        <label v-for="field in quickFields" :key="field.fieldname" class="block min-w-0">
          <span class="mb-1 block truncate text-xs font-medium text-gray-500 dark:text-gray-400">{{ field.label }}</span>
          <ListFilterControl :field="field" v-model="quickDraft[field.fieldname]" />
        </label>
      </div>
      <p class="border-t border-gray-100 pt-3 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:border-gray-800 dark:text-gray-400">
        More conditions
      </p>
    </template>


    <div
      v-for="(row, index) in draft"
      :key="row.key"
      class="grid grid-cols-[minmax(0,1fr)_auto] gap-2 rounded-lg bg-gray-50 p-2 ring-1 ring-gray-100 dark:bg-gray-800/60 dark:ring-gray-800 sm:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,1.2fr)_auto] sm:items-center sm:bg-transparent sm:p-0 sm:ring-0"
    >
      <FormControl
        type="select"
        class="[&_[data-slot=trigger]]:h-8 [&_[data-slot=trigger]]:w-full"
        :options="fieldOptions"
        :model-value="row.fieldname"
        @update:model-value="setField(row, $event)"
      />
      <button
        type="button"
        class="row-span-3 flex h-8 w-8 items-center justify-center self-start rounded-md text-gray-400 hover:bg-gray-100 hover:text-red-600 dark:hover:bg-gray-800 sm:order-last sm:row-span-1 sm:self-center"
        :aria-label="`Remove filter ${index + 1}`"
        @click="draft.splice(index, 1)"
      >
        <LucideIcon name="x" class="h-4 w-4" />
      </button>
      <FormControl
        type="select"
        class="[&_[data-slot=trigger]]:h-8 [&_[data-slot=trigger]]:w-full"
        :options="operatorOptions(row)"
        :model-value="row.operator"
        @update:model-value="setOperator(row, $event)"
      />
      <!-- The value box suits the field: options, Yes/No, a date, a number, or text. -->
      <FormControl
        v-if="valueKind(fieldFor(row), row.operator) === 'set'"
        type="select"
        class="[&_[data-slot=trigger]]:h-8 [&_[data-slot=trigger]]:w-full"
        :options="[{ label: 'Set', value: 'set' }, { label: 'Not set', value: 'not set' }]"
        v-model="row.value"
      />
      <FormControl
        v-else-if="valueKind(fieldFor(row), row.operator) === 'check'"
        type="select"
        class="[&_[data-slot=trigger]]:h-8 [&_[data-slot=trigger]]:w-full"
        :options="[{ label: 'Yes', value: '1' }, { label: 'No', value: '0' }]"
        v-model="row.value"
      />
      <FormControl
        v-else-if="valueKind(fieldFor(row), row.operator) === 'select'"
        type="select"
        class="[&_[data-slot=trigger]]:h-8 [&_[data-slot=trigger]]:w-full"
        placeholder="Choose…"
        :options="selectOptions(fieldFor(row)).map((v) => ({ label: v, value: v }))"
        v-model="row.value"
      />
      <FormControl v-else-if="valueKind(fieldFor(row), row.operator) === 'date'" type="date" v-model="row.value" />
      <FormControl v-else-if="valueKind(fieldFor(row), row.operator) === 'number'" type="number" placeholder="Value" v-model="row.value" />
      <FormControl v-else type="text" placeholder="Value" v-model="row.value" />
    </div>

    <!-- Desk's footer: "+ Add a Filter" on the left, Clear Filters and
    Apply Filters on the right. -->
    <div class="flex flex-wrap items-center justify-between gap-2 border-t border-gray-100 pt-3 dark:border-gray-800">
      <button
        type="button"
        class="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-sm font-medium text-gray-700 hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-gray-800"
        @click="addRow"
      >
        <LucideIcon name="plus" class="h-4 w-4" />
        Add a Filter
      </button>
      <div class="flex items-center gap-2">
        <button type="button" :class="[ui.BTN_SECONDARY, '!h-8']" @click="clearAll">Clear Filters</button>
        <button type="button" :class="[ui.BTN_PRIMARY, '!h-8']" @click="apply">Apply Filters</button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, reactive, ref } from 'vue'
import { FormControl } from 'frappe-ui'
import LucideIcon from '@/components/LucideIcon.vue'
import ListFilterControl from '@/components/ListFilterControl.vue'
import { operatorsFor, operatorLabel, valueKind, selectOptions, isComplete } from '@/data/listFilters'
import * as ui from '@/data/ui'

const props = defineProps({
  // The fields that can be filtered ({ fieldname, label, fieldtype, options }).
  fields: { type: Array, required: true },
  // The applied filters: [{ fieldname, operator, value }].
  modelValue: { type: Array, default: () => [] },
  // The form's standard filters, shown as plain boxes above the rows.
  quickFields: { type: Array, default: () => [] },
  // Their values: { fieldname: value }.
  quickValues: { type: Object, default: () => ({}) },
})
const emit = defineEmits(['update:modelValue', 'update:quickValues', 'applied'])

// A working copy of the standard filters too - typing in the sheet doesn't
// reload the list behind it on every key; Apply does it once.
const quickDraft = reactive(Object.fromEntries(props.quickFields.map((f) => [f.fieldname, props.quickValues[f.fieldname] ?? ''])))
const hasQuickValues = computed(() => Object.values(props.quickValues).some((v) => v !== '' && v != null))

// Desk starts a new condition on "Equals" where the field offers it.
function firstOperator(field) {
  const ops = operatorsFor(field)
  return ops.includes('=') ? '=' : ops[0]
}

let keySeq = 0
const withKey = (row) => ({ ...row, key: ++keySeq })

// A working copy - taken each time the panel opens (it re-mounts then).
const draft = ref(props.modelValue.map(withKey))
// Desk opens the popup with one blank row (ID / Equals) ready to fill when
// nothing is filtered yet; a row left without a value is dropped on Apply.
if (!draft.value.length && props.fields.length) {
  const field = props.fields[0]
  const operator = firstOperator(field)
  draft.value.push(withKey({ fieldname: field.fieldname, operator, value: defaultValue(field, operator) }))
}

const fieldOptions = computed(() => props.fields.map((f) => ({ label: f.label || f.fieldname, value: f.fieldname })))

function fieldFor(row) {
  return props.fields.find((f) => f.fieldname === row.fieldname)
}

function operatorOptions(row) {
  const field = fieldFor(row)
  return operatorsFor(field).map((op) => ({ label: operatorLabel(op, field), value: op }))
}

function defaultValue(field, operator) {
  return valueKind(field, operator) === 'set' ? 'set' : valueKind(field, operator) === 'check' ? '1' : ''
}

function addRow() {
  const field = props.fields[0]
  const operator = firstOperator(field)
  draft.value.push(withKey({ fieldname: field?.fieldname, operator, value: defaultValue(field, operator) }))
}

// A new field can need different conditions and a different value box.
function setField(row, fieldname) {
  row.fieldname = fieldname
  const field = fieldFor(row)
  row.operator = firstOperator(field)
  row.value = defaultValue(field, row.operator)
}

function setOperator(row, operator) {
  const before = valueKind(fieldFor(row), row.operator)
  row.operator = operator
  if (valueKind(fieldFor(row), operator) !== before) row.value = defaultValue(fieldFor(row), operator)
}

// Rows without a value are dropped rather than applied half-built.
function apply() {
  const rows = draft.value.filter(isComplete).map(({ fieldname, operator, value }) => ({ fieldname, operator, value }))
  emit('update:modelValue', rows)
  if (props.quickFields.length) emit('update:quickValues', { ...quickDraft })
  emit('applied')
}

function clearAll() {
  draft.value = []
  for (const key of Object.keys(quickDraft)) quickDraft[key] = ''
  emit('update:modelValue', [])
  if (props.quickFields.length) emit('update:quickValues', { ...quickDraft })
  emit('applied')
}
</script>

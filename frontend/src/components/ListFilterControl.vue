<template>
  <!-- One list-view filter, as the right kind of control for its field: a
  dropdown for Select / Check, a date picker, else text (matched anywhere
  in the value). Used inline in the toolbar and in the "Filters" panel. -->
  <FormControl
    v-if="field.fieldtype === 'Select'"
    type="select"
    class="[&_[data-slot=trigger]]:h-8 [&_[data-slot=trigger]]:w-full"
    :options="[{ label: `All ${field.label}`, value: '' }, ...selectOptions]"
    :model-value="modelValue"
    @update:model-value="$emit('update:modelValue', $event ?? '')"
  />
  <FormControl
    v-else-if="field.fieldtype === 'Check'"
    type="select"
    class="[&_[data-slot=trigger]]:h-8 [&_[data-slot=trigger]]:w-full"
    :options="[{ label: `${field.label}: Any`, value: '' }, { label: `${field.label}: Yes`, value: '1' }, { label: `${field.label}: No`, value: '0' }]"
    :model-value="modelValue"
    @update:model-value="$emit('update:modelValue', $event ?? '')"
  />
  <!-- A date box shows its field's name until it's used, as in Desk - a bare
  "mm/dd/yyyy" box in a row of filters doesn't say what it filters. -->
  <FormControl
    v-else-if="field.fieldtype === 'Date' || field.fieldtype === 'Datetime'"
    :type="dateFocused || modelValue ? 'date' : 'text'"
    :placeholder="field.label"
    :title="field.label"
    :model-value="modelValue"
    @focusin="dateFocused = true"
    @focusout="dateFocused = false"
    @update:model-value="$emit('update:modelValue', $event ?? '')"
  />
  <FormControl
    v-else
    type="text"
    :placeholder="field.label"
    :model-value="modelValue"
    @update:model-value="$emit('update:modelValue', $event ?? '')"
  />
</template>

<script setup>
import { computed, ref } from 'vue'
import { FormControl } from 'frappe-ui'

const props = defineProps({
  field: { type: Object, required: true },
  modelValue: { type: [String, Number], default: '' },
})

defineEmits(['update:modelValue'])

const dateFocused = ref(false)

const selectOptions = computed(() =>
  (props.field.options || '')
    .split('\n')
    .map((v) => v.trim())
    .filter(Boolean)
    .map((v) => ({ label: v, value: v })),
)
</script>

<template>
  <!-- One list-view filter, as the right kind of control for its field: a
  dropdown for Select / Check, a date picker, else text (matched anywhere
  in the value). Used inline in the toolbar and in the "Filters" panel. -->
  <FormControl
    v-if="field.fieldtype === 'Select'"
    type="select"
    class="[&_[data-slot=trigger]]:h-8 [&_[data-slot=trigger]]:w-full"
    :options="[{ label: t('All {0}', [t(field.label)]), value: '' }, ...selectOptions]"
    :model-value="modelValue"
    @update:model-value="$emit('update:modelValue', $event ?? '')"
  />
  <FormControl
    v-else-if="field.fieldtype === 'Check'"
    type="select"
    class="[&_[data-slot=trigger]]:h-8 [&_[data-slot=trigger]]:w-full"
    :options="[
      { label: `${t(field.label)}: ${t('Any')}`, value: '' },
      { label: `${t(field.label)}: ${t('Yes')}`, value: '1' },
      { label: `${t(field.label)}: ${t('No')}`, value: '0' },
    ]"
    :model-value="modelValue"
    @update:model-value="$emit('update:modelValue', $event ?? '')"
  />
  <!-- A date box shows its field's name until it's used, as in Desk - a bare
  "mm/dd/yyyy" box in a row of filters doesn't say what it filters. -->
  <FormControl
    v-else-if="field.fieldtype === 'Date' || field.fieldtype === 'Datetime'"
    :type="dateFocused || modelValue ? 'date' : 'text'"
    :placeholder="t(field.label)"
    :title="t(field.label)"
    :model-value="modelValue"
    @focusin="dateFocused = true"
    @focusout="dateFocused = false"
    @update:model-value="$emit('update:modelValue', $event ?? '')"
  />
  <FormControl
    v-else
    type="text"
    :placeholder="t(field.label)"
    :model-value="modelValue"
    @update:model-value="$emit('update:modelValue', $event ?? '')"
  />
</template>

<script setup>
import { computed, ref } from 'vue'
import { FormControl } from 'frappe-ui'
import { t } from '@/data/i18n'

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
    // Option shown translated; the value stays English (it's what's filtered on).
    .map((v) => ({ label: t(v), value: v })),
)
</script>

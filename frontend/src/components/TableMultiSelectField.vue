<template>
  <div>
    <label class="mb-1.5 block text-sm text-gray-700 dark:text-gray-300">{{ field.label }}</label>
    <MultiSelect
      :model-value="selectedValues"
      :options="options"
      :placeholder="`Select ${targetDoctype}...`"
      @update:model-value="onUpdate"
    />
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import { MultiSelect, call, useCall } from 'frappe-ui'

const props = defineProps({
  field: { type: Object, required: true },
  modelValue: { type: Array, default: () => [] },
})
const emit = defineEmits(['update:modelValue'])

// A Table MultiSelect's own child doctype (field.options) has exactly one
// meaningful field besides the standard ones - that's the Link to the
// doctype actually being selected from (e.g. App Module Setting Role.role
// links to Role). Fetch that child doctype's meta once to find it.
const childMetaResource = useCall({
  url: `/api/v2/doctype/${props.field.options}/meta`,
  method: 'GET',
  cacheKey: `chw-meta-${props.field.options}`,
})

const linkFieldname = computed(() => {
  const fields = childMetaResource.data?.fields || []
  const linkField = fields.find((f) => f.fieldtype === 'Link')
  return linkField?.fieldname || null
})

const targetDoctype = computed(() => {
  const fields = childMetaResource.data?.fields || []
  const linkField = fields.find((f) => f.fieldtype === 'Link')
  return linkField?.options || ''
})

// The choices: every record of the target doctype. Loaded with call()
// once that doctype is known - useCall can't take a URL that changes
// (given a function it requested the function's source text as a page,
// so these lists - e.g. Pregnancy Registration's high-risk factors -
// always came up empty).
const targetRecords = ref([])
let requestId = 0
watch(
  targetDoctype,
  async (doctype) => {
    if (!doctype) return
    const id = ++requestId
    try {
      // limit_page_length 0 = all; a multi-select needs every option.
      const rows = await call('frappe.client.get_list', { doctype, fields: ['name'], limit_page_length: 0, order_by: 'name asc' })
      if (id === requestId) targetRecords.value = rows || []
    } catch (e) {
      if (id === requestId) targetRecords.value = []
      console.warn(`Could not load options for ${props.field.label}`, e)
    }
  },
  { immediate: true },
)

const options = computed(() => targetRecords.value.map((r) => ({ label: r.name, value: r.name })))

const selectedValues = computed(() => {
  if (!linkFieldname.value) return []
  return (props.modelValue || []).map((row) => row[linkFieldname.value]).filter(Boolean)
})

function onUpdate(values) {
  if (!linkFieldname.value) return
  emit(
    'update:modelValue',
    values.map((v) => ({ [linkFieldname.value]: v })),
  )
}
</script>

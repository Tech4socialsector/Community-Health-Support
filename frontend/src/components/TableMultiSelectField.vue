<template>
  <div>
    <label class="mb-1.5 block text-sm text-gray-700 dark:text-gray-300">{{ t(field.label) }}</label>
    <MultiSelect
      v-model:open="listOpen"
      :model-value="selectedValues"
      :options="options"
      :placeholder="t('Select {0}...', [t(targetDoctype)])"
      @update:model-value="onUpdate"
    >
      <!-- Desk's "+ Create a new ..." inside the list (as in LinkField),
      over the usual Clear All / Select All. -->
      <template #footer="{ clearAll, selectAll, query }">
        <button
          v-if="canCreate"
          type="button"
          class="flex w-full items-center gap-1.5 border-t border-outline-gray-1 px-3 py-2 text-left text-sm font-medium text-forest-700 hover:bg-forest-50 dark:text-forest-300 dark:hover:bg-gray-800"
          @click="startCreate(query)"
        >
          <LucideIcon name="plus" class="h-4 w-4" />
          {{ t('Create a new {0}', [t(targetDoctype)]) }}<template v-if="query.trim()">: "{{ query.trim() }}"</template>
        </button>
        <div class="flex items-center justify-between gap-2 border-t border-outline-gray-1 px-2 py-1.5">
          <Button variant="ghost" size="sm" @click="clearAll">{{ t('Clear All') }}</Button>
          <Button variant="ghost" size="sm" @click="selectAll">{{ t('Select All') }}</Button>
        </div>
      </template>
    </MultiSelect>
    <QuickCreateDialog
      v-if="createMounted && targetDoctype"
      v-model="createOpen"
      :doctype="targetDoctype"
      :initial-name="createName"
      @created="onCreated"
    />
  </div>
</template>

<script setup>
import { computed, defineAsyncComponent, ref, watch } from 'vue'
import { Button, MultiSelect, call, useCall } from 'frappe-ui'
import LucideIcon from '@/components/LucideIcon.vue'
import { t } from '@/data/i18n'
import { canCreateDoctype } from '@/data/createPermission'

// Async for the same reason as in LinkField: the dialog renders fields.
const QuickCreateDialog = defineAsyncComponent(() => import('@/components/QuickCreateDialog.vue'))

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

const canCreate = ref(false)
watch(
  targetDoctype,
  async (doctype) => {
    canCreate.value = !!doctype && (await canCreateDoctype(doctype))
  },
  { immediate: true },
)

const listOpen = ref(false)
const createOpen = ref(false)
const createMounted = ref(false)
const createName = ref('')
function startCreate(query) {
  createName.value = (query || '').trim()
  listOpen.value = false
  createMounted.value = true
  createOpen.value = true
}
function onCreated(name) {
  if (!targetRecords.value.some((r) => r.name === name)) {
    targetRecords.value = [...targetRecords.value, { name }].sort((a, b) => a.name.localeCompare(b.name))
  }
  if (!selectedValues.value.includes(name)) onUpdate([...selectedValues.value, name])
}
</script>

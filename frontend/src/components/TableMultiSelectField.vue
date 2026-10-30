<template>
  <div>
    <label class="mb-1.5 block text-xs text-ink-gray-5">{{ t(field.label) }}</label>
    <!-- w-full: frappe-ui sizes the trigger to its text otherwise, leaving
    it narrower than every other box in the column. -->
    <MultiSelect
      class="w-full"
      :model-value="selectedValues"
      :options="options"
      :placeholder="t('Select {0}...', [t(targetDoctype)])"
      @update:model-value="onUpdate"
    >
      <!-- Desk's "+ Create a new ..." for a Link field, ported here since a
      Table MultiSelect otherwise only ever offers what already exists. -->
      <template v-if="canCreate" #footer="{ clearAll, selectAll }">
        <div class="flex items-center justify-between gap-2 border-t border-outline-gray-1 px-2 py-1.5">
          <Button variant="ghost" size="sm" @click="clearAll">{{ t('Clear All') }}</Button>
          <Button variant="ghost" size="sm" @click="selectAll">{{ t('Select All') }}</Button>
          <Button variant="ghost" size="sm" @click="startCreate">
            <template #prefix><LucideIcon name="plus" class="h-3.5 w-3.5" /></template>
            {{ t('Create new') }}
          </Button>
        </div>
      </template>
    </MultiSelect>
    <QuickCreateDialog
      v-if="createOpen || createMounted"
      v-model="createOpen"
      :doctype="targetDoctype"
      @created="onCreated"
    />
  </div>
</template>

<script setup>
import { computed, defineAsyncComponent, ref, watch } from 'vue'
import { Button, MultiSelect, call, useCall } from 'frappe-ui'
import LucideIcon from '@/components/LucideIcon.vue'
import { t } from '@/data/i18n'

// Loaded when first needed - it renders fields itself, so a plain import
// risks a circular dependency the way LinkField.vue also avoids it.
const QuickCreateDialog = defineAsyncComponent(() => import('@/components/QuickCreateDialog.vue'))

// "May this user create <doctype>?" - asked once per doctype per session,
// as Desk only offers "Create a new ..." to roles with create permission.
const createPermission = new Map()
function canCreateDoctype(doctype) {
  if (!createPermission.has(doctype)) {
    createPermission.set(
      doctype,
      call('frappe.client.has_permission', { doctype, docname: '', perm_type: 'create' })
        .then((r) => !!r?.has_permission)
        .catch(() => false),
    )
  }
  return createPermission.get(doctype)
}

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

const canCreate = ref(false)
watch(
  targetDoctype,
  async (doctype) => {
    canCreate.value = !!doctype && (await canCreateDoctype(doctype))
  },
  { immediate: true },
)

const createOpen = ref(false)
const createMounted = ref(false)
function startCreate() {
  createMounted.value = true
  createOpen.value = true
}
// Newly created, so it isn't in targetRecords yet - add it there too, or it
// would show as selected but vanish from the list the next time it opens.
function onCreated(name) {
  if (!targetRecords.value.some((r) => r.name === name)) targetRecords.value = [...targetRecords.value, { name }]
  onUpdate([...selectedValues.value, name])
}

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

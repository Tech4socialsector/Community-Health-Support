<template>
  <!-- Desk's Link control: type to search the linked doctype (by ID and its
  search fields - for a family member, the name and household), pick from
  the list (ID with its description under it), clear with the x. Only a
  picked value is ever stored, so a half-typed name can't be saved as if
  it were an ID. -->
  <div ref="root">
    <label class="mb-1.5 block text-sm text-gray-700 dark:text-gray-300">
      {{ field.label }}<span v-if="field.reqd" class="text-red-500"> *</span>
    </label>
    <div class="relative">
      <input
        ref="input"
        :value="text"
        type="text"
        :readonly="readOnly"
        :placeholder="readOnly ? '' : `Search ${field.options}…`"
        autocomplete="off"
        class="h-9 w-full rounded-lg border-0 bg-gray-100 px-3 pr-8 text-sm text-gray-900 placeholder:text-gray-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-forest-400 dark:bg-gray-800 dark:text-gray-100"
        :class="{ 'cursor-default bg-gray-50 text-gray-600 focus:ring-0 dark:bg-gray-800/60': readOnly }"
        role="combobox"
        :aria-expanded="open"
        @focus="onFocus"
        @input="onInput($event.target.value)"
        @keydown.down.prevent="move(1)"
        @keydown.up.prevent="move(-1)"
        @keydown.enter.prevent="pick(results[active])"
        @keydown.escape="close(true)"
        @blur="onBlur"
      />
      <button
        v-if="modelValue && !readOnly"
        type="button"
        class="absolute right-1.5 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded text-gray-400 hover:bg-gray-200 hover:text-gray-700 dark:hover:bg-gray-700"
        aria-label="Clear"
        @mousedown.prevent="clear"
      >
        <LucideIcon name="x" class="h-3.5 w-3.5" />
      </button>
    </div>
    <p v-if="field.description" class="mt-1.5 text-xs text-gray-500 dark:text-gray-400">{{ field.description }}</p>

    <!-- Fixed to the screen at the box's position: the form's two-column
    layout and cards would otherwise clip a list that hangs below them. -->
    <Teleport to="body">
      <ul
        v-if="open"
        class="fixed z-[100] max-h-64 overflow-y-auto rounded-lg bg-white p-1 text-sm shadow-xl ring-1 ring-gray-200 dark:bg-gray-900 dark:ring-gray-700"
        :style="panelStyle"
        role="listbox"
        @mousedown.prevent
      >
        <li v-if="loading && !results.length" class="px-3 py-2 text-gray-400">Searching…</li>
        <li v-else-if="!results.length" class="px-3 py-2 text-gray-400">No {{ field.options }} found</li>
        <li
          v-for="(r, i) in results"
          :key="r.value"
          role="option"
          :aria-selected="i === active"
          class="cursor-pointer rounded-md px-3 py-2"
          :class="i === active ? 'bg-forest-50 dark:bg-gray-800' : 'hover:bg-gray-50 dark:hover:bg-gray-800'"
          @mouseenter="active = i"
          @click="pick(r)"
        >
          <span class="block font-medium text-gray-900 dark:text-gray-100">{{ r.value }}</span>
          <span v-if="r.label && r.label !== r.value" class="block truncate text-xs text-gray-600 dark:text-gray-300">{{ r.label }}</span>
          <span v-if="r.description" class="block truncate text-xs text-gray-500 dark:text-gray-400">{{ r.description }}</span>
        </li>
        <!-- Desk's "+ Create a new ..." - for people allowed to create it. -->
        <li
          v-if="canCreate"
          role="option"
          class="mt-1 flex cursor-pointer items-center gap-1.5 rounded-md border-t border-gray-100 px-3 py-2 font-medium text-forest-700 hover:bg-forest-50 dark:border-gray-800 dark:text-forest-300 dark:hover:bg-gray-800"
          @click="startCreate"
        >
          <LucideIcon name="plus" class="h-4 w-4" />
          Create a new {{ field.options }}<template v-if="text.trim() && text !== modelValue">: "{{ text.trim() }}"</template>
        </li>
      </ul>
    </Teleport>
    <QuickCreateDialog
      v-if="createOpen || createMounted"
      v-model="createOpen"
      :doctype="field.options"
      :initial-name="createName"
      @created="onCreated"
    />
  </div>
</template>

<script setup>
import { defineAsyncComponent, onBeforeUnmount, ref, watch } from 'vue'
import { call } from 'frappe-ui'
import LucideIcon from '@/components/LucideIcon.vue'

// Loaded when first needed - it renders fields itself (including Links),
// so a plain import would be circular.
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
  modelValue: { type: String, default: null },
  readOnly: { type: Boolean, default: false },
  // Desk's set_query: { query } and/or { filters } for this field, from the
  // doctype's hook module - e.g. only family members with a pregnancy.
  linkQuery: { type: Object, default: null },
  // The form's doctype - Desk sends it so server-side queries know the caller.
  referenceDoctype: { type: String, default: null },
})
const emit = defineEmits(['update:modelValue'])

const root = ref(null)
const input = ref(null)
const text = ref(props.modelValue || '')
const open = ref(false)
const loading = ref(false)
const results = ref([])
const active = ref(0)
const panelStyle = ref({})

const canCreate = ref(false)
watch(
  () => [props.field.options, props.readOnly],
  async ([doctype, readOnly]) => {
    canCreate.value = !readOnly && !!doctype && (await canCreateDoctype(doctype))
  },
  { immediate: true },
)

const createOpen = ref(false)
const createMounted = ref(false)
const createName = ref('')
function startCreate() {
  createName.value = text.value !== props.modelValue ? text.value.trim() : ''
  close(false)
  createMounted.value = true
  createOpen.value = true
}
function onCreated(name) {
  text.value = name
  emit('update:modelValue', name)
}

watch(
  () => props.modelValue,
  (v) => {
    if (document.activeElement !== input.value) text.value = v || ''
  },
)

let timer = null
let requestId = 0

async function search(txt) {
  const id = ++requestId
  loading.value = true
  try {
    const args = {
      doctype: props.field.options,
      txt: txt || '',
      page_length: 20,
      reference_doctype: props.referenceDoctype || undefined,
      link_fieldname: props.field.fieldname,
    }
    if (props.linkQuery?.query) args.query = props.linkQuery.query
    if (props.linkQuery?.filters) args.filters = JSON.stringify(props.linkQuery.filters)
    const rows = await call('frappe.desk.search.search_link', args)
    if (id !== requestId) return
    results.value = rows || []
    active.value = 0
  } catch (e) {
    if (id !== requestId) return
    results.value = []
    console.warn(`Link search failed for ${props.field.label}`, e)
  } finally {
    if (id === requestId) loading.value = false
  }
}

function place() {
  const r = input.value?.getBoundingClientRect()
  if (!r) return
  const below = window.innerHeight - r.bottom
  const style = { left: `${r.left}px`, width: `${r.width}px` }
  // Open upwards when there's no room below (e.g. above the phone's menu bar).
  if (below < 260 && r.top > below) style.bottom = `${window.innerHeight - r.top + 4}px`
  else style.top = `${r.bottom + 4}px`
  panelStyle.value = style
}

function onFocus() {
  if (props.readOnly) return
  place()
  open.value = true
  search(text.value === props.modelValue ? '' : text.value)
}

function onInput(value) {
  text.value = value
  place()
  open.value = true
  clearTimeout(timer)
  timer = setTimeout(() => search(value), 250)
}

function move(step) {
  if (!open.value || !results.value.length) return
  active.value = (active.value + step + results.value.length) % results.value.length
}

function pick(r) {
  if (!r) return
  text.value = r.value
  emit('update:modelValue', r.value)
  close(false)
  input.value?.blur()
}

function clear() {
  text.value = ''
  emit('update:modelValue', null)
  results.value = []
}

function close(revert) {
  open.value = false
  if (revert) text.value = props.modelValue || ''
}

// Leaving the box: an emptied box clears the link; anything else that
// wasn't picked goes back to the saved value - Desk refuses an unknown ID.
function onBlur() {
  setTimeout(() => {
    if (!text.value.trim()) {
      if (props.modelValue) emit('update:modelValue', null)
      text.value = ''
    } else if (text.value !== props.modelValue) {
      const exact = results.value.find((r) => r.value === text.value.trim())
      if (exact) pick(exact)
      else text.value = props.modelValue || ''
    }
    open.value = false
  }, 150)
}

// The list is fixed to the screen - scrolling the form would leave it
// floating away from its box, so scrolling closes it.
function onScroll(e) {
  if (open.value && !(e.target instanceof Node && e.target.closest?.('[role=listbox]'))) close(false)
}
window.addEventListener('scroll', onScroll, true)
onBeforeUnmount(() => {
  window.removeEventListener('scroll', onScroll, true)
  clearTimeout(timer)
})
</script>

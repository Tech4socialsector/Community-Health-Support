<template>
  <!-- Desk-style column settings: the ID column (fixed), then each shown
  column with a drag handle (reorder) and a remove button, "+ Add Column"
  for any other field, and "Reset to Default". Drag works with a mouse;
  on a phone the up/down arrows do the same job. -->
  <div class="sm:w-72">
    <div class="flex items-center gap-2 px-2 py-1.5 text-sm text-gray-500">
      <LucideIcon name="lock" class="h-3.5 w-3.5" />
      ID
    </div>
    <ul>
      <li
        v-for="(fieldname, index) in modelValue"
        :key="fieldname"
        draggable="true"
        class="group flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-gray-800 hover:bg-gray-50 dark:text-gray-200 dark:hover:bg-gray-800"
        :class="{ 'bg-forest-50 ring-1 ring-forest-200 dark:bg-forest-900/30': dragOver === index }"
        @dragstart="dragFrom = index"
        @dragover.prevent="dragOver = index"
        @dragleave="dragOver = null"
        @drop.prevent="drop(index)"
        @dragend="dragFrom = dragOver = null"
      >
        <LucideIcon name="grip-vertical" class="h-4 w-4 flex-shrink-0 cursor-grab text-gray-300" />
        <span class="min-w-0 flex-1 truncate">{{ labelFor(fieldname) }}</span>
        <button
          type="button"
          class="flex h-7 w-7 items-center justify-center rounded text-gray-400 hover:bg-gray-100 hover:text-navy-900 disabled:opacity-30 dark:hover:bg-gray-700 sm:hidden"
          :disabled="index === 0"
          :aria-label="`Move ${labelFor(fieldname)} up`"
          @click="move(index, index - 1)"
        >
          <LucideIcon name="chevron-up" class="h-4 w-4" />
        </button>
        <button
          type="button"
          class="flex h-7 w-7 items-center justify-center rounded text-gray-400 hover:bg-gray-100 hover:text-red-600 dark:hover:bg-gray-700"
          :aria-label="`Remove ${labelFor(fieldname)}`"
          @click="remove(index)"
        >
          <LucideIcon name="x" class="h-4 w-4" />
        </button>
      </li>
    </ul>

    <div class="mt-1 border-t border-gray-100 pt-2 dark:border-gray-800">
      <button
        v-if="!adding"
        type="button"
        class="flex h-9 w-full items-center justify-center gap-1.5 rounded-lg bg-gray-100 text-sm font-medium text-gray-700 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
        :disabled="!addable.length"
        @click="adding = true"
      >
        <LucideIcon name="plus" class="h-4 w-4" />
        Add Column
      </button>
      <div v-else class="space-y-1">
        <input
          v-model="addSearch"
          type="search"
          placeholder="Find a field…"
          class="h-8 w-full rounded-md border-0 bg-gray-50 px-2.5 text-sm ring-1 ring-gray-200 focus:outline-none focus:ring-2 focus:ring-forest-400 dark:bg-gray-800 dark:ring-gray-700"
        />
        <div class="max-h-48 overflow-y-auto">
          <button
            v-for="field in filteredAddable"
            :key="field.fieldname"
            type="button"
            class="block w-full truncate rounded-md px-2 py-1.5 text-left text-sm text-gray-700 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-gray-800"
            @click="add(field.fieldname)"
          >
            {{ field.label || field.fieldname }}
          </button>
          <p v-if="!filteredAddable.length" class="px-2 py-1.5 text-sm text-gray-400">No matching fields.</p>
        </div>
      </div>
      <button
        type="button"
        class="mt-1 flex w-full items-center justify-center gap-1.5 rounded-md py-1.5 text-sm text-gray-500 hover:text-navy-900 dark:text-gray-400"
        @click="$emit('reset'); adding = false"
      >
        <LucideIcon name="rotate-ccw" class="h-3.5 w-3.5" />
        Reset to Default
      </button>
    </div>
  </div>
</template>

<script setup>
import { computed, ref } from 'vue'
import LucideIcon from '@/components/LucideIcon.vue'

const props = defineProps({
  // Every field that could be a column.
  fields: { type: Array, required: true },
  // The shown columns, in order (fieldnames).
  modelValue: { type: Array, required: true },
})
const emit = defineEmits(['update:modelValue', 'reset'])

function labelFor(fieldname) {
  const field = props.fields.find((f) => f.fieldname === fieldname)
  return field?.label || fieldname
}

function update(list) {
  emit('update:modelValue', list)
}

function remove(index) {
  const list = [...props.modelValue]
  list.splice(index, 1)
  update(list)
}

function move(from, to) {
  if (to < 0 || to >= props.modelValue.length || from === to) return
  const list = [...props.modelValue]
  const [item] = list.splice(from, 1)
  list.splice(to, 0, item)
  update(list)
}

const dragFrom = ref(null)
const dragOver = ref(null)
function drop(index) {
  if (dragFrom.value != null) move(dragFrom.value, index)
  dragFrom.value = dragOver.value = null
}

const adding = ref(false)
const addSearch = ref('')
const addable = computed(() => props.fields.filter((f) => !props.modelValue.includes(f.fieldname)))
const filteredAddable = computed(() => {
  const term = addSearch.value.trim().toLowerCase()
  return term ? addable.value.filter((f) => (f.label || f.fieldname).toLowerCase().includes(term)) : addable.value
})

function add(fieldname) {
  update([...props.modelValue, fieldname])
  adding.value = false
  addSearch.value = ''
}
</script>

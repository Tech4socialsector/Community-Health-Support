<template>
  <div>
    <div class="mb-3 flex items-center justify-between">
      <button
        class="flex h-8 w-8 items-center justify-center rounded text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800"
        @click="shiftMonth(-1)"
      >
        <FeatherIcon name="chevron-left" class="h-4 w-4" />
      </button>
      <span class="text-sm font-semibold text-gray-900 dark:text-gray-100">{{ monthLabel }}</span>
      <button
        class="flex h-8 w-8 items-center justify-center rounded text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800"
        @click="shiftMonth(1)"
      >
        <FeatherIcon name="chevron-right" class="h-4 w-4" />
      </button>
    </div>

    <div class="overflow-x-auto">
      <div class="grid min-w-[36rem] grid-cols-7 gap-px overflow-hidden rounded-lg border bg-gray-200 text-xs dark:border-gray-800 dark:bg-gray-800">
        <div
          v-for="day in weekdayLabels"
          :key="day"
          class="bg-gray-50 px-2 py-1.5 text-center font-medium text-gray-500 dark:bg-gray-900 dark:text-gray-400"
        >
          {{ day }}
        </div>

        <div
          v-for="cell in calendarCells"
          :key="cell.key"
          class="min-h-[6rem] bg-white p-1.5 dark:bg-gray-900"
          :class="{ 'bg-gray-50 dark:bg-gray-950': !cell.inMonth }"
        >
          <span
            class="mb-1 inline-flex h-5 w-5 items-center justify-center rounded-full text-[11px]"
            :class="[
              cell.inMonth ? 'text-gray-700 dark:text-gray-300' : 'text-gray-300 dark:text-gray-600',
              cell.isToday ? 'bg-gray-900 text-white dark:bg-gray-100 dark:text-gray-900' : '',
            ]"
          >
            {{ cell.day }}
          </span>
          <button
            v-for="todo in cell.todos"
            :key="todo.name"
            class="mb-1 block w-full truncate rounded px-1.5 py-0.5 text-left text-[11px]"
            :class="todo.status === 'Open' ? 'bg-blue-100 text-blue-700 hover:bg-blue-200' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'"
            @click="$emit('open', todo)"
          >
            {{ stripHtml(todo.description) || todo.reference_type || 'Task' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { FeatherIcon } from 'frappe-ui'

const props = defineProps({
  todos: { type: Array, default: () => [] },
})
defineEmits(['open'])

const weekdayLabels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

const today = new Date()
const cursor = ref(new Date(today.getFullYear(), today.getMonth(), 1))

function shiftMonth(delta) {
  cursor.value = new Date(cursor.value.getFullYear(), cursor.value.getMonth() + delta, 1)
}

const monthLabel = computed(() =>
  cursor.value.toLocaleDateString(undefined, { month: 'long', year: 'numeric' }),
)

function dateKey(d) {
  return d.toISOString().slice(0, 10)
}

const todosByDate = computed(() => {
  const map = {}
  for (const todo of props.todos) {
    if (!todo.date) continue
    const key = todo.date.slice(0, 10)
    if (!map[key]) map[key] = []
    map[key].push(todo)
  }
  return map
})

const calendarCells = computed(() => {
  const year = cursor.value.getFullYear()
  const month = cursor.value.getMonth()
  const firstOfMonth = new Date(year, month, 1)
  const startOffset = firstOfMonth.getDay()
  const gridStart = new Date(year, month, 1 - startOffset)

  const todayKey = dateKey(new Date(today.getFullYear(), today.getMonth(), today.getDate()))
  const cells = []
  for (let i = 0; i < 42; i++) {
    const d = new Date(gridStart.getFullYear(), gridStart.getMonth(), gridStart.getDate() + i)
    const key = dateKey(d)
    cells.push({
      key,
      day: d.getDate(),
      inMonth: d.getMonth() === month,
      isToday: key === todayKey,
      todos: todosByDate.value[key] || [],
    })
  }
  return cells
})

function stripHtml(html) {
  if (!html) return ''
  const div = document.createElement('div')
  div.innerHTML = html
  return div.textContent || div.innerText || ''
}
</script>

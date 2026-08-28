<template>
  <AppLayout>
    <PageHeader>
      <template #title>
        <TabButtons v-model="view" :buttons="viewButtons" />
      </template>
      <template #actions>
        <label class="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
          <input type="checkbox" v-model="showClosed" class="rounded border-gray-300" />
          Show closed
        </label>
      </template>
    </PageHeader>

    <div v-if="todos.loading && !todos.data" class="space-y-2">
      <Skeleton v-for="i in 5" :key="i" height="2.5rem" />
    </div>
    <ErrorMessage v-else-if="todos.error" :message="todos.error" />

    <WorklistCalendar v-else-if="view === 'calendar'" :todos="rows" @open="openTodo" />

    <template v-else>
      <div v-if="rows.length === 0" class="py-10 text-center text-gray-500 dark:text-gray-400">
        Nothing on your worklist.
      </div>
      <div v-else class="overflow-x-auto rounded-lg border dark:border-gray-800">
        <table class="w-full min-w-[32rem] text-left text-sm">
          <thead class="border-b bg-gray-50 text-xs uppercase text-gray-500 dark:border-gray-800 dark:bg-gray-800 dark:text-gray-400">
            <tr>
              <th class="px-4 py-2">Description</th>
              <th class="px-4 py-2">Reference</th>
              <th class="px-4 py-2">Due Date</th>
              <th class="px-4 py-2">Status</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="row in rows"
              :key="row.name"
              class="cursor-pointer border-b last:border-0 hover:bg-gray-50 dark:border-gray-800 dark:hover:bg-gray-800"
              @click="openTodo(row)"
            >
              <td class="px-4 py-2 text-gray-900 dark:text-gray-100">{{ stripHtml(row.description) || '-' }}</td>
              <td class="px-4 py-2 text-gray-600 dark:text-gray-400">{{ row.reference_type || '-' }}</td>
              <td class="px-4 py-2 text-gray-600 dark:text-gray-400">{{ row.date || '-' }}</td>
              <td class="px-4 py-2">
                <span
                  class="rounded-full px-2 py-0.5 text-xs font-medium"
                  :class="row.status === 'Open' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600'"
                >
                  {{ row.status }}
                </span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </template>
  </AppLayout>
</template>

<script setup>
import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import { useList, ErrorMessage, TabButtons } from 'frappe-ui'
import AppLayout from '@/layouts/AppLayout.vue'
import PageHeader from '@/components/PageHeader.vue'
import Skeleton from '@/components/Skeleton.vue'
import WorklistCalendar from '@/components/WorklistCalendar.vue'
import { session } from '@/data/session'
import { findModuleByDoctype } from '@/data/modules'
import { setPageTitle } from '@/data/pageTitle'

setPageTitle('Worklist')

const router = useRouter()
const view = ref('list')
const showClosed = ref(false)

const viewButtons = [
  { label: 'List', value: 'list' },
  { label: 'Calendar', value: 'calendar' },
]

const todos = useList({
  doctype: 'ToDo',
  fields: ['name', 'description', 'status', 'date', 'reference_type', 'reference_name', 'priority'],
  filters: () => {
    const filters = { allocated_to: session.user }
    if (!showClosed.value) filters.status = 'Open'
    return filters
  },
  orderBy: 'date asc',
  limit: 100,
})

const rows = computed(() => todos.data || [])

function stripHtml(html) {
  if (!html) return ''
  const div = document.createElement('div')
  div.innerHTML = html
  return div.textContent || div.innerText || ''
}

function openTodo(row) {
  if (!row.reference_type || !row.reference_name) return
  const mod = findModuleByDoctype(row.reference_type)
  if (!mod) return
  router.push({
    name: 'DoctypeForm',
    params: { doctypeRoute: mod.route, name: row.reference_name },
  })
}
</script>

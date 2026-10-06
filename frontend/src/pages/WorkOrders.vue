<template>
  <AppLayout>
    <PageHeader>
      <template #title>
        <h1 class="text-lg font-semibold text-gray-900 dark:text-gray-100">Work Orders</h1>
      </template>
      <template #actions>
        <span class="rounded-full bg-teal-100 px-3 py-1 text-xs font-semibold text-teal-700 dark:bg-teal-900/40 dark:text-teal-300">
          Signed in as: {{ session.full_name || session.user }} ({{ isPrivileged ? 'Coordinator' : 'CHW Health Worker' }})
        </span>
      </template>
    </PageHeader>

    <div class="mb-4 flex flex-wrap items-end gap-3">
      <div class="w-44 flex-shrink-0">
        <FormControl
          type="select"
          class="[&_[data-slot=trigger]]:w-full"
          label="Status"
          :options="STATUS_OPTIONS"
          v-model="filters.status"
        />
      </div>
      <div class="w-52 flex-shrink-0">
        <FormControl
          type="select"
          class="[&_[data-slot=trigger]]:w-full"
          label="Visit Type"
          :options="visitTypeOptions"
          v-model="filters.visit_type"
        />
      </div>
      <div class="w-36 flex-shrink-0">
        <FormControl
          type="select"
          class="[&_[data-slot=trigger]]:w-full"
          label="Risk"
          :options="riskOptions"
          v-model="filters.risk"
        />
      </div>
      <div v-if="isPrivileged" class="w-44 flex-shrink-0">
        <FormControl
          type="select"
          class="[&_[data-slot=trigger]]:w-full"
          label="Village"
          :options="villageOptions"
          v-model="filters.village"
        />
      </div>
      <div v-if="isPrivileged" class="w-48 flex-shrink-0">
        <FormControl
          type="select"
          class="[&_[data-slot=trigger]]:w-full"
          label="Health Worker"
          :options="healthWorkerOptions"
          v-model="filters.health_worker"
        />
      </div>
    </div>

    <div
      v-if="!isPrivileged && summary.health_worker_linked === false"
      class="mb-4 rounded-lg border border-yellow-300 bg-yellow-50 px-4 py-3 text-sm text-yellow-800 dark:border-yellow-900 dark:bg-yellow-900/20 dark:text-yellow-300"
    >
      No Health Worker record is linked to your login. Ask your coordinator to set the
      <strong>User</strong> field on your Health Worker record so your work order list can show here.
    </div>

    <div v-if="summaryLoading && !workOrderSummaryResource.data" class="grid gap-3 sm:grid-cols-3">
      <div v-for="i in 6" :key="i" class="rounded-lg border p-4 dark:border-gray-800">
        <Skeleton width="3rem" height="1.75rem" />
        <Skeleton width="70%" height="0.75rem" class="mt-2" />
      </div>
    </div>
    <ErrorMessage v-else-if="workOrderSummaryResource.error" :message="workOrderSummaryResource.error" />

    <div v-else class="mb-4 grid gap-3 sm:grid-cols-3">
      <button
        v-for="card in STATUS_CARDS"
        :key="card.key"
        type="button"
        class="rounded-lg border-t-4 border bg-white p-4 text-left dark:border-gray-800 dark:bg-gray-800"
        :style="{
          borderTopColor: card.color,
          borderColor: filters.status === card.key ? card.color : undefined,
          boxShadow: filters.status === card.key ? `0 0 0 1px ${card.color}` : undefined,
        }"
        @click="toggleStatus(card.key)"
      >
        <span class="block text-2xl font-bold text-gray-900 dark:text-gray-100">{{ summary[card.key] || 0 }}</span>
        <span class="mt-1 block text-sm font-medium text-gray-600 dark:text-gray-300">{{ card.label }}</span>
      </button>
    </div>

    <template v-if="filters.status">
      <div class="mb-4">
        <span class="text-xs font-semibold uppercase tracking-wide text-gray-400">By visit type</span>
        <div class="mt-2 flex flex-wrap gap-2">
          <span
            v-for="t in summary.by_type || []"
            :key="t.key"
            class="rounded-full border border-dashed border-gray-300 px-3 py-1 text-xs font-semibold text-gray-700 dark:border-gray-700 dark:text-gray-300"
          >
            {{ t.label }} &middot; {{ byTypeCountFor(t) }}
          </span>
        </div>
      </div>

      <div class="mb-3 flex items-center justify-between gap-3">
        <FormControl type="text" placeholder="Search by patient name" v-model="search" class="w-64" />
        <a
          class="flex items-center gap-1 text-sm font-medium text-gray-700 hover:underline dark:text-gray-300"
          :href="excelUrl"
          target="_blank"
          rel="noopener"
        >
          <FeatherIcon name="download" class="h-4 w-4" />
          Download Excel
        </a>
      </div>

      <div v-if="drilldownLoading && !workOrderDrilldownResource.data" class="space-y-2">
        <Skeleton v-for="i in 6" :key="i" height="2.5rem" />
      </div>
      <ErrorMessage v-else-if="workOrderDrilldownResource.error" :message="workOrderDrilldownResource.error" />
      <div v-else-if="visibleRecords.length === 0" class="py-10 text-center text-sm text-gray-500 dark:text-gray-400">
        No records for this selection.
      </div>
      <div v-else class="overflow-x-auto rounded-lg border dark:border-gray-800">
        <table class="w-full min-w-[48rem] text-left text-sm">
          <thead class="border-b bg-gray-50 text-xs uppercase text-gray-500 dark:border-gray-800 dark:bg-gray-800 dark:text-gray-400">
            <tr>
              <th class="px-4 py-2">Patient</th>
              <th class="px-4 py-2">Visit Type</th>
              <th class="px-4 py-2">Village</th>
              <th class="px-4 py-2">Visit Window (From &ndash; To)</th>
              <th class="px-4 py-2">Status</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="row in visibleRecords"
              :key="`${row.doctype}-${row.name}`"
              class="cursor-pointer border-b last:border-0 hover:bg-gray-50 dark:border-gray-800 dark:hover:bg-gray-800"
              :class="{ 'bg-red-50/40 dark:bg-red-950/10': row.high_risk === 'Yes' }"
              @click="openRecord(row)"
            >
              <td class="px-4 py-2 font-medium text-gray-900 dark:text-gray-100">
                {{ row.patient || row.name }}
                <span
                  v-if="row.high_risk === 'Yes'"
                  class="ml-2 rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-bold text-red-700 dark:bg-red-900/40 dark:text-red-300"
                >
                  HIGH RISK
                </span>
              </td>
              <td class="px-4 py-2 text-gray-600 dark:text-gray-400">{{ row.visit_type }}</td>
              <td class="px-4 py-2 text-gray-600 dark:text-gray-400">{{ row.village || '-' }}</td>
              <td class="px-4 py-2 whitespace-nowrap text-gray-600 dark:text-gray-400">{{ windowRange(row) }}</td>
              <td class="px-4 py-2">
                <span class="rounded-full px-2 py-0.5 text-xs font-bold" :class="statusBadgeClass(row.status)">
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
import { computed, reactive, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { ErrorMessage, FeatherIcon, FormControl } from 'frappe-ui'
import AppLayout from '@/layouts/AppLayout.vue'
import PageHeader from '@/components/PageHeader.vue'
import Skeleton from '@/components/Skeleton.vue'
import { session } from '@/data/session'
import { userContextResource } from '@/data/userContext'
import { villagesResource, healthWorkersResource, ALL_VILLAGES, ALL_HEALTH_WORKERS } from '@/data/dashboardFilters'
import {
  workOrderSummaryResource,
  workOrderDrilldownResource,
  VISIT_TYPES,
  STATUS_CARDS,
  STATUS_OPTIONS,
  STATUS_BADGE_CLASSES,
} from '@/data/workOrders'
import { setPageTitle } from '@/data/pageTitle'
import { goToRecord } from '@/data/openRecord'

setPageTitle('Work Orders')

const router = useRouter()

const isPrivileged = computed(() => !!userContextResource.data?.is_privileged)

const filters = reactive({
  status: '',
  visit_type: '',
  risk: '',
  village: ALL_VILLAGES,
  health_worker: ALL_HEALTH_WORKERS,
})

const visitTypeOptions = [{ label: 'All Visit Types', value: '' }, ...VISIT_TYPES.map((v) => ({ label: v, value: v }))]
const riskOptions = [
  { label: 'All', value: '' },
  { label: 'High Risk', value: 'high_risk' },
  { label: 'Normal', value: 'normal' },
]
const villageOptions = computed(() => [
  { label: ALL_VILLAGES, value: ALL_VILLAGES },
  ...(villagesResource.data || []).map((v) => ({ label: v, value: v })),
])
const healthWorkerOptions = computed(() => [
  { label: ALL_HEALTH_WORKERS, value: ALL_HEALTH_WORKERS },
  ...(healthWorkersResource.data || []).map((v) => ({ label: v, value: v })),
])

const emptySummary = { health_worker_linked: true, this_week: 0, today: 0, upcoming: 0, overdue: 0, completed: 0, high_risk: 0, by_type: [] }
const summaryLoading = computed(() => workOrderSummaryResource.loading)
const summary = computed(() => workOrderSummaryResource.data || emptySummary)

function loadSummary() {
  workOrderSummaryResource.fetch({
    village: filters.village,
    health_worker: filters.health_worker,
    visit_type: filters.visit_type || undefined,
  })
}

function loadRecords() {
  // Landing view (nothing picked yet) - don't bother fetching records at all,
  // same as the Desk page leaving the table hidden until a card is picked.
  if (!filters.status) return
  workOrderDrilldownResource.fetch({
    status: filters.status,
    village: filters.village,
    health_worker: filters.health_worker,
    visit_type: filters.visit_type || undefined,
  })
}

watch(
  isPrivileged,
  (privileged) => {
    if (!privileged) {
      loadSummary()
      return
    }
    if (!villagesResource.data) villagesResource.fetch()
    if (!healthWorkersResource.data) healthWorkersResource.fetch()
    loadSummary()
  },
  { immediate: true }
)
watch(() => [filters.village, filters.health_worker, filters.visit_type], () => {
  loadSummary()
  loadRecords()
})
watch(() => filters.status, loadRecords)

function toggleStatus(key) {
  filters.status = filters.status === key ? '' : key
}

function byTypeCountFor(t) {
  if (filters.status === 'all') return t.this_week + t.overdue
  return t[filters.status] || 0
}

const drilldownLoading = computed(() => workOrderDrilldownResource.loading)
const allRecords = computed(() => workOrderDrilldownResource.data?.records || [])
const search = ref('')
const visibleRecords = computed(() => {
  let rows = allRecords.value
  if (filters.risk === 'high_risk') rows = rows.filter((r) => r.high_risk === 'Yes')
  else if (filters.risk === 'normal') rows = rows.filter((r) => r.high_risk !== 'Yes')
  const q = (search.value || '').trim().toLowerCase()
  if (q) rows = rows.filter((r) => `${r.patient || ''} ${r.name || ''}`.toLowerCase().includes(q))
  return rows
})

function statusBadgeClass(status) {
  return STATUS_BADGE_CLASSES[status] || 'bg-blue-100 text-blue-700'
}

function windowRange(row) {
  if (!row.due_date) return '-'
  const from = row.from_date || addDays(row.due_date, -30)
  return `${formatDate(from)} – ${formatDate(row.due_date)}`
}

function addDays(dateStr, days) {
  const d = new Date(dateStr)
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

function formatDate(value) {
  if (!value) return '-'
  return new Date(value).toLocaleDateString()
}

function openRecord(row) {
  goToRecord(router, row.doctype, row.name)
}

const excelUrl = computed(() => {
  const params = new URLSearchParams({
    status: filters.status || '',
    village: filters.village || '',
    health_worker: filters.health_worker || '',
    visit_type: filters.visit_type || '',
  })
  return `/api/method/chw.api.chw_work_order_drilldown_excel?${params.toString()}`
})
</script>

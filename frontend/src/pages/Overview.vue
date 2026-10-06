<template>
  <AppLayout>
    <PageHeader>
      <template #title>
        <h1 class="text-lg font-semibold text-gray-900 dark:text-gray-100">Program Overview</h1>
      </template>
      <template #actions>
        <Button variant="outline" :loading="cardsLoading" @click="loadCards">
          <template #prefix>
            <FeatherIcon name="refresh-cw" class="h-4 w-4" />
          </template>
          Refresh
        </Button>
      </template>
    </PageHeader>

    <div class="mb-4 flex flex-wrap items-end gap-3">
      <div class="w-40 flex-shrink-0">
        <FormControl
          type="select"
          class="[&_[data-slot=trigger]]:w-full"
          label="Date range"
          :options="dateRangeOptions"
          v-model="filters.date_range"
        />
      </div>
      <div v-if="isPrivileged" class="w-48 flex-shrink-0">
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

    <div v-if="!isPrivileged" class="py-10 text-center text-gray-500 dark:text-gray-400">
      Program Overview is only available to coordinators.
    </div>

    <template v-else>
      <div v-if="cardsLoading && !overviewCardsResource.data" class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div
          v-for="i in 8"
          :key="i"
          class="rounded-lg border p-4 dark:border-gray-800"
        >
          <Skeleton width="3rem" height="1.75rem" />
          <Skeleton width="70%" height="0.75rem" class="mt-2" />
        </div>
      </div>
      <ErrorMessage v-else-if="overviewCardsResource.error" :message="overviewCardsResource.error" />

      <div v-else class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <button
          v-for="card in cards"
          :key="card.key"
          type="button"
          class="rounded-lg border border-t-4 bg-white p-4 text-left dark:border-gray-800 dark:bg-gray-800"
          :class="overviewColorClasses(card.color)"
          @click="openDrilldown(card)"
        >
          <span class="block text-2xl font-bold text-gray-900 dark:text-gray-100">{{ card.count }}</span>
          <span class="mt-1 block text-sm font-medium text-gray-600 dark:text-gray-300">{{ card.label }}</span>
        </button>
      </div>
      <p class="mt-4 text-xs text-gray-400 dark:text-gray-500">
        Click a card to see the records behind it, filtered by the selection above.
      </p>
    </template>

    <Dialog v-model="showDrilldown" :options="{ title: activeCard?.label, size: '3xl' }">
      <template #body-content>
        <div v-if="drilldownLoading" class="space-y-2">
          <Skeleton v-for="i in 5" :key="i" height="2rem" />
        </div>
        <template v-else>
          <div class="mb-3 flex items-center justify-between gap-3">
            <FormControl
              type="text"
              placeholder="Search by name"
              v-model="drilldownSearch"
              class="w-60"
            />
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
          <div v-if="filteredDrilldownRecords.length === 0" class="py-8 text-center text-sm text-gray-500 dark:text-gray-400">
            No records for this selection.
          </div>
          <div v-else class="max-h-96 overflow-y-auto rounded-lg border dark:border-gray-800">
            <table class="w-full text-left text-sm">
              <thead class="sticky top-0 border-b bg-gray-50 text-xs uppercase text-gray-500 dark:border-gray-800 dark:bg-gray-800 dark:text-gray-400">
                <tr>
                  <th class="px-3 py-2">Name</th>
                  <th class="px-3 py-2">Village</th>
                  <th class="px-3 py-2">Date</th>
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="row in filteredDrilldownRecords"
                  :key="row.name"
                  class="border-b last:border-0 dark:border-gray-800"
                >
                  <td class="px-3 py-2">
                    <button
                      type="button"
                      class="font-medium text-blue-600 hover:underline dark:text-blue-400"
                      @click="openRecord(row)"
                    >
                      {{ row.patient || row.name }}
                    </button>
                  </td>
                  <td class="px-3 py-2 text-gray-600 dark:text-gray-400">{{ row.village || '-' }}</td>
                  <td class="px-3 py-2 text-gray-600 dark:text-gray-400">{{ formatDate(row.creation) }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </template>
      </template>
    </Dialog>
  </AppLayout>
</template>

<script setup>
import { computed, reactive, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { Button, Dialog, ErrorMessage, FeatherIcon, FormControl } from 'frappe-ui'
import AppLayout from '@/layouts/AppLayout.vue'
import PageHeader from '@/components/PageHeader.vue'
import Skeleton from '@/components/Skeleton.vue'
import { userContextResource } from '@/data/userContext'
import { villagesResource, healthWorkersResource, ALL_VILLAGES, ALL_HEALTH_WORKERS } from '@/data/dashboardFilters'
import { overviewCardsResource, overviewDrilldownCall, overviewColorClasses } from '@/data/overview'
import { setPageTitle } from '@/data/pageTitle'
import { goToRecord } from '@/data/openRecord'

setPageTitle('Program Overview')

const router = useRouter()

const isPrivileged = computed(() => !!userContextResource.data?.is_privileged)

const filters = reactive({
  date_range: 'all',
  village: ALL_VILLAGES,
  health_worker: ALL_HEALTH_WORKERS,
})

const dateRangeOptions = [
  { label: 'All time', value: 'all' },
  { label: 'Today', value: 'today' },
  { label: 'This week', value: 'week' },
  { label: 'This month', value: 'month' },
]

const villageOptions = computed(() => [
  { label: ALL_VILLAGES, value: ALL_VILLAGES },
  ...(villagesResource.data || []).map((v) => ({ label: v, value: v })),
])
const healthWorkerOptions = computed(() => [
  { label: ALL_HEALTH_WORKERS, value: ALL_HEALTH_WORKERS },
  ...(healthWorkersResource.data || []).map((v) => ({ label: v, value: v })),
])

const cardsLoading = computed(() => overviewCardsResource.loading)
const cards = computed(() => overviewCardsResource.data || [])

function loadCards() {
  if (!isPrivileged.value) return
  overviewCardsResource.fetch({
    village: filters.village,
    health_worker: filters.health_worker,
    date_range: filters.date_range,
  })
}

// Village/Health Worker options are privileged-only on the backend - only
// fetched once we actually know the user qualifies, same gating the Desk
// page's own loadFilterOptions() relies on.
watch(
  isPrivileged,
  (privileged) => {
    if (!privileged) return
    if (!villagesResource.data) villagesResource.fetch()
    if (!healthWorkersResource.data) healthWorkersResource.fetch()
    loadCards()
  },
  { immediate: true }
)
watch(() => [filters.date_range, filters.village, filters.health_worker], loadCards)

const showDrilldown = ref(false)
const activeCard = ref(null)
const drilldownSearch = ref('')
const drilldownLoading = computed(() => overviewDrilldownCall.loading)
const drilldownRecords = computed(() => overviewDrilldownCall.data?.records || [])
const filteredDrilldownRecords = computed(() => {
  const q = drilldownSearch.value.trim().toLowerCase()
  if (!q) return drilldownRecords.value
  return drilldownRecords.value.filter((r) => `${r.patient || ''} ${r.name || ''}`.toLowerCase().includes(q))
})

function openDrilldown(card) {
  activeCard.value = card
  drilldownSearch.value = ''
  showDrilldown.value = true
  overviewDrilldownCall.submit({
    card_key: card.key,
    village: filters.village,
    health_worker: filters.health_worker,
    date_range: filters.date_range,
  })
}

const excelUrl = computed(() => {
  if (!activeCard.value) return '#'
  const params = new URLSearchParams({
    card_key: activeCard.value.key,
    village: filters.village,
    health_worker: filters.health_worker,
    date_range: filters.date_range,
  })
  return `/api/method/chw.api.chw_dashboard_drilldown_excel?${params.toString()}`
})

function openRecord(row) {
  const stayedInApp = goToRecord(router, activeCard.value.doctype, row.name)
  if (stayedInApp) showDrilldown.value = false
}

function formatDate(value) {
  if (!value) return '-'
  return new Date(value).toLocaleDateString()
}
</script>

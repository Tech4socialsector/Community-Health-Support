<template>
  <AppLayout>
    <div :class="ui.PAGE">
      <PageHeader description="Today, upcoming and overdue visits across ANC, PNC, Palliative Care, Postpartum and Child 6 wk–1 year.">
        <template #title>
          <h1 class="text-lg font-semibold text-navy-900 dark:text-gray-100">Work Orders</h1>
        </template>
        <template #actions>
          <span :class="[ui.PILL, ui.TONE.navy, 'gap-1.5']">
            <LucideIcon name="user-round" class="h-3.5 w-3.5" />
            {{ session.full_name || session.user }} · {{ isPrivileged ? 'Coordinator' : 'CHW Health Worker' }}
          </span>
        </template>
      </PageHeader>

      <!-- Filters: one row above everything they drive. Village / Health
      Worker are coordinator-only - a CHW is always scoped to themselves
      server-side. -->
      <div :class="ui.FILTER_BAR">
        <div v-for="control in filterControls" :key="control.key" :class="ui.FILTER_FIELD">
          <span :class="ui.FILTER_LABEL">{{ control.label }}</span>
          <FormControl type="select" class="[&_[data-slot=trigger]]:w-full" :options="control.options" v-model="filters[control.key]" />
        </div>
        <button v-if="hasActiveFilters" type="button" :class="ui.BTN_SECONDARY" @click="clearFilters">
          <LucideIcon name="x" class="h-4 w-4" />
          Clear filters
        </button>
      </div>

      <div
        v-if="!isPrivileged && summary.health_worker_linked === false"
        :class="ui.WARNING_BOX"
      >
        <LucideIcon name="triangle-alert" class="mt-0.5 h-4 w-4 flex-shrink-0" />
        <span>
          No Health Worker record is linked to your login. Ask your coordinator to set the
          <strong>User</strong> field on your Health Worker record so your work order list can show here.
        </span>
      </div>

      <ErrorMessage v-if="summaryError" :message="summaryError" />

      <!-- Status cards - click one to open its visits in the popup. The
      icon tiles keep their meaning colours (overdue red, completed green,
      ...); everything else is the shared card look. -->
      <div v-else class="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3">
        <button
          v-for="card in STATUS_CARDS"
          :key="card.key"
          type="button"
          :aria-pressed="filters.status === card.key"
          :class="ui.statCardTone(card.tone)"
          @click="openStatus(card.key)"
        >
          <span class="flex w-full items-start justify-between gap-2">
            <span :class="ui.STAT_LABEL">{{ card.label }}</span>
            <span :class="[ui.ICON_TILE_BASE, card.iconClass]">
              <LucideIcon :name="card.icon" class="h-[18px] w-[18px]" />
            </span>
          </span>
          <Skeleton v-if="summaryLoading && !summaryLoaded" width="3rem" height="2rem" />
          <span v-else :class="ui.statCountTone(card.tone)">{{ summary[card.key] || 0 }}</span>
          <span :class="ui.STAT_CTA">
            View visits
            <LucideIcon name="arrow-right" class="h-4 w-4 transition group-hover:translate-x-0.5" />
          </span>
        </button>
      </div>
    </div>

    <!-- Drilldown popup, centred over the page (like the Desk page's). It
    is open exactly while a status is selected; closing it clears the
    status. No filter selects inside - it shows the visits for the filters
    already chosen on the page; only a quick patient search and the Excel
    export. A table from sm up; stacked visit cards on a phone. -->
    <Dialog v-model="showDrilldown" :options="{ size: '6xl' }">
      <template #body-title>
        <div class="flex min-w-0 items-center gap-3">
          <span v-if="selectedCard" :class="[ui.ICON_TILE_BASE, selectedCard.iconClass]">
            <LucideIcon :name="selectedCard.icon" class="h-[18px] w-[18px]" />
          </span>
          <h3 class="truncate text-base font-semibold text-navy-900 dark:text-gray-100 sm:text-lg">{{ selectedStatusLabel }}</h3>
          <span v-if="!records.loading || records.total" :class="ui.COUNT_BADGE">{{ records.total }}</span>
        </div>
      </template>
      <template #body-content>
        <div class="space-y-3">
          <div class="flex items-center justify-between gap-2">
            <div class="relative min-w-0 flex-1 sm:w-72 sm:flex-none">
              <LucideIcon name="search" class="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input
                v-model="search"
                type="search"
                placeholder="Search patient on this page"
                class="h-9 w-full rounded-lg border-0 bg-white pl-9 pr-3 text-sm text-gray-900 ring-1 ring-gray-200 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-forest-400 dark:bg-gray-900 dark:text-gray-100 dark:ring-gray-700"
              />
            </div>
            <a v-if="records.total" :href="excelUrl" target="_blank" rel="noopener" :class="[ui.BTN_SECONDARY, 'flex-shrink-0']">
              <LucideIcon name="download" class="h-4 w-4 text-forest-700 dark:text-forest-300" />
              Excel
            </a>
          </div>

          <div v-if="summary.by_type?.length" class="flex flex-wrap gap-2">
            <span v-for="t in summary.by_type" :key="t.key" :class="[ui.PILL, ui.TONE.gray, 'gap-1.5']">
              {{ t.label }}
              <span class="font-bold tabular-nums text-navy-900 dark:text-gray-100">{{ byTypeCountFor(t) }}</span>
            </span>
          </div>

          <ErrorMessage v-if="records.error" :message="records.error" />
          <div v-else-if="records.loading && !records.rows.length" class="space-y-2">
            <Skeleton v-for="i in 6" :key="i" height="2.75rem" />
          </div>
          <div v-else-if="!visibleRows.length" :class="ui.EMPTY_STATE">
            <LucideIcon name="inbox" class="h-8 w-8 text-gray-300 dark:text-gray-600" />
            {{ records.rows.length ? 'No visits match the search / risk filter on this page.' : 'No visits for this selection.' }}
          </div>
          <template v-else>
            <div :class="[ui.TABLE_WRAP, 'hidden max-h-[50vh] sm:block', { 'opacity-60': records.loading }]">
              <table :class="ui.TABLE">
                <thead :class="ui.THEAD">
                  <tr>
                    <th :class="ui.TH">Patient</th>
                    <th :class="ui.TH">Visit Type</th>
                    <th :class="ui.TH">Village</th>
                    <th :class="ui.TH">Visit Window</th>
                    <th :class="ui.TH">Status</th>
                  </tr>
                </thead>
                <tbody :class="ui.TBODY">
                  <tr
                    v-for="row in visibleRows"
                    :key="`${row.doctype}-${row.name}`"
                    tabindex="0"
                    :class="ui.TR"
                    @click="openRecord(row)"
                    @keydown.enter="openRecord(row)"
                  >
                    <td :class="ui.TD_STRONG">
                      {{ row.patient || row.name }}
                      <span v-if="row.high_risk === 'Yes'" :class="[ui.FLAG, ui.TONE.red, 'ml-2']">High risk</span>
                    </td>
                    <td :class="ui.TD">{{ row.visit_type }}</td>
                    <td :class="ui.TD">
                      <span v-if="row.village">{{ row.village }}</span>
                      <span v-else class="text-gray-300 dark:text-gray-600">—</span>
                    </td>
                    <td :class="[ui.TD, 'tabular-nums']">{{ windowRange(row) }}</td>
                    <td :class="ui.TD">
                      <span :class="[ui.PILL, statusBadgeClass(row.status)]">{{ row.status }}</span>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div class="max-h-[55vh] space-y-2 overflow-y-auto sm:hidden" :class="{ 'opacity-60': records.loading }">
              <button
                v-for="(row, index) in visibleRows"
                :key="`${row.doctype}-${row.name}`"
                type="button"
                :class="ui.mobileRowClass(index)"
                @click="openRecord(row)"
              >
                <span class="flex items-start justify-between gap-2">
                  <span class="min-w-0">
                    <span class="block truncate font-semibold text-navy-900 dark:text-gray-100">{{ row.patient || row.name }}</span>
                    <span class="block truncate text-xs text-gray-500">{{ row.visit_type }}<template v-if="row.village"> · {{ row.village }}</template></span>
                  </span>
                  <span :class="[ui.PILL, statusBadgeClass(row.status), 'flex-shrink-0']">{{ row.status }}</span>
                </span>
                <span class="mt-2 flex items-center justify-between gap-2 text-xs">
                  <span class="inline-flex items-center gap-1 tabular-nums text-gray-600 dark:text-gray-300">
                    <LucideIcon name="calendar-range" class="h-3.5 w-3.5 text-gray-400" />
                    {{ windowRange(row) }}
                  </span>
                  <span v-if="row.high_risk === 'Yes'" :class="[ui.FLAG, ui.TONE.red]">High risk</span>
                </span>
              </button>
            </div>
          </template>

          <div class="flex flex-wrap items-center justify-between gap-3">
            <span class="text-sm text-gray-500 dark:text-gray-400">
              <template v-if="records.total">
                {{ records.start + 1 }}–{{ records.start + records.rows.length }} of {{ records.total }}
              </template>
            </span>
            <div class="flex items-center gap-2">
              <button
                type="button"
                :class="ui.BTN_SECONDARY"
                :disabled="records.loading || records.start === 0"
                aria-label="Previous page"
                @click="changePage(-1)"
              >
                <LucideIcon name="chevron-left" class="h-4 w-4" />
              </button>
              <button
                type="button"
                :class="ui.BTN_SECONDARY"
                :disabled="records.loading || records.start + records.rows.length >= records.total"
                aria-label="Next page"
                @click="changePage(1)"
              >
                <LucideIcon name="chevron-right" class="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      </template>
    </Dialog>
  </AppLayout>
</template>

<script setup>
import { computed, reactive, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { Dialog, ErrorMessage, FormControl, call } from 'frappe-ui'
import AppLayout from '@/layouts/AppLayout.vue'
import PageHeader from '@/components/PageHeader.vue'
import Skeleton from '@/components/Skeleton.vue'
import LucideIcon from '@/components/LucideIcon.vue'
import { session } from '@/data/session'
import { userContextResource } from '@/data/userContext'
import { villagesResource, healthWorkersResource, ALL_VILLAGES, ALL_HEALTH_WORKERS } from '@/data/dashboardFilters'
import { VISIT_TYPES, PAGE_SIZE, STATUS_CARDS, STATUS_OPTIONS, RISK_OPTIONS, statusBadgeClass } from '@/data/workOrders'
import { setPageTitle } from '@/data/pageTitle'
import * as ui from '@/data/ui'
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

const hasActiveFilters = computed(
  () =>
    !!(filters.status || filters.visit_type || filters.risk) ||
    filters.village !== ALL_VILLAGES ||
    filters.health_worker !== ALL_HEALTH_WORKERS,
)

function clearFilters() {
  Object.assign(filters, {
    status: '',
    visit_type: '',
    risk: '',
    village: ALL_VILLAGES,
    health_worker: ALL_HEALTH_WORKERS,
  })
}

const visitTypeOptions = [{ label: 'All Visit Types', value: '' }, ...VISIT_TYPES.map((v) => ({ label: v, value: v }))]
const villageOptions = computed(() => [
  { label: ALL_VILLAGES, value: ALL_VILLAGES },
  ...(villagesResource.data || []).map((v) => ({ label: v, value: v })),
])
const healthWorkerOptions = computed(() => [
  { label: ALL_HEALTH_WORKERS, value: ALL_HEALTH_WORKERS },
  ...(healthWorkersResource.data || []).map((v) => ({ label: v, value: v })),
])

// One list, rendered both on the page and at the top of the popup, so the
// two copies can never drift apart. Village / Health Worker are
// coordinator-only - a CHW is always scoped to themselves server-side.
const filterControls = computed(() => [
  { key: 'status', label: 'Status', options: STATUS_OPTIONS, width: 'min-[480px]:w-44' },
  { key: 'visit_type', label: 'Visit Type', options: visitTypeOptions, width: 'min-[480px]:w-52' },
  { key: 'risk', label: 'Risk', options: RISK_OPTIONS, width: 'min-[480px]:w-36' },
  ...(isPrivileged.value
    ? [
        { key: 'village', label: 'Village', options: villageOptions.value, width: 'min-[480px]:w-44' },
        { key: 'health_worker', label: 'Health Worker', options: healthWorkerOptions.value, width: 'min-[480px]:w-52' },
      ]
    : []),
])

// Village / Health Worker options are privileged-only on the backend
// (get_health_workers throws otherwise), so only fetched once we know.
watch(
  isPrivileged,
  (privileged) => {
    if (!privileged) return
    if (!villagesResource.data) villagesResource.fetch()
    if (!healthWorkersResource.data) healthWorkersResource.fetch()
  },
  { immediate: true },
)

// The params every server call shares. visit_type is dropped when empty -
// the backend treats a missing one as "all types".
function scopeParams() {
  return {
    village: filters.village,
    health_worker: filters.health_worker,
    ...(filters.visit_type ? { visit_type: filters.visit_type } : {}),
  }
}

function errorText(e, fallback) {
  return e?.messages?.join(', ') || e?.message || fallback
}

// ---- Summary (the 6 cards) ----
// call() with explicit args rather than a shared useCall().fetch(args):
// fetch is useCall's execute(), which ignores any args passed to it, so
// the filters (and, for records, the status) never reached the server
// before. A request counter drops responses overtaken by a newer request.
const emptySummary = { health_worker_linked: true, this_week: 0, today: 0, upcoming: 0, overdue: 0, completed: 0, high_risk: 0, by_type: [] }
const summary = ref(emptySummary)
const summaryLoading = ref(false)
const summaryLoaded = ref(false)
const summaryError = ref(null)
let summaryRequestId = 0

async function loadSummary() {
  const requestId = ++summaryRequestId
  summaryLoading.value = true
  summaryError.value = null
  try {
    const data = await call('chw.api.get_chw_work_order_summary', scopeParams())
    if (requestId !== summaryRequestId) return
    summary.value = data || emptySummary
    summaryLoaded.value = true
  } catch (e) {
    if (requestId !== summaryRequestId) return
    summaryError.value = errorText(e, 'Could not load the work order summary.')
  } finally {
    if (requestId === summaryRequestId) summaryLoading.value = false
  }
}

// ---- Records for the selected status ----
const records = reactive({ rows: [], total: 0, start: 0, loading: false, error: null })
let recordsRequestId = 0

async function loadRecords() {
  const requestId = ++recordsRequestId
  // Landing view (nothing picked yet) - no fetch, same as the Desk page
  // keeping its drilldown closed until a card is picked.
  if (!filters.status) {
    Object.assign(records, { rows: [], total: 0, start: 0, loading: false, error: null })
    return
  }
  records.loading = true
  records.error = null
  try {
    const data = await call('chw.api.chw_work_order_drilldown', {
      status: filters.status,
      ...scopeParams(),
      page_length: PAGE_SIZE,
      start: records.start,
    })
    if (requestId !== recordsRequestId) return
    records.rows = data?.records || []
    records.total = data?.total_count ?? records.rows.length
  } catch (e) {
    if (requestId !== recordsRequestId) return
    records.error = errorText(e, 'Could not load visits.')
  } finally {
    if (requestId === recordsRequestId) records.loading = false
  }
}

function changePage(direction) {
  records.start = Math.max(0, records.start + direction * PAGE_SIZE)
  loadRecords()
}

loadSummary()

// Scope changes refresh both and go back to page 1.
watch(
  () => [filters.village, filters.health_worker, filters.visit_type],
  () => {
    records.start = 0
    loadSummary()
    loadRecords()
  },
)

// A newly picked status starts on page 1 with a fresh search.
watch(
  () => filters.status,
  () => {
    records.start = 0
    search.value = ''
    loadRecords()
  },
)

function openStatus(key) {
  filters.status = key
}

// The popup is open exactly while a status is selected - a card click or
// the Status filter opens it; closing it (X, Esc, backdrop) clears the
// status, which also un-highlights the card and empties the records.
const showDrilldown = computed({
  get: () => !!filters.status,
  set: (open) => {
    if (!open) filters.status = ''
  },
})

const selectedCard = computed(() => STATUS_CARDS.find((c) => c.key === filters.status) || null)

const selectedStatusLabel = computed(
  () => STATUS_OPTIONS.find((o) => o.value === filters.status)?.label || '',
)

function byTypeCountFor(t) {
  if (filters.status === 'all') return (t.this_week || 0) + (t.overdue || 0)
  return t[filters.status] || 0
}

// Risk and search only narrow the page already loaded - same as the Desk
// page's Risk filter, no extra server round trip.
const search = ref('')
const visibleRows = computed(() => {
  let rows = records.rows
  if (filters.risk === 'high_risk') rows = rows.filter((r) => r.high_risk === 'Yes')
  else if (filters.risk === 'normal') rows = rows.filter((r) => r.high_risk !== 'Yes')
  const q = search.value.trim().toLowerCase()
  if (q) rows = rows.filter((r) => `${r.patient || ''} ${r.name || ''}`.toLowerCase().includes(q))
  return rows
})

// Matches the page on screen exactly - same status, scope, page and Risk.
const excelUrl = computed(() => {
  const params = new URLSearchParams({
    status: filters.status,
    village: filters.village || '',
    health_worker: filters.health_worker || '',
    visit_type: filters.visit_type || '',
    page_length: PAGE_SIZE,
    start: records.start,
    risk: filters.risk || '',
  })
  return `/api/method/chw.api.chw_work_order_drilldown_excel?${params.toString()}`
})

function openRecord(row) {
  goToRecord(router, row.doctype, row.name)
}

// ---- Dates ----
// Parsed as local calendar dates: new Date('2026-07-08') is UTC midnight,
// which can land on the previous day once shown in local time.
function parseDate(value) {
  const [y, m, d] = String(value).slice(0, 10).split('-').map(Number)
  return y && m && d ? new Date(y, m - 1, d) : null
}

function formatDate(date) {
  return date.toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' })
}

// Always a full range - with no stored window start (older records, or the
// manual phase's typed date), falls back to 30 days before the due date,
// same as the Desk page.
function windowRange(row) {
  const due = row.due_date ? parseDate(row.due_date) : null
  if (!due) return '—'
  let from = row.from_date ? parseDate(row.from_date) : null
  if (!from) {
    from = new Date(due)
    from.setDate(from.getDate() - 30)
  }
  return `${formatDate(from)} – ${formatDate(due)}`
}
</script>

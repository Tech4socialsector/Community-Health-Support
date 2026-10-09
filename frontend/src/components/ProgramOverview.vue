<template>
  <div class="space-y-5">
    <!-- Filters: one row above the cards, all driving the counts. -->
    <div :class="ui.FILTER_BAR">
      <div class="w-full sm:w-auto">
        <span :class="ui.FILTER_LABEL">Date range</span>
        <!-- Segmented control: equal-width cells across the full width on a
        phone, a compact strip from sm up. -->
        <div
          class="grid w-full grid-cols-4 rounded-lg bg-gray-100 p-0.5 dark:bg-gray-800 sm:inline-flex sm:w-auto"
          role="group"
          aria-label="Date range"
        >
          <button
            v-for="opt in DATE_RANGES"
            :key="opt.value"
            type="button"
            :aria-pressed="filters.date_range === opt.value"
            class="whitespace-nowrap rounded-md px-2 py-1.5 text-[13px] font-medium transition sm:px-3 sm:text-sm"
            :class="
              filters.date_range === opt.value
                ? 'bg-navy-900 text-white shadow-sm dark:bg-navy-100 dark:text-navy-900'
                : 'text-gray-600 hover:text-navy-900 dark:text-gray-400 dark:hover:text-gray-100'
            "
            @click="filters.date_range = opt.value"
          >
            {{ opt.label }}
          </button>
        </div>
      </div>
      <div :class="ui.FILTER_FIELD">
        <span :class="ui.FILTER_LABEL">Village</span>
        <FormControl type="select" class="[&_[data-slot=trigger]]:w-full" :options="villageOptions" v-model="filters.village" />
      </div>
      <div :class="ui.FILTER_FIELD">
        <span :class="ui.FILTER_LABEL">Health Worker</span>
        <FormControl type="select" class="[&_[data-slot=trigger]]:w-full" :options="healthWorkerOptions" v-model="filters.health_worker" />
      </div>
      <div class="flex w-full items-center justify-between gap-3 sm:ml-auto sm:w-auto sm:justify-end">
        <span v-if="updatedAt" class="text-xs text-gray-400">Updated {{ updatedAt }}</span>
        <button type="button" :disabled="cardsLoading" :class="ui.BTN_PRIMARY" @click="refresh">
          <LucideIcon name="refresh-cw" class="h-4 w-4" :class="{ 'animate-spin': cardsLoading }" />
          Refresh
        </button>
      </div>
    </div>

    <ErrorMessage v-if="cardsError" :message="cardsError" />

    <!-- Program cards: click opens that program's records. Same card as
    Home and Work Orders; every program gets the one brand icon tile (the
    icon itself tells them apart), so the page reads as one calm set. -->
    <section v-else>
      <div class="mb-3 flex items-center gap-3">
        <h2 :class="ui.SECTION_LABEL">Overview</h2>
        <span class="h-px flex-1 bg-gray-200 dark:bg-gray-800" />
      </div>
      <div :class="ui.STAT_GRID_4">
        <template v-if="cardsLoading && !cards.length">
          <div v-for="i in 8" :key="i" :class="ui.STAT_CARD">
            <span class="flex w-full items-start justify-between gap-3">
              <Skeleton width="60%" height="0.875rem" />
              <Skeleton width="2.25rem" height="2.25rem" />
            </span>
            <Skeleton width="3rem" height="2rem" />
            <Skeleton width="5.5rem" height="0.875rem" />
          </div>
        </template>
        <template v-else>
          <button
            v-for="(card, index) in cards"
            :key="card.key"
            type="button"
            :class="[ui.statCardAt(index), { 'opacity-60': cardsLoading }]"
            @click="openDrilldown(card)"
          >
            <span class="flex w-full items-start justify-between gap-2">
              <span :class="ui.STAT_LABEL" :title="card.label">{{ card.label }}</span>
              <span :class="ui.ICON_TILE">
                <LucideIcon :name="card.icon || 'file-text'" class="h-[18px] w-[18px]" />
              </span>
            </span>
            <span :class="ui.statCountAt(index)">{{ formatNumber(card.count) }}</span>
            <span :class="ui.STAT_CTA">
              View records
              <LucideIcon name="arrow-right" class="h-4 w-4 transition group-hover:translate-x-0.5" />
            </span>
          </button>
        </template>
      </div>
    </section>

    <!-- Below the program cards, as on the Desk page; same Village / Health
    Worker filters (they have no date range). -->
    <NewIndicators :village="filters.village" :health-worker="filters.health_worker" :refresh-key="refreshKey" />

    <!-- Drilldown: the selected program's records - columns come from its
    doctype's own in_list_view meta, same as the Desk page's popup. A table
    from sm up; stacked cards on a phone, where a wide table would need
    sideways scrolling. -->
    <Dialog v-model="showDrilldown" :options="{ size: '6xl' }">
      <template #body-title>
        <div v-if="activeCard" class="flex min-w-0 items-center gap-3">
          <span :class="ui.ICON_TILE">
            <LucideIcon :name="activeCard.icon || 'file-text'" class="h-[18px] w-[18px]" />
          </span>
          <h3 class="truncate text-base font-semibold text-navy-900 dark:text-gray-100 sm:text-lg">{{ activeCard.label }}</h3>
          <span v-if="!drill.loading || drill.total" :class="ui.COUNT_BADGE">{{ formatNumber(drill.total) }}</span>
        </div>
      </template>
      <template #body-content>
        <div class="space-y-3">
          <ErrorMessage v-if="drill.error" :message="drill.error" />

          <div v-else-if="drill.loading && !drill.records.length" class="space-y-2">
            <Skeleton v-for="i in 6" :key="i" height="2.75rem" />
          </div>
          <div v-else-if="!drill.records.length" :class="ui.EMPTY_STATE">
            <LucideIcon name="inbox" class="h-8 w-8 text-gray-300 dark:text-gray-600" />
            No records for this program.
          </div>
          <template v-else>
            <div :class="[ui.TABLE_WRAP, 'hidden max-h-[60vh] sm:block', { 'opacity-60': drill.loading }]">
              <table :class="ui.TABLE">
                <thead :class="ui.THEAD">
                  <tr>
                    <th v-for="col in drill.columns" :key="col.fieldname" :class="ui.TH">
                      {{ col.fieldname === 'name' ? 'ID' : col.label }}
                    </th>
                  </tr>
                </thead>
                <tbody :class="ui.TBODY">
                  <tr
                    v-for="row in drill.records"
                    :key="row.name"
                    tabindex="0"
                    :class="ui.TR"
                    @click="openRecord(row)"
                    @keydown.enter="openRecord(row)"
                  >
                    <td
                      v-for="col in drill.columns"
                      :key="col.fieldname"
                      :class="col.fieldname === 'name' ? ui.TD_STRONG : ui.TD"
                    >
                      <span v-if="isEmptyValue(row[col.fieldname])" class="text-gray-300 dark:text-gray-600">—</span>
                      <template v-else>{{ formatFieldValue(row[col.fieldname], col) }}</template>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div class="max-h-[60vh] space-y-2 overflow-y-auto sm:hidden" :class="{ 'opacity-60': drill.loading }">
              <button
                v-for="(row, index) in drill.records"
                :key="row.name"
                type="button"
                :class="ui.mobileRowClass(index)"
                @click="openRecord(row)"
              >
                <span class="flex items-center justify-between gap-2">
                  <span class="truncate font-semibold text-navy-900 dark:text-gray-100">{{ row.name }}</span>
                  <LucideIcon name="chevron-right" class="h-4 w-4 flex-shrink-0 text-gray-400" />
                </span>
                <dl class="mt-2 grid grid-cols-2 gap-x-3 gap-y-1.5">
                  <div v-for="col in mobileColumns" :key="col.fieldname" class="min-w-0">
                    <dt class="truncate text-[11px] font-medium uppercase tracking-wide text-gray-500">{{ col.label }}</dt>
                    <dd class="truncate text-sm text-gray-800 dark:text-gray-200">
                      <span v-if="isEmptyValue(row[col.fieldname])" class="text-gray-300 dark:text-gray-600">—</span>
                      <template v-else>{{ formatFieldValue(row[col.fieldname], col) }}</template>
                    </dd>
                  </div>
                </dl>
              </button>
            </div>
          </template>

          <div class="flex flex-wrap items-center justify-between gap-3">
            <span class="text-sm text-gray-500 dark:text-gray-400">
              <template v-if="drill.total">
                {{ formatNumber(drill.start + 1) }}–{{ formatNumber(drill.start + drill.records.length) }}
                of {{ formatNumber(drill.total) }}
              </template>
            </span>
            <div class="flex items-center gap-2">
              <a v-if="drill.total" :href="excelUrl" target="_blank" rel="noopener" :class="ui.BTN_SECONDARY">
                <LucideIcon name="download" class="h-4 w-4 text-forest-700 dark:text-forest-300" />
                Excel
              </a>
              <button
                type="button"
                :class="ui.BTN_SECONDARY"
                :disabled="drill.loading || drill.start === 0"
                aria-label="Previous page"
                @click="changePage(-1)"
              >
                <LucideIcon name="chevron-left" class="h-4 w-4" />
              </button>
              <button
                type="button"
                :class="ui.BTN_SECONDARY"
                :disabled="drill.loading || drill.start + drill.records.length >= drill.total"
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
  </div>
</template>

<script setup>
import { computed, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Dialog, ErrorMessage, FormControl, call } from 'frappe-ui'
import Skeleton from '@/components/Skeleton.vue'
import LucideIcon from '@/components/LucideIcon.vue'
import NewIndicators from '@/components/NewIndicators.vue'
import { villagesResource, healthWorkersResource, ALL_VILLAGES, ALL_HEALTH_WORKERS } from '@/data/dashboardFilters'
import { isEmptyValue, formatFieldValue } from '@/data/recordFormat'
import * as ui from '@/data/ui'

// Coordinator program overview - the Vue equivalent of the Desk
// chw-dashboard page, using the same backend calls. Parents must only render
// this for privileged users: every chw_dashboard_* call throws otherwise.

const route = useRoute()
const router = useRouter()

const DATE_RANGES = [
  { label: 'All time', value: 'all' },
  { label: 'Today', value: 'today' },
  { label: 'This week', value: 'week' },
  { label: 'This month', value: 'month' },
]

// Same fixed page size as the Desk popup, so its Excel export (which takes
// start/page_length) matches what's on screen.
const PAGE_SIZE = 100

const filters = reactive({
  date_range: 'all',
  village: ALL_VILLAGES,
  health_worker: ALL_HEALTH_WORKERS,
})

if (!villagesResource.data) villagesResource.fetch()
if (!healthWorkersResource.data) healthWorkersResource.fetch()

const villageOptions = computed(() => [
  { label: ALL_VILLAGES, value: ALL_VILLAGES },
  ...(villagesResource.data || []).map((v) => ({ label: v, value: v })),
])
const healthWorkerOptions = computed(() => [
  { label: ALL_HEALTH_WORKERS, value: ALL_HEALTH_WORKERS },
  ...(healthWorkersResource.data || []).map((v) => ({ label: v, value: v })),
])

function errorText(e, fallback) {
  return e?.messages?.join(', ') || e?.message || fallback
}

// ---- Cards ----
// call() with explicit args rather than useCall().fetch(args): fetch is
// useCall's execute(), which ignores any args passed to it, so filters
// would silently never reach the server. A request counter drops responses
// that arrive after a newer filter change already fired its own request.
const cards = ref([])
const cardsLoading = ref(false)
const cardsError = ref(null)
const updatedAt = ref('')
let cardsRequestId = 0

async function loadCards() {
  const requestId = ++cardsRequestId
  cardsLoading.value = true
  cardsError.value = null
  try {
    const data = await call('chw.api.get_chw_dashboard_cards', { ...filters })
    if (requestId !== cardsRequestId) return
    cards.value = data || []
    updatedAt.value = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  } catch (e) {
    if (requestId !== cardsRequestId) return
    cardsError.value = errorText(e, 'Could not load the dashboard.')
  } finally {
    if (requestId === cardsRequestId) cardsLoading.value = false
  }
}

watch(() => [filters.date_range, filters.village, filters.health_worker], loadCards, { immediate: true })

// Refresh reloads both sections; New Indicators watches this to reload.
const refreshKey = ref(0)
function refresh() {
  loadCards()
  refreshKey.value++
}

const numberFormat = new Intl.NumberFormat()
function formatNumber(value) {
  return numberFormat.format(value || 0)
}

// ---- Drilldown ----
// No filters inside the popup - it lists the selected program's records
// as-is (filters '{}' = none, which chw_dashboard_drilldown accepts).
const showDrilldown = ref(false)
const activeCard = ref(null)
const drill = reactive({ columns: [], records: [], total: 0, start: 0, loading: false, error: null })
let drillRequestId = 0

async function fetchDrillRecords() {
  const requestId = ++drillRequestId
  drill.loading = true
  drill.error = null
  try {
    const data = await call('chw.api.chw_dashboard_drilldown', {
      card_key: activeCard.value.key,
      filters: '{}',
      page_length: PAGE_SIZE,
      start: drill.start,
    })
    if (requestId !== drillRequestId) return
    drill.records = data?.records || []
    drill.total = data?.total_count || 0
  } catch (e) {
    if (requestId !== drillRequestId) return
    drill.error = errorText(e, 'Could not load records.')
  } finally {
    if (requestId === drillRequestId) drill.loading = false
  }
}

// The open popup lives in the URL (?card=pregnancy&start=100), so coming
// Back from a record's detail page - or refreshing, or sharing the link -
// reopens the same program on the same page instead of a closed Overview.
function syncDrilldownQuery(card, start) {
  const query = { ...route.query }
  delete query.card
  delete query.start
  if (card) {
    query.card = card.key
    if (start) query.start = String(start)
  }
  router.replace({ query })
}

async function openDrilldown(card, start = 0) {
  // Bumping the counter up front also invalidates any in-flight fetch from
  // a previously opened card, so its rows can't land in this one's table.
  const requestId = ++drillRequestId
  activeCard.value = card
  Object.assign(drill, { columns: [], records: [], total: 0, start, loading: true, error: null })
  showDrilldown.value = true
  syncDrilldownQuery(card, start)

  try {
    const meta = await call('chw.api.chw_dashboard_doctype_fields', { card_key: card.key })
    if (requestId !== drillRequestId) return
    drill.columns = meta?.list_view_fields || []
  } catch (e) {
    if (requestId !== drillRequestId) return
    drill.loading = false
    drill.error = errorText(e, 'Could not load this program.')
    return
  }
  fetchDrillRecords()
}

// Closing invalidates whatever is still in flight, and drops the popup
// from the URL so a refresh doesn't reopen it.
watch(showDrilldown, (open) => {
  if (open) return
  drillRequestId++
  if (route.query.card) syncDrilldownQuery(null)
})

// Reopen the popup named in the URL once the cards it refers to are in -
// only the first time, so later filter changes don't pop it open again.
let restoredFromUrl = false
watch(cards, (list) => {
  if (restoredFromUrl || !list.length) return
  restoredFromUrl = true
  const card = list.find((c) => c.key === route.query.card)
  const start = Math.max(0, Number(route.query.start) || 0)
  if (card) openDrilldown(card, start - (start % PAGE_SIZE))
})

function changePage(direction) {
  drill.start = Math.max(0, drill.start + direction * PAGE_SIZE)
  syncDrilldownQuery(activeCard.value, drill.start)
  fetchDrillRecords()
}

// Matches the page on screen - same program and page.
const excelUrl = computed(() => {
  if (!activeCard.value) return '#'
  const params = new URLSearchParams({
    card_key: activeCard.value.key,
    filters: '{}',
    page_length: PAGE_SIZE,
    start: drill.start,
  })
  return `/api/method/chw.api.chw_dashboard_drilldown_excel?${params.toString()}`
})

// Opens the read-only detail page rather than the edit form. The popup is
// deliberately left open: this page unmounts with it, and the URL still
// names the card and page, so Back lands right back in it.
function openRecord(row) {
  router.push({ name: 'RecordView', params: { doctype: activeCard.value.doctype, name: row.name } })
}

// A phone card shows the record ID as its title plus the next few columns
// - all of them would make each card as long as a page.
const mobileColumns = computed(() => drill.columns.filter((c) => c.fieldname !== 'name').slice(0, 4))
</script>

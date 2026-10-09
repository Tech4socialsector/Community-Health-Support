<template>
  <!-- "New Indicators" - the Desk chw-dashboard section of the same name: a
  donut + legend per indicator, every segment / label / count from
  chw.api.get_new_indicators_summary. A slice or legend row opens the
  people in it; "View all" opens the whole card. -->
  <section>
    <div class="mb-1 flex items-center gap-3">
      <h2 :class="ui.SECTION_LABEL">New Indicators</h2>
      <span class="h-px flex-1 bg-gray-200 dark:bg-gray-800" />
    </div>
    <p class="mb-3 text-[13px] text-gray-500 dark:text-gray-400">
      Worked out from the recorded followups using each programme's own criteria. Select a slice or a legend row to see the people in it.
    </p>

    <ErrorMessage v-if="error" :message="error" />

    <div v-else class="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <template v-if="loading && !indicators.length">
        <div v-for="i in 4" :key="i" :class="[ui.CARD, 'space-y-3 p-4 sm:p-5']">
          <Skeleton width="55%" height="1rem" />
          <Skeleton width="80%" height="0.75rem" />
          <div class="flex items-center gap-5">
            <Skeleton width="8rem" height="8rem" />
            <div class="flex-1 space-y-2">
              <Skeleton v-for="j in 3" :key="j" height="1.25rem" />
            </div>
          </div>
        </div>
      </template>

      <div
        v-for="(item, index) in indicators"
        v-else
        :key="item.key"
        :class="[ui.statCardTone(index % 2 ? 'green' : 'navy'), '!cursor-default !justify-start !gap-0 !p-4 hover:!translate-y-0 hover:!shadow-sm sm:!p-5', { 'opacity-60': loading }]"
      >
        <div class="flex w-full items-start justify-between gap-3">
          <div class="min-w-0">
            <h3 class="text-[15px] font-semibold text-navy-900 dark:text-gray-100">{{ item.label }}</h3>
            <p class="mt-0.5 text-xs text-gray-500 dark:text-gray-400">{{ item.subtitle }}</p>
          </div>
          <button
            type="button"
            class="flex flex-shrink-0 items-center gap-1 rounded-md px-1.5 py-1 text-xs font-semibold text-forest-700 hover:bg-forest-50 disabled:opacity-40 dark:text-forest-300 dark:hover:bg-forest-900/30"
            :disabled="!item.total"
            @click="openDrilldown(item, null)"
          >
            View all
            <LucideIcon name="arrow-right" class="h-3.5 w-3.5" />
          </button>
        </div>

        <div class="mt-4 flex w-full flex-col items-center gap-4 min-[420px]:flex-row min-[420px]:items-center">
          <!-- Donut: one arc per segment, a 2px gap between arcs so
          neighbouring colours never run together; the centre is the
          number of people the indicator counts. -->
          <svg width="132" height="132" viewBox="0 0 132 132" class="flex-shrink-0" role="img" :aria-label="`${item.label}: ${item.total} people`">
            <circle cx="66" cy="66" :r="RADIUS" fill="none" stroke-width="18" class="stroke-gray-100 dark:stroke-gray-800" />
            <circle
              v-for="arc in arcs(item)"
              :key="arc.key"
              cx="66"
              cy="66"
              :r="RADIUS"
              fill="none"
              :stroke="arc.color"
              :stroke-width="hovered === `${item.key}:${arc.key}` ? 22 : 18"
              :stroke-dasharray="`${arc.length} ${CIRCUMFERENCE - arc.length}`"
              :stroke-dashoffset="arc.offset"
              transform="rotate(-90 66 66)"
              class="cursor-pointer transition-[stroke-width] focus:outline-none"
              tabindex="0"
              role="button"
              :aria-label="`${arc.label}: ${arc.count}`"
              @mouseenter="hovered = `${item.key}:${arc.key}`"
              @mouseleave="hovered = null"
              @click="openDrilldown(item, arc)"
              @keydown.enter.prevent="openDrilldown(item, arc)"
              @keydown.space.prevent="openDrilldown(item, arc)"
            >
              <title>{{ arc.label }}: {{ arc.count }} ({{ percent(arc.count, item.total) }}%)</title>
            </circle>
            <text x="66" y="64" text-anchor="middle" class="fill-navy-900 text-[22px] font-bold dark:fill-gray-100">{{ formatNumber(item.total) }}</text>
            <text x="66" y="81" text-anchor="middle" class="fill-gray-500 text-[10px]">people</text>
          </svg>

          <!-- Legend: colour, label, count, share - each row opens its people. -->
          <div class="w-full min-w-0 flex-1 space-y-0.5">
            <button
              v-for="seg in item.segments"
              :key="seg.key"
              type="button"
              class="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px] transition hover:bg-gray-50 dark:hover:bg-gray-800"
              :class="{ 'bg-gray-50 dark:bg-gray-800': hovered === `${item.key}:${seg.key}` }"
              @mouseenter="hovered = `${item.key}:${seg.key}`"
              @mouseleave="hovered = null"
              @click="openDrilldown(item, seg)"
            >
              <span class="h-2.5 w-2.5 flex-shrink-0 rounded-sm" :style="{ background: colorFor(seg.color) }" />
              <span class="min-w-0 flex-1 text-gray-800 dark:text-gray-200">{{ seg.label }}</span>
              <span class="w-8 text-right font-semibold text-gray-900 dark:text-gray-100">{{ formatNumber(seg.count) }}</span>
              <span class="w-9 text-right text-xs text-gray-500 dark:text-gray-400">{{ percent(seg.count, item.total) }}%</span>
            </button>
            <!-- People without this reading yet: counted, but no list to open. -->
            <div v-if="item.no_data" class="flex items-center gap-2 px-2 py-1.5 text-[13px]">
              <span class="h-2.5 w-2.5 flex-shrink-0 rounded-sm bg-gray-200 dark:bg-gray-700" />
              <span class="min-w-0 flex-1 text-gray-500 dark:text-gray-400">{{ item.no_data.label }}</span>
              <span class="w-8 text-right font-semibold text-gray-700 dark:text-gray-300">{{ formatNumber(item.no_data.count) }}</span>
              <span class="w-9" />
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Drilldown: the people in one slice (or the whole card). Columns come
    from the backend, per doctype. Table from sm up, cards on a phone. -->
    <Dialog v-model="showDrilldown" :options="{ size: '6xl' }">
      <template #body-title>
        <div v-if="active" class="flex min-w-0 items-center gap-3">
          <span v-if="active.segment" class="h-3 w-3 flex-shrink-0 rounded-sm" :style="{ background: colorFor(active.segment.color) }" />
          <h3 class="min-w-0 truncate text-base font-semibold text-navy-900 dark:text-gray-100 sm:text-lg">{{ activeTitle }}</h3>
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
            No records for this selection.
          </div>
          <template v-else>
            <div :class="[ui.TABLE_WRAP, 'hidden max-h-[60vh] sm:block', { 'opacity-60': drill.loading }]">
              <table :class="ui.TABLE">
                <thead :class="ui.THEAD">
                  <tr>
                    <th :class="ui.TH">ID</th>
                    <th v-for="col in drill.columns" :key="col.fieldname" :class="ui.TH">{{ col.label }}</th>
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
                    <td :class="ui.TD_STRONG">{{ row.name }}</td>
                    <td v-for="col in drill.columns" :key="col.fieldname" :class="ui.TD">
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
                  <div v-for="col in drill.columns" :key="col.fieldname" class="min-w-0">
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
              <button type="button" :class="ui.BTN_SECONDARY" :disabled="drill.loading || drill.start === 0" aria-label="Previous page" @click="changePage(-1)">
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
  </section>
</template>

<script setup>
import { computed, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Dialog, ErrorMessage, call } from 'frappe-ui'
import Skeleton from '@/components/Skeleton.vue'
import LucideIcon from '@/components/LucideIcon.vue'
import { isEmptyValue, formatFieldValue } from '@/data/recordFormat'
import * as ui from '@/data/ui'

// Like the Desk section, these only take Village / Health Worker - none of
// the 5 indicators is bounded by the page's date range.
const props = defineProps({
  village: { type: String, required: true },
  healthWorker: { type: String, required: true },
  // Bumped by the page's Refresh button.
  refreshKey: { type: Number, default: 0 },
})

const route = useRoute()
const router = useRouter()

// Same page size as the Desk popup, so the Excel export (start /
// page_length) matches what's on screen.
const PAGE_SIZE = 100
const RADIUS = 52
const CIRCUMFERENCE = 2 * Math.PI * RADIUS

// The app keeps red out of its palette (it reads as an error, not a
// category) - the backend's red "Not up to date" slice shows as slate.
const COLOR_OVERRIDES = { '#B91C1C': '#64748B' }
const colorFor = (color) => COLOR_OVERRIDES[(color || '').toUpperCase()] || color || '#9CA3AF'

const numberFormat = new Intl.NumberFormat()
const formatNumber = (value) => numberFormat.format(value || 0)
const percent = (count, total) => (total ? Math.round((count / total) * 100) : 0)

function errorText(e, fallback) {
  return e?.messages?.join(', ') || e?.message || fallback
}

// ---- Summary ----
// call() with a request counter, as in ProgramOverview: a slow response
// from an older filter choice can't overwrite a newer one.
const indicators = ref([])
const loading = ref(false)
const error = ref(null)
const hovered = ref(null) // "indicatorKey:segmentKey" - links slice and legend row
let summaryRequestId = 0

async function loadSummary() {
  const requestId = ++summaryRequestId
  loading.value = true
  error.value = null
  try {
    const data = await call('chw.api.get_new_indicators_summary', {
      village: props.village,
      health_worker: props.healthWorker,
    })
    if (requestId !== summaryRequestId) return
    indicators.value = Object.entries(data || {}).map(([key, value]) => ({ key, ...value }))
  } catch (e) {
    if (requestId !== summaryRequestId) return
    error.value = errorText(e, 'Could not load the new indicators.')
  } finally {
    if (requestId === summaryRequestId) loading.value = false
  }
}

watch(() => [props.village, props.healthWorker, props.refreshKey], loadSummary, { immediate: true })

// Arc length per segment, laid end to end round the ring. A 2px gap is cut
// from each arc (only when there's more than one) so slices stay distinct.
function arcs(item) {
  const total = item.total || 0
  if (!total) return []
  const visible = item.segments.filter((s) => s.count > 0)
  const gap = visible.length > 1 ? 2 : 0
  let cumulative = 0
  return visible.map((seg) => {
    const full = (seg.count / total) * CIRCUMFERENCE
    const arc = { ...seg, color: colorFor(seg.color), length: Math.max(full - gap, 0.5), offset: -cumulative }
    cumulative += full
    return arc
  })
}

// ---- Drilldown ----
const showDrilldown = ref(false)
const active = ref(null) // { indicator, segment|null }
const drill = reactive({ columns: [], records: [], total: 0, start: 0, doctype: null, loading: false, error: null })
let drillRequestId = 0

const activeTitle = computed(() => {
  if (!active.value) return ''
  const { indicator, segment } = active.value
  return segment ? `${indicator.label}: ${segment.label}` : indicator.label
})

// The backend sends labels only; dates are recognisable by name, so they
// get the app's date format instead of raw "2026-05-01".
function withFieldtype(col) {
  return /(^|_)date$/.test(col.fieldname) ? { ...col, fieldtype: 'Date' } : col
}

async function fetchDrillRecords() {
  const requestId = ++drillRequestId
  drill.loading = true
  drill.error = null
  try {
    const data = await call('chw.api.new_indicator_drilldown', {
      indicator_key: active.value.indicator.key,
      segment_key: active.value.segment?.key || undefined,
      village: props.village,
      health_worker: props.healthWorker,
      page_length: PAGE_SIZE,
      start: drill.start,
    })
    if (requestId !== drillRequestId) return
    drill.records = data?.records || []
    drill.total = data?.total_count || 0
    drill.columns = (data?.fields || []).map(withFieldtype)
    drill.doctype = data?.doctype || null
  } catch (e) {
    if (requestId !== drillRequestId) return
    drill.error = errorText(e, 'Could not load records.')
  } finally {
    if (requestId === drillRequestId) drill.loading = false
  }
}

// The open popup lives in the URL (?indicator=anc_4plus&segment=short), so
// Back from a person's detail page reopens it - same as the program cards.
// Its own keys, so the two popups never clear each other's.
function syncQuery(indicator, segment, start) {
  const query = { ...route.query }
  delete query.indicator
  delete query.segment
  delete query.istart
  if (indicator) {
    query.indicator = indicator.key
    if (segment) query.segment = segment.key
    if (start) query.istart = String(start)
  }
  router.replace({ query })
}

function openDrilldown(indicator, segment, start = 0) {
  active.value = { indicator, segment: segment || null }
  Object.assign(drill, { columns: [], records: [], total: 0, start, doctype: null, loading: true, error: null })
  showDrilldown.value = true
  syncQuery(indicator, segment, start)
  fetchDrillRecords()
}

watch(showDrilldown, (open) => {
  if (open) return
  drillRequestId++
  if (route.query.indicator) syncQuery(null)
})

// Reopen the popup named in the URL once the indicators are in - first
// load only, so later filter changes don't pop it open again.
let restoredFromUrl = false
watch(indicators, (list) => {
  if (restoredFromUrl || !list.length) return
  restoredFromUrl = true
  const indicator = list.find((i) => i.key === route.query.indicator)
  if (!indicator) return
  const segment = indicator.segments.find((s) => s.key === route.query.segment) || null
  const start = Math.max(0, Number(route.query.istart) || 0)
  openDrilldown(indicator, segment, start - (start % PAGE_SIZE))
})

function changePage(direction) {
  drill.start = Math.max(0, drill.start + direction * PAGE_SIZE)
  syncQuery(active.value.indicator, active.value.segment, drill.start)
  fetchDrillRecords()
}

const excelUrl = computed(() => {
  if (!active.value) return '#'
  const params = new URLSearchParams({
    indicator_key: active.value.indicator.key,
    segment_key: active.value.segment?.key || '',
    village: props.village,
    health_worker: props.healthWorker,
    page_length: PAGE_SIZE,
    start: drill.start,
  })
  return `/api/method/chw.api.new_indicator_drilldown_excel?${params.toString()}`
})

// Read-only detail page, like the program cards' rows. The popup stays in
// the URL, so Back lands right back in it.
function openRecord(row) {
  if (!drill.doctype) return
  router.push({ name: 'RecordView', params: { doctype: drill.doctype, name: row.name } })
}
</script>

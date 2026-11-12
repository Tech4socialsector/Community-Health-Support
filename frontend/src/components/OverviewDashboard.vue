<template>
  <!-- The Overview: households & families, then one section per programme
  switched on in App Setting (chw.overview.get_overview). Every number, bar,
  donut slice and legend row opens the people behind it
  (chw.overview.get_overview_records) - the count and the list come from
  the same rule on the server, so they always agree. -->
  <div class="space-y-6">
    <!-- Filters -->
    <div :class="[ui.CARD, 'flex flex-wrap items-end gap-3 p-3 sm:p-4']">
      <div>
        <span :class="ui.FILTER_LABEL">{{ t('Date range') }}</span>
        <div class="inline-flex flex-wrap gap-0.5 rounded-lg bg-gray-100 p-0.5 dark:bg-gray-800" role="group" :aria-label="t('Date range')">
          <button
            v-for="opt in DATE_RANGES"
            :key="opt.value"
            type="button"
            :aria-pressed="filters.date_range === opt.value"
            class="h-8 rounded-md px-3 text-sm transition"
            :class="filters.date_range === opt.value ? 'bg-navy-900 text-white dark:bg-gray-100 dark:text-gray-900' : 'text-gray-600 hover:bg-white dark:text-gray-300 dark:hover:bg-gray-700'"
            @click="filters.date_range = opt.value"
          >
            {{ t(opt.label) }}
          </button>
        </div>
      </div>
      <div :class="ui.FILTER_FIELD">
        <span :class="ui.FILTER_LABEL">{{ t('Village') }}</span>
        <FormControl type="select" class="[&_[data-slot=trigger]]:w-full" :options="villageOptions" v-model="filters.village" />
      </div>
      <div :class="ui.FILTER_FIELD">
        <span :class="ui.FILTER_LABEL">{{ t('Health Worker') }}</span>
        <FormControl type="select" class="[&_[data-slot=trigger]]:w-full" :options="healthWorkerOptions" v-model="filters.health_worker" />
      </div>
      <div class="flex w-full items-center justify-between gap-3 sm:ml-auto sm:w-auto sm:justify-end">
        <span v-if="updatedAt" class="text-xs text-gray-500 dark:text-gray-400">{{ t('Updated {0}', [updatedAt]) }}</span>
        <button type="button" :disabled="loading" :class="ui.BTN_PRIMARY" @click="load">
          <LucideIcon name="refresh-cw" class="h-4 w-4" :class="{ 'animate-spin': loading }" />
          {{ t('Refresh') }}
        </button>
      </div>
    </div>

    <ErrorMessage v-if="error" :message="error" />

    <div v-else-if="loading && !sections.length" class="space-y-3">
      <Skeleton height="6rem" />
      <Skeleton height="14rem" />
    </div>

    <template v-else>
      <!-- Jump to a section -->
      <nav v-if="sections.length > 1" class="flex flex-wrap items-center gap-2" :aria-label="t('Jump to')">
        <span class="text-xs text-gray-500 dark:text-gray-400">{{ t('Jump to') }}:</span>
        <button
          v-for="sec in sections"
          :key="sec.key"
          type="button"
          class="inline-flex h-8 items-center gap-1.5 rounded-full bg-white px-3 text-sm font-medium text-gray-800 ring-1 ring-gray-200 hover:ring-forest-300 dark:bg-gray-900 dark:text-gray-200 dark:ring-gray-700"
          @click="jumpTo(sec.key)"
        >
          <span class="h-2 w-2 rounded-full" :style="{ background: sectionColor(sec) }" aria-hidden="true" />
          {{ sec.title }}
        </button>
      </nav>

      <section v-for="sec in sections" :id="`overview-${sec.key}`" :key="sec.key" class="scroll-mt-4 space-y-3">
        <div class="flex flex-wrap items-center gap-2.5 border-b-2 pb-2" :style="{ borderColor: sectionColor(sec) }">
          <span class="h-3 w-3 rounded" :style="{ background: sectionColor(sec) }" aria-hidden="true" />
          <h2 class="text-base font-semibold text-navy-900 dark:text-gray-100 sm:text-lg">{{ sec.title }}</h2>
          <span v-if="sec.subtitle" class="text-sm text-gray-500 dark:text-gray-400">{{ sec.subtitle }}</span>
        </div>

        <!-- Key numbers -->
        <div class="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          <button
            v-for="k in sec.kpis"
            :key="k.metric"
            type="button"
            class="flex flex-col gap-1 rounded-xl bg-white p-4 text-left ring-1 ring-gray-200 transition hover:ring-2 hover:ring-forest-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-forest-400 dark:bg-gray-900 dark:ring-gray-800"
            @click="openList(sec, { metric: k.metric, title: k.label })"
          >
            <span class="text-sm text-gray-600 dark:text-gray-300">{{ k.label }}</span>
            <span class="text-2xl font-semibold tabular-nums text-navy-900 dark:text-gray-100 sm:text-3xl">{{ k.value }}</span>
            <span class="text-xs text-gray-500 dark:text-gray-400">{{ k.note }}</span>
          </button>
        </div>

        <!-- Journey -->
        <div v-if="sec.journey" :class="[ui.CARD, 'p-4 sm:p-5']">
          <h3 class="mb-2 text-sm font-semibold text-navy-900 dark:text-gray-100">{{ sec.journey.title }}</h3>
          <button
            v-for="step in sec.journey.steps"
            :key="step.metric"
            type="button"
            class="grid w-full grid-cols-[minmax(7rem,11rem)_minmax(0,1fr)_3rem] items-center gap-3 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-gray-50 dark:hover:bg-gray-800"
            @click="openList(sec, { metric: step.metric, title: step.label })"
          >
            <span class="font-medium text-gray-700 dark:text-gray-300">{{ step.label }}</span>
            <span class="block h-5 overflow-hidden rounded bg-gray-100 dark:bg-gray-800">
              <span class="block h-5 rounded" :style="{ width: barWidth(step.value, journeyMax(sec.journey)), background: sectionColor(sec) }" />
            </span>
            <span class="text-right font-semibold tabular-nums text-navy-900 dark:text-gray-100">{{ step.value }}</span>
          </button>
        </div>

        <!-- Donuts -->
        <div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <article v-for="d in sec.donuts" :key="d.metric" :class="[ui.CARD, 'flex flex-col gap-3 p-4 sm:p-5']">
            <div>
              <h3 class="text-sm font-semibold text-navy-900 dark:text-gray-100">{{ d.title }}</h3>
              <p class="text-xs text-gray-500 dark:text-gray-400">{{ d.note }}</p>
            </div>
            <div class="flex flex-wrap items-center gap-4">
              <svg viewBox="0 0 140 140" class="h-32 w-32 flex-shrink-0 overflow-visible" role="img" :aria-label="donutAria(d)">
                <circle cx="70" cy="70" r="54" fill="none" class="stroke-gray-100 dark:stroke-gray-800" stroke-width="18" />
                <circle
                  v-for="s in donutSlices(d)"
                  :key="s.key"
                  cx="70"
                  cy="70"
                  r="54"
                  fill="none"
                  :stroke="s.color"
                  stroke-width="18"
                  :stroke-dasharray="s.dash"
                  :stroke-dashoffset="s.offset"
                  transform="rotate(-90 70 70)"
                  class="cursor-pointer transition-[stroke-width] hover:[stroke-width:22]"
                  @click="openList(sec, { metric: d.metric, segment: s.key, title: s.label, from: d.title })"
                >
                  <title>{{ s.label }}: {{ s.value }}</title>
                </circle>
                <circle cx="70" cy="70" r="40" class="cursor-pointer fill-white dark:fill-gray-900" @click="openList(sec, { metric: d.metric, title: d.title })">
                  <title>{{ t('See all {0}', [d.total]) }}</title>
                </circle>
                <text x="70" y="68" text-anchor="middle" class="pointer-events-none fill-navy-900 text-[22px] font-semibold dark:fill-gray-100">{{ d.total }}</text>
                <text x="70" y="85" text-anchor="middle" class="pointer-events-none fill-gray-500 text-[11px]">{{ d.unit }}</text>
              </svg>
              <div class="flex min-w-0 flex-1 basis-44 flex-col">
                <p v-if="!d.total" class="px-2 text-sm text-gray-500 dark:text-gray-400">{{ t('No records yet.') }}</p>
                <button
                  v-for="s in d.segments.filter((x) => x.value)"
                  :key="s.key"
                  type="button"
                  class="flex min-h-[2rem] items-center justify-between gap-2 rounded-md px-2 py-1 text-left text-sm hover:bg-gray-50 disabled:cursor-default disabled:hover:bg-transparent dark:hover:bg-gray-800"
                  :disabled="!s.value"
                  @click="openList(sec, { metric: d.metric, segment: s.key, title: s.label, from: d.title })"
                >
                  <span class="flex min-w-0 items-center gap-2 text-gray-700 dark:text-gray-300">
                    <span class="h-2.5 w-2.5 flex-shrink-0 rounded-sm" :style="{ background: colorFor(s.tone) }" aria-hidden="true" />
                    <span class="break-words">{{ s.label }}</span>
                  </span>
                  <span class="whitespace-nowrap">
                    <strong class="tabular-nums text-navy-900 dark:text-gray-100">{{ s.value }}</strong>
                    <span class="ml-1 text-xs text-gray-500">{{ percent(s.value, d.total) }}</span>
                  </span>
                </button>
              </div>
            </div>
            <button
              type="button"
              class="self-start text-sm font-semibold text-forest-700 hover:underline disabled:cursor-default disabled:text-gray-400 disabled:no-underline dark:text-forest-300"
              :disabled="!d.total"
              @click="openList(sec, { metric: d.metric, title: d.title })"
            >
              {{ t('See all {0}', [d.total]) }} →
            </button>
          </article>
        </div>
      </section>

      <p v-if="programmes.length === 0" :class="ui.EMPTY_STATE">
        {{ t('No programme is switched on in App Setting, so only households and family members are shown.') }}
      </p>
    </template>

    <!-- The people behind a number -->
    <Dialog v-model="listOpen" :options="{ size: '4xl' }">
      <template #body-title>
        <div class="flex flex-col gap-0.5">
          <span class="text-xs font-semibold" :style="{ color: list.color }">{{ list.group }}</span>
          <h3 class="text-lg font-semibold text-navy-900 dark:text-gray-100">{{ list.title }}</h3>
          <span class="text-sm font-normal text-gray-500 dark:text-gray-400">{{ t('{0} records', [list.total]) }} · {{ filterText }}</span>
        </div>
      </template>
      <template #body-content>
        <ErrorMessage v-if="list.error" :message="list.error" />
        <div v-else-if="list.loading && !list.rows.length" class="space-y-2">
          <Skeleton v-for="i in 5" :key="i" height="2.5rem" />
        </div>
        <p v-else-if="!list.rows.length" class="py-8 text-center text-sm text-gray-500">{{ t('No records.') }}</p>
        <div v-else class="-mx-1 overflow-x-auto">
          <table class="w-full min-w-[36rem] text-left text-sm">
            <thead class="text-xs text-gray-500 dark:text-gray-400">
              <tr class="border-b dark:border-gray-800">
                <th class="px-2 py-2 font-medium">{{ t('Name') }}</th>
                <th class="px-2 py-2 font-medium">{{ t('Age · Gender') }}</th>
                <th class="px-2 py-2 font-medium">{{ t('Village') }}</th>
                <th class="px-2 py-2 font-medium">{{ t('Health Worker') }}</th>
                <th class="px-2 py-2 font-medium">{{ t('Status') }}</th>
                <th class="px-2 py-2" />
              </tr>
            </thead>
            <tbody class="divide-y divide-gray-100 dark:divide-gray-800">
              <tr v-for="r in list.rows" :key="r.name">
                <td class="px-2 py-2.5">
                  <div class="font-semibold text-navy-900 dark:text-gray-100">{{ r.title || r.name }}</div>
                  <div v-if="r.title" class="text-xs text-gray-500">{{ r.name }}</div>
                </td>
                <td class="px-2 py-2.5 text-gray-700 dark:text-gray-300">{{ [r.age, r.gender].filter(Boolean).join(' · ') || '–' }}</td>
                <td class="px-2 py-2.5 text-gray-700 dark:text-gray-300">{{ r.village || '–' }}</td>
                <td class="px-2 py-2.5 text-gray-700 dark:text-gray-300">{{ r.health_worker || '–' }}</td>
                <td class="px-2 py-2.5">
                  <span v-if="r.status" class="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-semibold text-gray-700 dark:bg-gray-800 dark:text-gray-300">{{ r.status }}</span>
                </td>
                <td class="px-2 py-1.5 text-right">
                  <button v-if="list.route" type="button" :class="[ui.BTN_SECONDARY, '!h-8']" @click="openRecord(r.name)">{{ t('Open') }}</button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </template>
      <template #actions>
        <div class="flex items-center justify-between gap-3">
          <span class="text-sm text-gray-500">{{ t('Showing {0} of {1}', [list.rows.length, list.total]) }}</span>
          <button v-if="list.rows.length < list.total" type="button" :class="ui.BTN_SECONDARY" :disabled="list.loading" @click="loadMore">
            {{ t('Show more') }}
          </button>
        </div>
      </template>
    </Dialog>
  </div>
</template>

<script setup>
import { computed, reactive, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { Dialog, ErrorMessage, FormControl, call } from 'frappe-ui'
import Skeleton from '@/components/Skeleton.vue'
import LucideIcon from '@/components/LucideIcon.vue'
import { villagesResource, healthWorkersResource, ALL_VILLAGES, ALL_HEALTH_WORKERS } from '@/data/dashboardFilters'
import { findModuleByDoctype } from '@/data/modules'
import { t } from '@/data/i18n'
import * as ui from '@/data/ui'

const router = useRouter()

const DATE_RANGES = [
  { value: 'all', label: 'All time' },
  { value: 'today', label: 'Today' },
  { value: 'week', label: 'This week' },
  { value: 'month', label: 'This month' },
]

// Meaning colours, the same on every chart; each programme has its own.
const TONES = {
  good: '#2f7a4b',
  bad: '#9f1f4f',
  mid: '#5b84b1',
  wait: '#e0a339',
  none: '#c3c9c6',
  grey: '#8a9490',
  oral: '#2563eb',
  breast: '#ea580c',
  cervical: '#6d28d9',
  mch: '#2b6cb0',
  palliative: '#7c3aed',
  mental_health: '#0f766e',
  ncd: '#b45309',
  cancer: '#9f1f4f',
}
const colorFor = (tone) => TONES[tone] || TONES.grey
const sectionColor = (sec) => (sec.programme ? colorFor(sec.programme) : '#3d4541')

// ---- Filters ----
const filters = reactive({ date_range: 'all', village: ALL_VILLAGES, health_worker: ALL_HEALTH_WORKERS })
if (!villagesResource.data) villagesResource.fetch()
if (!healthWorkersResource.data) healthWorkersResource.fetch()
const villageOptions = computed(() => [
  { label: t(ALL_VILLAGES), value: ALL_VILLAGES },
  ...(villagesResource.data || []).map((v) => ({ label: v, value: v })),
])
const healthWorkerOptions = computed(() => [
  { label: t(ALL_HEALTH_WORKERS), value: ALL_HEALTH_WORKERS },
  ...(healthWorkersResource.data || []).map((v) => ({ label: v, value: v })),
])
const filterText = computed(() =>
  [
    filters.village !== ALL_VILLAGES ? filters.village : null,
    filters.health_worker !== ALL_HEALTH_WORKERS ? filters.health_worker : null,
    t(DATE_RANGES.find((d) => d.value === filters.date_range)?.label || ''),
  ]
    .filter(Boolean)
    .join(' · '),
)

function errorText(e, fallback) {
  return e?.messages?.join(', ') || e?.message || fallback
}

// ---- The page ----
const sections = ref([])
const programmes = ref([])
const loading = ref(false)
const error = ref(null)
const updatedAt = ref('')
let requestId = 0

async function load() {
  const id = ++requestId
  loading.value = true
  error.value = null
  try {
    const data = await call('chw.overview.get_overview', { ...filters })
    if (id !== requestId) return
    sections.value = data?.sections || []
    programmes.value = data?.programmes || []
    updatedAt.value = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  } catch (e) {
    if (id !== requestId) return
    error.value = errorText(e, t('Could not load the Overview.'))
  } finally {
    if (id === requestId) loading.value = false
  }
}
watch(() => [filters.date_range, filters.village, filters.health_worker], load, { immediate: true })

function jumpTo(key) {
  document.getElementById(`overview-${key}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

function barWidth(value, top) {
  return `${top ? Math.max(Math.round((value / top) * 100), value ? 2 : 0) : 0}%`
}
function journeyMax(journey) {
  return Math.max(...journey.steps.map((s) => s.value), 0)
}
function percent(value, total) {
  return total ? `${Math.round((value / total) * 100)}%` : ''
}

// Donut slices as dashes on one circle, a 2px gap between them.
const CIRCUMFERENCE = 2 * Math.PI * 54
function donutSlices(d) {
  let at = 0
  return d.segments
    .filter((s) => s.value > 0)
    .map((s) => {
      const len = (s.value / d.total) * CIRCUMFERENCE
      const slice = { ...s, color: colorFor(s.tone), dash: `${Math.max(len - 2, 0.1)} ${CIRCUMFERENCE}`, offset: -at }
      at += len
      return slice
    })
}
function donutAria(d) {
  return `${d.title}: ${d.segments.map((s) => `${s.label} ${s.value}`).join(', ')}`
}

// ---- The people behind a number ----
const PAGE = 50
const listOpen = ref(false)
const list = reactive({ group: '', title: '', color: '', metric: '', segment: null, rows: [], total: 0, loading: false, error: null, route: null })

function openList(sec, { metric, segment = null, title, from = '' }) {
  Object.assign(list, {
    group: from ? `${sec.title} · ${from}` : sec.title,
    title,
    color: sectionColor(sec),
    metric,
    segment,
    rows: [],
    total: 0,
    error: null,
    route: null,
  })
  listOpen.value = true
  fetchRows(0)
}

let listRequest = 0
async function fetchRows(start) {
  const id = ++listRequest
  list.loading = true
  try {
    const args = { metric: list.metric, ...filters, start, page_length: PAGE }
    if (list.segment !== null) args.segment = list.segment
    const data = await call('chw.overview.get_overview_records', args)
    if (id !== listRequest) return
    list.rows = start ? list.rows.concat(data.records || []) : data.records || []
    list.total = data.total || 0
    list.route = findModuleByDoctype(data.doctype)?.route || null
  } catch (e) {
    if (id !== listRequest) return
    list.error = errorText(e, t('Could not load the records.'))
  } finally {
    if (id === listRequest) list.loading = false
  }
}
function loadMore() {
  fetchRows(list.rows.length)
}
function openRecord(name) {
  listOpen.value = false
  router.push({ name: 'DoctypeForm', params: { doctypeRoute: list.route, name } })
}
</script>

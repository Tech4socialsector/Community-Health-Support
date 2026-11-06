<template>
  <!-- The clinic's landing page for Clinical Evaluation: everyone referred
  (a screening finished with Referral = Yes) is listed on their own - no
  ID to type - with Start evaluation / Continue / View. The cards and the
  filters narrow the list; the filters live in the URL, so Back from a
  form returns to the same view. Data: chw.cancer.worklist. -->
  <AppLayout>
    <div :class="[ui.PAGE, '!space-y-4']">
      <Breadcrumbs :crumbs="crumbs" class="sm:hidden" />

      <PageHeader :description="t('Patients referred from screening for clinical evaluation')">
        <template #title>
          <h1 class="text-lg font-semibold text-navy-900 dark:text-gray-100">{{ pageTitle }}</h1>
        </template>
        <template #actions>
          <button type="button" :class="[ui.BTN_SECONDARY, '!px-2.5']" :aria-label="t('Refresh')" :title="t('Refresh')" :disabled="loading" @click="load">
            <LucideIcon name="refresh-cw" class="h-4 w-4" :class="loading ? 'animate-spin' : ''" />
          </button>
          <router-link :to="{ name: 'DoctypeList', params: { doctypeRoute }, query: { view: 'all' } }" :class="ui.BTN_SECONDARY">
            <LucideIcon name="list" class="h-4 w-4" />
            {{ t('All records') }}
          </router-link>
        </template>
      </PageHeader>

      <div v-if="isOffline" :class="ui.WARNING_BOX" role="status">
        <LucideIcon name="wifi-off" class="h-4 w-4 flex-shrink-0" />
        <span>{{ rows.length ? t('You are offline. This is the list from the last time you were online.') : t('You are offline. Connect to the internet to see the referred patients.') }}</span>
      </div>

      <!-- Status cards: they pick which group the table shows. -->
      <div class="grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3">
        <button
          v-for="card in statusCards"
          :key="card.key"
          type="button"
          :aria-pressed="status === card.key"
          class="flex min-w-0 flex-col gap-1 rounded-xl bg-white px-3 py-3 text-left ring-1 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-forest-400 dark:bg-gray-900 sm:px-5 sm:py-4"
          :class="status === card.key ? 'ring-2 ring-forest-600 dark:ring-forest-400' : 'ring-gray-200 hover:ring-forest-300 dark:ring-gray-800 dark:hover:ring-forest-700'"
          @click="status = card.key"
        >
          <span class="flex items-center gap-1.5 text-xs font-medium text-gray-600 dark:text-gray-300 sm:gap-2 sm:text-sm">
            <span class="h-2 w-2 flex-shrink-0 rounded-full" :class="card.dot" aria-hidden="true" />
            <span class="truncate">{{ t(card.label) }}</span>
          </span>
          <span class="text-2xl font-semibold tabular-nums text-navy-900 dark:text-gray-100 sm:text-3xl">
            <template v-if="loading && !loaded">–</template>
            <template v-else>{{ card.count }}</template>
          </span>
        </button>
      </div>

      <section :class="[ui.CARD, 'overflow-visible']">
        <!-- Filters: each a dropdown of tick boxes (Referred on: one choice). -->
        <div class="flex flex-col gap-2.5 border-b border-gray-100 p-3 dark:border-gray-800 sm:p-4">
          <div ref="filterBar" class="flex flex-wrap items-center gap-2">
            <div v-for="filter in filterViews" :key="filter.key" class="relative">
              <button
                type="button"
                :aria-expanded="openFilter === filter.key"
                class="inline-flex h-9 items-center gap-1.5 rounded-lg px-3 text-sm ring-1 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-forest-400"
                :class="
                  filter.active
                    ? 'bg-forest-50 font-semibold text-forest-800 ring-forest-300 dark:bg-forest-900/40 dark:text-forest-200 dark:ring-forest-700'
                    : 'bg-white text-gray-700 ring-gray-200 hover:bg-gray-50 dark:bg-gray-900 dark:text-gray-200 dark:ring-gray-700 dark:hover:bg-gray-800'
                "
                @click="toggleFilter(filter.key)"
              >
                {{ t(filter.label) }}
                <span v-if="filter.badge" class="rounded-full bg-forest-700 px-1.5 text-[11px] font-semibold text-white dark:bg-forest-500">{{ filter.badge }}</span>
                <LucideIcon name="chevron-down" class="h-3.5 w-3.5 opacity-70" />
              </button>

              <div
                v-if="openFilter === filter.key"
                class="fixed inset-x-3 bottom-3 z-50 max-h-[70vh] overflow-y-auto rounded-xl bg-white p-1.5 shadow-xl ring-1 ring-gray-200 dark:bg-gray-900 dark:ring-gray-700 sm:absolute sm:inset-x-auto sm:bottom-auto sm:left-0 sm:top-full sm:mt-1.5 sm:max-h-96 sm:w-64"
                role="dialog"
                :aria-label="t(filter.label)"
              >
                <template v-for="option in filter.options" :key="option.head || option.value">
                  <div v-if="option.head" class="px-2.5 pb-1 pt-2.5 text-[11px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                    {{ t(option.head) }}
                  </div>
                  <label
                    v-else
                    class="flex min-h-[2.5rem] cursor-pointer items-center justify-between gap-3 rounded-lg px-2.5 text-sm text-gray-800 hover:bg-gray-50 dark:text-gray-200 dark:hover:bg-gray-800"
                  >
                    <span class="flex items-center gap-2.5">
                      <input
                        :type="filter.multi ? 'checkbox' : 'radio'"
                        :name="`cw-${filter.key}`"
                        :checked="option.checked"
                        class="h-4 w-4 border-gray-300 text-forest-700 focus:ring-forest-400"
                        :class="filter.multi ? 'rounded-[3px]' : 'rounded-full'"
                        @change="pick(filter, option.value)"
                      />
                      {{ option.translate ? t(option.label) : option.label }}
                    </span>
                    <span class="text-xs tabular-nums text-gray-500 dark:text-gray-400">{{ option.count }}</span>
                  </label>
                </template>
                <div class="mt-1 flex items-center justify-between gap-2 border-t border-gray-100 px-1 pt-1.5 dark:border-gray-800">
                  <button type="button" class="h-8 rounded-md px-2 text-sm text-gray-600 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-gray-800" @click="clearFilter(filter)">
                    {{ t('Clear') }}
                  </button>
                  <button type="button" :class="[ui.BTN_PRIMARY, '!h-8']" @click="openFilter = null">{{ t('Done') }}</button>
                </div>
              </div>
            </div>
            <div v-if="openFilter" class="fixed inset-0 z-40 bg-black/20 sm:hidden" aria-hidden="true" @click="openFilter = null" />
          </div>

          <div v-if="chips.length" class="flex flex-wrap items-center gap-1.5">
            <button
              v-for="chip in chips"
              :key="chip.key"
              type="button"
              class="inline-flex h-7 items-center gap-1 rounded-full bg-forest-50 pl-2.5 pr-1.5 text-xs font-medium text-forest-800 ring-1 ring-forest-200 hover:bg-forest-100 dark:bg-forest-900/40 dark:text-forest-200 dark:ring-forest-800"
              :aria-label="t('Remove filter {0}', [chip.text])"
              @click="chip.remove()"
            >
              {{ chip.text }}
              <LucideIcon name="x" class="h-3.5 w-3.5" />
            </button>
            <button type="button" class="h-7 px-2 text-xs font-semibold text-forest-700 hover:underline dark:text-forest-300" @click="clearAll">
              {{ t('Clear all') }}
            </button>
          </div>
        </div>

        <div class="flex items-center justify-between gap-2 px-4 py-2.5 text-xs text-gray-500 dark:text-gray-400">
          <span>{{ t('{0} patients', [visibleRows.length]) }}</span>
          <span>{{ t('Oldest referral first') }}</span>
        </div>

        <ErrorMessage v-if="error && !rows.length" :message="error" class="px-4 pb-4" />

        <div v-else-if="loading && !loaded" class="space-y-2 px-4 pb-4">
          <Skeleton v-for="i in 5" :key="i" height="3rem" />
        </div>

        <div v-else-if="!visibleRows.length" class="px-4 pb-10 pt-6 text-center text-sm text-gray-500 dark:text-gray-400">
          {{ rows.length ? t('No patients match these filters.') : t('No one has been referred for clinical evaluation yet.') }}
        </div>

        <!-- Phones: one card per patient. -->
        <ul v-else-if="isPhone" class="divide-y divide-gray-100 border-t border-gray-100 dark:divide-gray-800 dark:border-gray-800">
          <li v-for="row in visibleRows" :key="row.screening" class="flex flex-col gap-2 px-4 py-3">
            <div class="flex items-start justify-between gap-3">
              <div class="min-w-0">
                <div class="truncate font-semibold text-navy-900 dark:text-gray-100">{{ row.patient_name || row.screening }}</div>
                <div class="text-xs text-gray-500 dark:text-gray-400">{{ personLine(row) }}</div>
              </div>
              <span class="inline-flex flex-shrink-0 items-center gap-1.5 text-xs text-gray-600 dark:text-gray-300">
                <span class="h-2 w-2 rounded-full" :class="STATUS[row.status].dot" aria-hidden="true" />
                {{ t(STATUS[row.status].label) }}
              </span>
            </div>
            <div class="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-600 dark:text-gray-300">
              <span><span class="text-gray-500 dark:text-gray-400">{{ t('Referred for') }}:</span> {{ sitesText(row) }}</span>
              <span><span class="text-gray-500 dark:text-gray-400">{{ t('Referred on') }}:</span> {{ dateText(row.referred_on) }}</span>
              <span v-if="row.village"><span class="text-gray-500 dark:text-gray-400">{{ t('Village') }}:</span> {{ row.village }}</span>
            </div>
            <button type="button" :class="[actionClass(row), 'w-full']" @click="open(row)">{{ t(STATUS[row.status].action) }}</button>
          </li>
        </ul>

        <!-- Wider screens: a table. -->
        <div v-else class="overflow-x-auto border-t border-gray-100 dark:border-gray-800">
          <table :class="[ui.TABLE, 'min-w-[56rem]']">
            <thead class="bg-gray-50 text-xs text-gray-500 dark:bg-gray-800 dark:text-gray-400">
              <tr>
                <th class="px-4 py-2.5 font-medium">{{ t('Patient') }}</th>
                <th class="px-3 py-2.5 font-medium">{{ t('Referred for') }}</th>
                <th class="px-3 py-2.5 font-medium">{{ t('Referred on') }}</th>
                <th class="px-3 py-2.5 font-medium">{{ t('Village') }}</th>
                <th class="px-3 py-2.5 font-medium">{{ t('Screened by') }}</th>
                <th class="px-3 py-2.5 font-medium">{{ t('Status') }}</th>
                <th class="px-4 py-2.5 text-right font-medium">{{ t('Action') }}</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-gray-100 dark:divide-gray-800">
              <tr v-for="row in visibleRows" :key="row.screening" class="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                <td class="px-4 py-3">
                  <div class="font-semibold text-navy-900 dark:text-gray-100">{{ row.patient_name || row.screening }}</div>
                  <div class="text-xs text-gray-500 dark:text-gray-400">{{ personLine(row) }}</div>
                </td>
                <td class="px-3 py-3 text-gray-700 dark:text-gray-300">{{ sitesText(row) }}</td>
                <td class="whitespace-nowrap px-3 py-3 tabular-nums text-gray-700 dark:text-gray-300">{{ dateText(row.referred_on) }}</td>
                <td class="px-3 py-3 text-gray-700 dark:text-gray-300">{{ row.village || '–' }}</td>
                <td class="px-3 py-3 text-gray-700 dark:text-gray-300">{{ row.screened_by || '–' }}</td>
                <td class="whitespace-nowrap px-3 py-3">
                  <span class="inline-flex items-center gap-1.5 text-sm text-gray-700 dark:text-gray-300">
                    <span class="h-2 w-2 rounded-full" :class="STATUS[row.status].dot" aria-hidden="true" />
                    {{ t(STATUS[row.status].label) }}
                  </span>
                </td>
                <td class="whitespace-nowrap px-4 py-2 text-right">
                  <button type="button" :class="actionClass(row)" @click="open(row)">{{ t(STATUS[row.status].action) }}</button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </div>
  </AppLayout>
</template>

<script setup>
import { computed, onBeforeUnmount, ref, watch, watchEffect } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { breakpointsTailwind, onKeyStroke, useBreakpoints } from '@vueuse/core'
import { ErrorMessage, call } from 'frappe-ui'
import AppLayout from '@/layouts/AppLayout.vue'
import PageHeader from '@/components/PageHeader.vue'
import Breadcrumbs from '@/components/Breadcrumbs.vue'
import Skeleton from '@/components/Skeleton.vue'
import LucideIcon from '@/components/LucideIcon.vue'
import { findModuleByRoute } from '@/data/modules'
import { listCrumbs } from '@/data/breadcrumbs'
import { setPageTitle, setPageCrumbs } from '@/data/pageTitle'
import { offlineState } from '@/data/offline/state'
import { t } from '@/data/i18n'
import * as ui from '@/data/ui'

const route = useRoute()
const router = useRouter()
const doctypeRoute = route.params.doctypeRoute
const pageTitle = computed(() => t(findModuleByRoute(doctypeRoute)?.label || 'Clinical Evaluation'))
const crumbs = computed(() => listCrumbs(doctypeRoute, {}))
watchEffect(() => {
  setPageTitle(pageTitle.value)
  setPageCrumbs(route.path, crumbs.value)
})

const isPhone = useBreakpoints(breakpointsTailwind).smaller('md')
const isOffline = computed(() => !offlineState.online)

const SITES = ['oral', 'breast', 'cervical']
const SITE_LABEL = { oral: 'Oral', breast: 'Breast', cervical: 'Cervical' }
const STATUS = {
  to_evaluate: { label: 'To evaluate', action: 'Start evaluation', dot: 'bg-amber-500' },
  in_progress: { label: 'In progress', action: 'Continue', dot: 'bg-blue-500' },
  completed: { label: 'Completed', action: 'View', dot: 'bg-forest-600' },
}

// --- Data ------------------------------------------------------------------
const rows = ref([])
const loading = ref(false)
const loaded = ref(false)
const error = ref(null)

async function load() {
  loading.value = true
  error.value = null
  try {
    rows.value = (await call('chw.cancer.worklist.get_clinical_worklist')) || []
    loaded.value = true
  } catch (e) {
    error.value = e?.messages?.[0] || e?.message || t('Could not load the worklist.')
  } finally {
    loading.value = false
  }
}
load()
// Back online: fetch a fresh list.
watch(isOffline, (offline, was) => {
  if (was && !offline) load()
})

// --- Filters ---------------------------------------------------------------
const comboKey = (row) => SITES.filter((s) => row.sites.includes(s)).join('+')
const AGE_GROUPS = ['Under 30', '30–39', '40–49', '50–59', '60+']
function ageGroup(age) {
  const a = Number(age) || 0
  if (a < 30) return 'Under 30'
  if (a < 40) return '30–39'
  if (a < 50) return '40–49'
  if (a < 60) return '50–59'
  return '60+'
}
function todayISO() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
function daysAgo(iso) {
  if (!iso) return Infinity
  const [y, m, d] = iso.split('-').map(Number)
  const [ty, tm, td] = todayISO().split('-').map(Number)
  return Math.round((Date.UTC(ty, tm - 1, td) - Date.UTC(y, m - 1, d)) / 86400000)
}
const distinct = (key) => [...new Set(rows.value.map((r) => r[key]).filter(Boolean))].sort((a, b) => String(a).localeCompare(String(b)))

const FILTERS = [
  {
    key: 'sites',
    label: 'Referred for',
    multi: true,
    options: () => [
      { head: 'Includes' },
      ...SITES.map((s) => ({ value: `has:${s}`, label: SITE_LABEL[s], translate: true })),
      { head: 'Exact combination' },
      { value: 'oral', label: 'Oral only', translate: true },
      { value: 'breast', label: 'Breast only', translate: true },
      { value: 'cervical', label: 'Cervical only', translate: true },
      { value: 'oral+breast', label: 'Oral + Breast', translate: true },
      { value: 'oral+cervical', label: 'Oral + Cervical', translate: true },
      { value: 'breast+cervical', label: 'Breast + Cervical', translate: true },
      { value: 'oral+breast+cervical', label: 'All three', translate: true },
    ],
    test: (row, v) => (v.startsWith('has:') ? row.sites.includes(v.slice(4)) : comboKey(row) === v),
  },
  { key: 'village', label: 'Village', multi: true, options: () => distinct('village').map((v) => ({ value: v, label: v })), test: (row, v) => row.village === v },
  { key: 'screened_by', label: 'Screened by', multi: true, options: () => distinct('screened_by').map((v) => ({ value: v, label: v })), test: (row, v) => row.screened_by === v },
  { key: 'gender', label: 'Gender', multi: true, options: () => distinct('gender').map((v) => ({ value: v, label: v, translate: true })), test: (row, v) => row.gender === v },
  { key: 'age', label: 'Age group', multi: true, options: () => AGE_GROUPS.map((v) => ({ value: v, label: v, translate: true })), test: (row, v) => ageGroup(row.age) === v },
  {
    key: 'referred',
    label: 'Referred on',
    multi: false,
    options: () => [
      { value: '', label: 'Any time', translate: true },
      { value: '0', label: 'Today', translate: true },
      { value: '7', label: 'Last 7 days', translate: true },
      { value: '14', label: 'Last 14 days', translate: true },
      { value: '30', label: 'Last 30 days', translate: true },
    ],
    test: (row, v) => !v || daysAgo(row.referred_on) <= Number(v),
  },
]

// State, read from and written to the URL (?status=…&village=A,B).
const fromQuery = (key) => {
  const raw = route.query[key]
  return typeof raw === 'string' && raw ? raw.split(',') : []
}
// 'all' = the Total card: everyone, whatever their status.
const status = ref(STATUS[route.query.status] || route.query.status === 'all' ? route.query.status : 'to_evaluate')
const inStatus = (row) => status.value === 'all' || row.status === status.value
const selected = ref(Object.fromEntries(FILTERS.map((f) => [f.key, fromQuery(f.key)])))
watch(
  [status, selected],
  () => {
    const query = {}
    if (status.value !== 'to_evaluate') query.status = status.value
    for (const f of FILTERS) if (selected.value[f.key].length) query[f.key] = selected.value[f.key].join(',')
    router.replace({ query })
  },
  { deep: true },
)

const isActive = (f) => selected.value[f.key].some((v) => v !== '')
function passes(row, skipKey) {
  return FILTERS.every((f) => f.key === skipKey || !isActive(f) || selected.value[f.key].some((v) => f.test(row, v)))
}
const filtered = computed(() => rows.value.filter((row) => passes(row)))
const visibleRows = computed(() => filtered.value.filter(inStatus))

const statusCards = computed(() =>
  [
    { key: 'all', label: 'Total referred', dot: 'bg-navy-600', count: filtered.value.length },
    ...Object.entries(STATUS).map(([key, s]) => ({ key, label: s.label, dot: s.dot, count: filtered.value.filter((r) => r.status === key).length })),
  ],
)

const filterViews = computed(() =>
  FILTERS.map((f) => {
    const values = selected.value[f.key]
    // Each option's count: patients in this group that match every other filter.
    const pool = rows.value.filter((row) => inStatus(row) && passes(row, f.key))
    const options = f.options().map((o) =>
      o.head
        ? o
        : {
            ...o,
            checked: f.multi ? values.includes(o.value) : (values[0] || '') === o.value,
            count: pool.filter((row) => f.test(row, o.value)).length,
          },
    )
    const chosen = !f.multi && values[0] ? options.find((o) => o.value === values[0]) : null
    return {
      ...f,
      options,
      active: isActive(f),
      badge: f.multi ? (values.length ? String(values.length) : '') : chosen ? t(chosen.label) : '',
    }
  }),
)

function pick(filter, value) {
  const values = selected.value[filter.key]
  if (!filter.multi) selected.value[filter.key] = value ? [value] : []
  else selected.value[filter.key] = values.includes(value) ? values.filter((v) => v !== value) : [...values, value]
}
function clearFilter(filter) {
  selected.value[filter.key] = []
}
function clearAll() {
  for (const f of FILTERS) selected.value[f.key] = []
  openFilter.value = null
}

const chips = computed(() => {
  const list = []
  for (const view of filterViews.value) {
    for (const value of selected.value[view.key]) {
      const option = view.options.find((o) => !o.head && o.value === value)
      if (!option || !value) continue
      list.push({
        key: `${view.key}:${value}`,
        text: `${t(view.label)}: ${option.translate ? t(option.label) : option.label}`,
        remove: () => (view.multi ? pick(view, value) : clearFilter(view)),
      })
    }
  }
  return list
})

// One dropdown open at a time; a click elsewhere or Esc closes it.
const openFilter = ref(null)
const filterBar = ref(null)
function toggleFilter(key) {
  openFilter.value = openFilter.value === key ? null : key
}
function onDocumentClick(e) {
  if (openFilter.value && filterBar.value && !filterBar.value.contains(e.target)) openFilter.value = null
}
document.addEventListener('mousedown', onDocumentClick)
onBeforeUnmount(() => document.removeEventListener('mousedown', onDocumentClick))
onKeyStroke('Escape', () => (openFilter.value = null))

// --- Rows ------------------------------------------------------------------
function sitesText(row) {
  return SITES.filter((s) => row.sites.includes(s)).map((s) => t(SITE_LABEL[s])).join(', ')
}
function personLine(row) {
  return [row.patient_name ? row.screening : '', row.age ? t('{0} y', [row.age]) : '', row.gender ? t(row.gender) : '', row.mobile_number].filter(Boolean).join(' · ')
}
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
function dateText(iso) {
  if (!iso) return '–'
  const [y, m, d] = iso.split('-').map(Number)
  return `${String(d).padStart(2, '0')} ${t(MONTHS[m - 1])} ${y}`
}
function actionClass(row) {
  if (row.status === 'to_evaluate') return [ui.BTN_PRIMARY, '!h-9']
  if (row.status === 'in_progress') return [ui.BTN_TOOLBAR, '!h-9']
  return [ui.BTN_SECONDARY, '!h-9']
}

// Start: a new evaluation with the screening already picked (the form
// fills the patient and shows only the referred tabs). Continue / View:
// the existing one.
function open(row) {
  if (row.evaluation) {
    router.push({ name: 'DoctypeForm', params: { doctypeRoute, name: row.evaluation } })
  } else {
    router.push({ name: 'DoctypeNew', params: { doctypeRoute }, query: { main_screening_form: row.screening } })
  }
}
</script>

<template>
  <AppLayout>
    <div :class="[ui.PAGE_FULL, '!space-y-4 sm:-mx-3']">
      <!-- Desktop shows this trail in the top navbar; phones (no navbar) here. -->
      <Breadcrumbs v-if="isGenericRoute" :crumbs="crumbs" class="sm:hidden" />

      <PageHeader>
        <template #title>
          <div class="flex items-center gap-2">
            <h1 class="text-lg font-semibold text-navy-900 dark:text-gray-100">{{ pageTitle }}</h1>
            <span v-if="total != null" :class="ui.COUNT_BADGE">{{ formatNumber(total) }}</span>
          </div>
        </template>
        <template #actions>
          <button v-if="metaResource.data" type="button" :class="ui.BTN_PRIMARY" @click="goToNew">
            <LucideIcon name="plus" class="h-4 w-4" />
            New
          </button>
        </template>
      </PageHeader>

      <div v-if="metaResource.loading && !metaResource.data" class="space-y-2">
        <Skeleton v-for="i in 6" :key="i" height="3rem" />
      </div>
      <ErrorMessage v-else-if="metaResource.error" :message="metaResource.error" />

      <template v-else-if="metaResource.data">
        <!-- Set when opened from a record's Connections - only that record's
        linked entries are listed until the chip is cleared. -->
        <div v-if="linkFilterChips.length" class="flex flex-wrap items-center gap-2">
          <span
            v-for="chip in linkFilterChips"
            :key="chip.fieldname"
            class="inline-flex items-center gap-1.5 rounded-full bg-navy-50 py-1 pl-3 pr-1 text-sm font-semibold text-navy-700 ring-1 ring-navy-100 dark:bg-navy-900/40 dark:text-navy-200 dark:ring-navy-800"
          >
            <span class="font-normal opacity-80">{{ chip.label }}:</span>
            {{ chip.value }}
            <button
              type="button"
              class="flex h-5 w-5 items-center justify-center rounded-full hover:bg-navy-100 dark:hover:bg-navy-800"
              :aria-label="`Remove ${chip.label} filter`"
              @click="clearLinkFilters"
            >
              <LucideIcon name="x" class="h-3.5 w-3.5" />
            </button>
          </span>
        </div>

        <!-- Toolbar, one row. Desktop (lg+): search, the form's first quick
        filters, then the buttons. Narrower screens: search + buttons only
        (icons on a phone, like Desk's mobile list) - every filter lives in
        the one Filter button there. Filter / Sort / Columns open as
        dropdowns on desktop, bottom sheets on a phone. -->
        <div class="flex items-center gap-2">
          <div class="relative min-w-0 flex-1 lg:w-60 lg:flex-none">
            <LucideIcon name="search" class="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              v-model="search"
              type="search"
              :placeholder="isPhone ? 'Search' : `Search ${pageTitle}`"
              class="h-8 w-full rounded-lg border-0 bg-white pl-9 pr-3 text-sm text-gray-900 ring-1 ring-gray-200 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-forest-400 dark:bg-gray-900 dark:text-gray-100 dark:ring-gray-700"
            />
          </div>
          <div v-if="inlineFilterFields.length" class="flex min-w-0 flex-1 items-center gap-2">
            <div v-for="field in inlineFilterFields" :key="field.fieldname" class="w-40 flex-shrink-0">
              <ListFilterControl :field="field" v-model="filterValues[field.fieldname]" />
            </div>
            <button v-if="hasQuickFilters" type="button" class="text-sm font-medium text-forest-700 hover:underline dark:text-forest-300" @click="clearQuickFilters">
              Clear
            </button>
          </div>
          <div v-else class="hidden flex-1 lg:block" />

          <div class="flex flex-shrink-0 items-center gap-1.5 sm:gap-2">
            <button type="button" :class="[ui.BTN_SECONDARY, '!h-8 !px-2']" aria-label="Refresh" title="Refresh" :disabled="loading" @click="load">
              <LucideIcon name="refresh-cw" class="h-4 w-4" :class="{ 'animate-spin': loading }" />
            </button>
            <button type="button" :class="[ui.BTN_SECONDARY, '!h-8 !px-2 sm:!px-3']" :disabled="exporting || !total" aria-label="Export" title="Export" @click="exportCsv()">
              <LucideIcon :name="exporting ? 'loader-circle' : 'download'" class="h-4 w-4" :class="{ 'animate-spin': exporting }" />
              <span class="hidden sm:inline">Export</span>
            </button>

            <!-- All the form's standard filters, then "Add a Filter" rows. -->
            <ToolbarMenu label="Filter" icon="list-filter" :badge="activeFilterCount || null" align="right" width="sm:w-auto" icon-only-on-phone>
              <template #default="{ close }">
                <FilterBuilder
                  v-model="advancedFilters"
                  :fields="filterableFields"
                  :quick-fields="filterFields"
                  :quick-values="filterValues"
                  @update:quick-values="Object.assign(filterValues, $event)"
                  @applied="close"
                />
              </template>
            </ToolbarMenu>

            <!-- Sort: the field, plus ascending / descending - Desk's sort menu. -->
            <ToolbarMenu :label="sortLabel" icon="arrow-up-down" align="right" width="sm:w-60" icon-only-on-phone>
              <template #default="{ close }">
                <div class="mb-2 grid grid-cols-2 gap-1 rounded-lg bg-gray-100 p-0.5 dark:bg-gray-800">
                  <button
                    v-for="dir in SORT_DIRECTIONS"
                    :key="dir.value"
                    type="button"
                    class="flex items-center justify-center gap-1.5 rounded-md py-1.5 text-sm font-medium"
                    :class="sortOrder === dir.value ? 'bg-white text-navy-900 shadow-sm dark:bg-gray-700 dark:text-gray-100' : 'text-gray-500 dark:text-gray-400'"
                    @click="sortOrder = dir.value"
                  >
                    <LucideIcon :name="dir.icon" class="h-4 w-4" />
                    {{ dir.label }}
                  </button>
                </div>
                <button
                  v-for="opt in sortOptions"
                  :key="opt.value"
                  type="button"
                  class="flex w-full items-center justify-between gap-2 rounded-md px-2 py-2 text-left text-sm hover:bg-gray-50 dark:hover:bg-gray-800 sm:py-1.5"
                  :class="sortField === opt.value ? 'font-semibold text-navy-900 dark:text-gray-100' : 'text-gray-700 dark:text-gray-300'"
                  @click="sortField = opt.value; close()"
                >
                  <span class="truncate">{{ opt.label }}</span>
                  <LucideIcon v-if="sortField === opt.value" name="check" class="h-4 w-4 flex-shrink-0 text-forest-700 dark:text-forest-300" />
                </button>
              </template>
            </ToolbarMenu>

            <!-- Columns: also what the phone cards show. -->
            <ToolbarMenu label="Columns" icon="columns-3" align="right" width="sm:w-auto" icon-only-on-phone>
              <ColumnManager
                :fields="availableColumns"
                :model-value="visibleColumnNames"
                @update:model-value="setColumns"
                @reset="resetColumns"
              />
            </ToolbarMenu>
          </div>
        </div>

        <!-- Applied filters as chips (each removable), like Desk shows them. -->
        <div v-if="advancedFilters.length || quickChips.length" class="flex flex-wrap items-center gap-2">
          <span
            v-for="chip in quickChips"
            :key="chip.fieldname"
            class="inline-flex max-w-full items-center gap-1 rounded-full bg-forest-50 py-1 pl-3 pr-1 text-xs font-medium text-forest-800 ring-1 ring-forest-100 dark:bg-forest-900/40 dark:text-forest-200 dark:ring-forest-800"
          >
            <span class="truncate">{{ chip.text }}</span>
            <button
              type="button"
              class="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full hover:bg-forest-100 dark:hover:bg-forest-800"
              aria-label="Remove filter"
              @click="filterValues[chip.fieldname] = ''"
            >
              <LucideIcon name="x" class="h-3 w-3" />
            </button>
          </span>
          <span
            v-for="(row, index) in advancedFilters"
            :key="index"
            class="inline-flex max-w-full items-center gap-1 rounded-full bg-forest-50 py-1 pl-3 pr-1 text-xs font-medium text-forest-800 ring-1 ring-forest-100 dark:bg-forest-900/40 dark:text-forest-200 dark:ring-forest-800"
          >
            <span class="truncate">{{ filterChipText(row) }}</span>
            <button
              type="button"
              class="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full hover:bg-forest-100 dark:hover:bg-forest-800"
              aria-label="Remove filter"
              @click="advancedFilters = advancedFilters.filter((_, i) => i !== index)"
            >
              <LucideIcon name="x" class="h-3 w-3" />
            </button>
          </span>
          <button type="button" class="text-xs font-semibold text-gray-500 hover:text-red-600" @click="advancedFilters = []; clearQuickFilters()">Clear all</button>
        </div>

        <!-- Bulk bar: appears once any row is ticked. -->
        <div
          v-if="selected.length"
          class="flex flex-wrap items-center gap-3 rounded-xl bg-navy-900 px-4 py-2.5 text-sm text-white shadow-sm dark:bg-navy-800"
        >
          <span class="font-semibold">{{ selected.length }} selected</span>
          <button type="button" class="inline-flex items-center gap-1.5 rounded-md px-2 py-1 font-medium hover:bg-white/10" @click="exportCsv(selected)">
            <LucideIcon name="download" class="h-4 w-4" />
            Export
          </button>
          <button type="button" class="inline-flex items-center gap-1.5 rounded-md px-2 py-1 font-medium text-red-200 hover:bg-white/10" @click="confirmDelete = true">
            <LucideIcon name="trash-2" class="h-4 w-4" />
            Delete
          </button>
          <button type="button" class="ml-auto rounded-md px-2 py-1 text-navy-100 hover:bg-white/10" @click="selected = []">Clear</button>
        </div>

        <div v-if="loading && !rows.length" class="space-y-2">
          <Skeleton v-for="i in 6" :key="i" height="3rem" />
        </div>
        <ErrorMessage v-else-if="error" :message="error" />
        <div v-else-if="!rows.length" :class="ui.EMPTY_STATE">
          <LucideIcon name="inbox" class="h-8 w-8 text-gray-300 dark:text-gray-600" />
          <span>{{ isFiltered ? 'No records match these filters.' : 'No records yet.' }}</span>
          <button v-if="!isFiltered" type="button" :class="[ui.BTN_PRIMARY, 'mt-2']" @click="goToNew">
            <LucideIcon name="plus" class="h-4 w-4" />
            Create the first one
          </button>
        </div>

        <template v-else>
          <!-- Table from sm up; stacked cards on a phone. -->
          <div :class="[ui.LIST_TABLE_WRAP, 'hidden sm:block', { 'opacity-60': loading }]">
            <table :class="ui.TABLE">
              <thead :class="ui.THEAD">
                <tr>
                  <th class="w-10 py-2.5 pl-3 pr-1">
                    <input
                      type="checkbox"
                      class="h-4 w-4 rounded border-gray-300 text-forest-700 focus:ring-forest-400"
                      aria-label="Select all on this page"
                      :checked="allOnPageSelected"
                      :indeterminate.prop="someOnPageSelected && !allOnPageSelected"
                      @change="toggleAllOnPage"
                    />
                  </th>
                  <th :class="ui.LIST_TH">ID</th>
                  <th v-for="col in columns" :key="col.fieldname" :class="ui.LIST_TH">{{ col.label }}</th>
                  <th :class="[ui.LIST_TH, 'text-right']">Last Modified</th>
                </tr>
              </thead>
              <tbody :class="ui.TBODY">
                <tr
                  v-for="row in rows"
                  :key="row.name"
                  tabindex="0"
                  :class="[ui.TR, { '!bg-forest-50/70 dark:!bg-forest-900/20': selected.includes(row.name) }]"
                  @click="goToRow(row.name)"
                  @keydown.enter="goToRow(row.name)"
                >
                  <td class="py-2.5 pl-3 pr-1" @click.stop>
                    <input
                      type="checkbox"
                      class="h-4 w-4 rounded border-gray-300 text-forest-700 focus:ring-forest-400"
                      :aria-label="`Select ${row.name}`"
                      :checked="selected.includes(row.name)"
                      @change="toggleRow(row.name)"
                    />
                  </td>
                  <td :class="ui.LIST_TD_STRONG">{{ row.name }}</td>
                  <td v-for="col in columns" :key="col.fieldname" :class="ui.LIST_TD">
                    <UserLinkHoverCard v-if="isUserLink(col) && row[col.fieldname]" :user="row[col.fieldname]" @click.stop>
                      <span class="underline decoration-dotted">{{ row[col.fieldname] }}</span>
                    </UserLinkHoverCard>
                    <span v-else-if="isEmptyValue(row[col.fieldname])" class="text-gray-300 dark:text-gray-600">—</span>
                    <span v-else-if="col.fieldtype === 'Select'" class="inline-flex items-center gap-1.5">
                      <span class="h-2 w-2 flex-shrink-0 rounded-full" :class="DOT[toneFor(row[col.fieldname])]" />
                      {{ row[col.fieldname] }}
                    </span>
                    <template v-else>{{ formatFieldValue(row[col.fieldname], col) }}</template>
                  </td>
                  <td :class="[ui.LIST_TD, 'text-right tabular-nums']" :title="formatFieldValue(row.modified, { fieldtype: 'Datetime' })">
                    {{ shortAgo(row.modified) }}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <!-- Phone cards, Desk-mobile style: ID chip and status on top, the
          record's name, its key fields two by two, and when it last changed. -->
          <div class="space-y-2 sm:hidden" :class="{ 'opacity-60': loading }">
            <button v-for="(row, index) in rows" :key="row.name" type="button" :class="ui.mobileRowClass(index)" @click="goToRow(row.name)">
              <span class="flex items-center justify-between gap-2">
                <span class="truncate rounded-md bg-white/80 px-1.5 py-0.5 font-mono text-xs text-gray-600 ring-1 ring-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:ring-gray-700">
                  {{ row.name }}
                </span>
                <span class="flex flex-shrink-0 items-center gap-1.5">
                  <span v-if="statusColumn && !isEmptyValue(row[statusColumn.fieldname])" :class="[ui.PILL, ui.TONE[toneFor(row[statusColumn.fieldname])]]">
                    {{ row[statusColumn.fieldname] }}
                  </span>
                  <LucideIcon name="chevron-right" class="h-4 w-4 text-gray-400" />
                </span>
              </span>
              <span v-if="rowTitle(row) !== row.name" class="mt-2 block truncate text-[15px] font-semibold text-navy-900 dark:text-gray-100">
                {{ rowTitle(row) }}
              </span>
              <dl v-if="mobileColumns.length" class="mt-2 grid grid-cols-2 gap-x-3 gap-y-2">
                <div v-for="col in mobileColumns" :key="col.fieldname" class="min-w-0">
                  <dt class="truncate text-[11px] text-gray-500 dark:text-gray-400">{{ col.label }}</dt>
                  <dd class="truncate text-sm font-medium text-gray-900 dark:text-gray-100">
                    <span v-if="isEmptyValue(row[col.fieldname])" class="font-normal text-gray-300 dark:text-gray-600">—</span>
                    <template v-else>{{ formatFieldValue(row[col.fieldname], col) }}</template>
                  </dd>
                </div>
              </dl>
              <span class="mt-2 block text-xs text-gray-500 dark:text-gray-400">Updated {{ shortAgo(row.modified) }} ago</span>
            </button>
          </div>

          <!-- Footer: page size on the left, position + paging on the right. -->
          <div class="flex flex-col items-center gap-3 sm:flex-row sm:justify-between">
            <div class="inline-flex rounded-lg bg-gray-100 p-0.5 dark:bg-gray-800" role="group" aria-label="Rows per page">
              <button
                v-for="size in PAGE_SIZES"
                :key="size"
                type="button"
                class="rounded-md px-3 py-1 text-sm font-medium transition"
                :class="pageSize === size ? 'bg-white text-navy-900 shadow-sm dark:bg-gray-700 dark:text-gray-100' : 'text-gray-500 hover:text-navy-900 dark:text-gray-400'"
                :aria-pressed="pageSize === size"
                @click="pageSize = size"
              >
                {{ size }}
              </button>
            </div>
            <div class="flex items-center gap-3">
              <span class="text-sm tabular-nums text-gray-500 dark:text-gray-400">
                {{ formatNumber(start + 1) }}–{{ formatNumber(start + rows.length) }} of {{ formatNumber(total) }}
              </span>
              <div class="flex items-center gap-1">
                <button type="button" :class="ui.BTN_SECONDARY" aria-label="Previous page" :disabled="loading || page === 0" @click="page--">
                  <LucideIcon name="chevron-left" class="h-4 w-4" />
                </button>
                <button type="button" :class="ui.BTN_SECONDARY" aria-label="Next page" :disabled="loading || start + rows.length >= total" @click="page++">
                  <LucideIcon name="chevron-right" class="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>
        </template>
      </template>
    </div>

    <Dialog
      v-model="confirmDelete"
      :options="{ title: `Delete ${selected.length} record${selected.length === 1 ? '' : 's'}?`, message: 'This permanently deletes the selected records. It cannot be undone.' }"
    >
      <template #actions>
        <div class="flex justify-end gap-2">
          <button type="button" :class="ui.BTN_SECONDARY" @click="confirmDelete = false">Cancel</button>
          <button
            type="button"
            class="inline-flex h-9 items-center gap-1.5 rounded-lg bg-red-600 px-3.5 text-sm font-semibold text-white shadow-sm hover:bg-red-700 disabled:opacity-60"
            :disabled="deleting"
            @click="deleteSelected"
          >
            <LucideIcon :name="deleting ? 'loader-circle' : 'trash-2'" class="h-4 w-4" :class="{ 'animate-spin': deleting }" />
            Delete
          </button>
        </div>
      </template>
    </Dialog>
  </AppLayout>
</template>

<script setup>
import { computed, reactive, ref, watch, watchEffect } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { breakpointsTailwind, useBreakpoints, watchDebounced } from '@vueuse/core'
import { Dialog, ErrorMessage, call, toast } from 'frappe-ui'
import AppLayout from '@/layouts/AppLayout.vue'
import PageHeader from '@/components/PageHeader.vue'
import Breadcrumbs from '@/components/Breadcrumbs.vue'
import UserLinkHoverCard from '@/components/UserLinkHoverCard.vue'
import Skeleton from '@/components/Skeleton.vue'
import LucideIcon from '@/components/LucideIcon.vue'
import ListFilterControl from '@/components/ListFilterControl.vue'
import FilterBuilder from '@/components/FilterBuilder.vue'
import ColumnManager from '@/components/ColumnManager.vue'
import ToolbarMenu from '@/components/ToolbarMenu.vue'
import { isEmptyValue, formatFieldValue, isLayoutField, toneFor } from '@/data/recordFormat'
import { useMeta, useListFields, useFilterFields } from '@/data/useMeta'
import { findModuleByRoute } from '@/data/modules'
import { listCrumbs } from '@/data/breadcrumbs'
import { STANDARD_FILTER_FIELDS, operatorLabel, toServerFilter } from '@/data/listFilters'
import { setPageTitle, setPageCrumbs } from '@/data/pageTitle'
import * as ui from '@/data/ui'

const props = defineProps({
  doctype: { type: String, required: true },
})

const route = useRoute()
const router = useRouter()

const metaResource = useMeta(props.doctype)
const defaultColumns = useListFields(metaResource)
const filterFields = useFilterFields(metaResource)

const pageTitle = findModuleByRoute(route.params.doctypeRoute)?.label || props.doctype
setPageTitle(pageTitle)

// Doctypes reached via the generic /:doctypeRoute path use the shared
// DoctypeNew/DoctypeForm route names with a doctypeRoute param; doctypes
// with their own dedicated routes (e.g. Email Account, not tied to any
// App Module Setting module) use their own New/Form route names instead -
// derive which pattern applies from this list route's own name.
const isGenericRoute = route.name === 'DoctypeList'

// Status dot colours for Select columns (meaning, see recordFormat.toneFor).
const DOT = { green: 'bg-green-500', amber: 'bg-amber-500', red: 'bg-red-500', blue: 'bg-blue-500' }

// ---- Storage (per-viewer conveniences only; private windows may block it) ----
function stored(key, fallback) {
  try {
    const raw = localStorage.getItem(key)
    return raw == null ? fallback : JSON.parse(raw)
  } catch {
    return fallback
  }
}
function store(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // Not saved - the list still works, it just won't remember.
  }
}

// ---- Columns ----
const COLUMNS_KEY = `chw-list-columns:${props.doctype}`
const availableColumns = computed(() =>
  (metaResource.data?.fields || []).filter((f) => !f.hidden && !isLayoutField(f) && f.fieldtype !== 'Table'),
)
// null = "use the form's own list-view columns".
const chosenColumns = ref(stored(COLUMNS_KEY, null))
const visibleColumnNames = computed(() => chosenColumns.value || defaultColumns.value.map((c) => c.fieldname))
const columns = computed(() =>
  visibleColumnNames.value.map((n) => availableColumns.value.find((f) => f.fieldname === n)).filter(Boolean),
)

// The form's own title field (Household profile -> Head of the Family),
// like Desk's list - a first column can be a date ("Sep 30, 2026"), which
// makes a poor card title. Falls back to the first column, then the ID.
const titleField = computed(() => {
  const name = metaResource.data?.title_field
  return name ? availableColumns.value.find((f) => f.fieldname === name) || null : null
})

function setColumns(fieldnames) {
  chosenColumns.value = fieldnames
  store(COLUMNS_KEY, fieldnames)
}

function resetColumns() {
  chosenColumns.value = null
  try {
    localStorage.removeItem(COLUMNS_KEY)
  } catch {
    // ignore
  }
}


// ---- Filters ----
// Two kinds, like Desk: the form's own standard filters as quick boxes in
// the desktop toolbar, and "Add a Filter" rows (any field, any condition)
// in the Filter menu. Both narrow the list together.
const filterValues = reactive({})
watch(
  filterFields,
  (fields) => {
    for (const key of Object.keys(filterValues)) delete filterValues[key]
    for (const f of fields) filterValues[f.fieldname] = ''
  },
  { immediate: true },
)

// Only text / dropdown filters go inline: a bare date box ("mm/dd/yyyy")
// can't show which field it filters. None below lg - the phone toolbar has
// one Filter button holding them all - two on a laptop, three if very wide.
const breakpoints = useBreakpoints(breakpointsTailwind)
// The phone toolbar's search box is narrow - a short placeholder fits it.
const isPhone = breakpoints.smaller('sm')
const inlineCount = computed(() =>
  breakpoints.greaterOrEqual('2xl').value ? 3 : breakpoints.greaterOrEqual('lg').value ? 2 : 0,
)
const inlineFilterFields = computed(() =>
  filterFields.value.filter((f) => f.fieldtype !== 'Date' && f.fieldtype !== 'Datetime').slice(0, inlineCount.value),
)
const isSet = (value) => value !== '' && value != null
const hasQuickFilters = computed(() => filterFields.value.some((f) => isSet(filterValues[f.fieldname])))

// Standard filters set from the Filter panel that have no box in the
// toolbar (all of them on a phone) - shown as chips so they stay visible.
const quickChips = computed(() =>
  filterFields.value
    .filter((f) => isSet(filterValues[f.fieldname]) && !inlineFilterFields.value.includes(f))
    .map((f) => {
      const value = filterValues[f.fieldname]
      let text = value
      if (f.fieldtype === 'Check') text = Number(value) ? 'Yes' : 'No'
      else if (f.fieldtype === 'Date' || f.fieldtype === 'Datetime') text = formatFieldValue(value, { fieldtype: 'Date' })
      return { fieldname: f.fieldname, text: `${f.label}: ${text}` }
    }),
)

// Badge on the Filter button: everything it holds that is switched on.
const activeFilterCount = computed(
  () => filterFields.value.filter((f) => isSet(filterValues[f.fieldname])).length + advancedFilters.value.length,
)

function clearQuickFilters() {
  for (const key of Object.keys(filterValues)) filterValues[key] = ''
}

// "Add a Filter" rows: [{ fieldname, operator, value }] - any field of the
// form, plus ID / Created On / Last Modified / Created By.
const advancedFilters = ref([])
const filterableFields = computed(() => [
  ...STANDARD_FILTER_FIELDS,
  ...availableColumns.value.filter((f) => !['Attach', 'Attach Image', 'Text Editor', 'Code', 'Geolocation'].includes(f.fieldtype)),
])

function filterFieldFor(fieldname) {
  return filterableFields.value.find((f) => f.fieldname === fieldname)
}

// "Village contains Jhari", "Created On after 30 Sep 2026" ...
function filterChipText(row) {
  const field = filterFieldFor(row.fieldname)
  let value = row.value
  if (row.operator === 'is') value = row.value === 'not set' ? 'not set' : 'set'
  else if (field?.fieldtype === 'Check') value = Number(row.value) ? 'Yes' : 'No'
  else if (field?.fieldtype === 'Date' || field?.fieldtype === 'Datetime') value = formatFieldValue(row.value, { fieldtype: 'Date' })
  return `${field?.label || row.fieldname} ${operatorLabel(row.operator, field).toLowerCase()} ${value}`
}

const hasActiveFilters = computed(() => hasQuickFilters.value || advancedFilters.value.length > 0)

// Exact-match filters from the URL query (e.g. ?familymember_id=FM-00064,
// set by a form's Connections panel). Only real fields of this DocType are
// honoured, so an unrelated query param can't turn into a broken filter.
const linkFilters = computed(() => {
  const meta = metaResource.data
  if (!meta) return {}
  const result = {}
  for (const [key, value] of Object.entries(route.query)) {
    if (typeof value !== 'string' || !value) continue
    if (meta.fields.some((f) => f.fieldname === key)) result[key] = value
  }
  return result
})

const linkFilterChips = computed(() =>
  Object.entries(linkFilters.value).map(([fieldname, value]) => ({
    fieldname,
    value,
    label: metaResource.data.fields.find((f) => f.fieldname === fieldname)?.label || fieldname,
  })),
)

function clearLinkFilters() {
  router.replace({ query: {} })
}

// Home / Household profile / HH-00027 / Family members when opened from a
// household; Home / Family members otherwise.
const crumbs = computed(() => listCrumbs(route.params.doctypeRoute, linkFilters.value))
// Desktop shows the trail in the top navbar (one header row, not two).
watchEffect(() => {
  if (isGenericRoute) setPageCrumbs(route.path, crumbs.value)
})

// Server filter format: a list of [fieldname, operator, value]. Quick text
// filters match anywhere in the value.
const listFilters = computed(() => {
  const result = Object.entries(linkFilters.value).map(([key, value]) => [key, '=', value])
  for (const field of filterFields.value) {
    const value = filterValues[field.fieldname]
    if (!isSet(value)) continue
    if (field.fieldtype === 'Check') result.push([field.fieldname, '=', Number(value)])
    // A date filter means that whole day (Datetime -> between 00:00 and 23:59).
    else if (field.fieldtype === 'Date' || field.fieldtype === 'Datetime') {
      result.push(toServerFilter({ fieldname: field.fieldname, operator: '=', value }, field))
    } else if (['Select', 'Int', 'Float', 'Currency'].includes(field.fieldtype)) result.push([field.fieldname, '=', value])
    else result.push([field.fieldname, 'like', `%${value}%`])
  }
  for (const row of advancedFilters.value) result.push(toServerFilter(row, filterFieldFor(row.fieldname)))
  return result
})

const search = ref('')
const isFiltered = computed(() => hasActiveFilters.value || !!search.value.trim() || linkFilterChips.value.length > 0)

// ---- Sort ----
const sortField = ref('modified')
const sortOrder = ref('desc')
const SORT_DIRECTIONS = [
  { value: 'desc', label: 'Descending', icon: 'arrow-down-wide-narrow' },
  { value: 'asc', label: 'Ascending', icon: 'arrow-up-narrow-wide' },
]
const sortOptions = computed(() => {
  const options = [
    { label: 'Last Modified', value: 'modified' },
    { label: 'Created On', value: 'creation' },
    { label: 'ID', value: 'name' },
  ]
  for (const col of columns.value) {
    if (!options.some((o) => o.value === col.fieldname)) options.push({ label: col.label || col.fieldname, value: col.fieldname })
  }
  return options
})
const sortLabel = computed(() => sortOptions.value.find((o) => o.value === sortField.value)?.label || 'Sort')

// The form's own default sort, once its meta is in (Desk's "sort_field").
watch(
  () => metaResource.data,
  (meta) => {
    if (!meta) return
    if (meta.sort_field) sortField.value = meta.sort_field
    if (meta.sort_order) sortOrder.value = String(meta.sort_order).toLowerCase() === 'asc' ? 'asc' : 'desc'
  },
  { immediate: true },
)

// ---- Paging + loading ----
// Own paging via chw.api.get_list_page (rows + matching total in one
// call) rather than frappe-ui's useList, which only appends pages and has
// no total - neither page-size buttons nor "31-60 of 92" were possible.
const PAGE_SIZES = [15, 30, 50, 100]
const PAGE_SIZE_KEY = 'chw-list-page-size'
const savedSize = stored(PAGE_SIZE_KEY, 30)
const pageSize = ref(PAGE_SIZES.includes(savedSize) ? savedSize : 30)
watch(pageSize, (size) => store(PAGE_SIZE_KEY, size))

const page = ref(0)
const start = computed(() => page.value * pageSize.value)

const rows = ref([])
const total = ref(null)
const loading = ref(false)
const error = ref(null)
let requestId = 0

function errorText(e, fallback) {
  return e?.messages?.join(', ') || e?.message || fallback
}

// The visible columns, plus the title field the phone cards are named by.
const requestedFields = computed(() => {
  const names = columns.value.map((c) => c.fieldname)
  if (titleField.value && !names.includes(titleField.value.fieldname)) names.push(titleField.value.fieldname)
  return names
})

async function load() {
  if (!metaResource.data) return
  const id = ++requestId
  loading.value = true
  error.value = null
  try {
    const data = await call('chw.api.get_list_page', {
      doctype: props.doctype,
      fields: JSON.stringify(requestedFields.value),
      filters: JSON.stringify(listFilters.value),
      search: search.value.trim(),
      order_by: `${sortField.value} ${sortOrder.value}`,
      start: start.value,
      page_length: pageSize.value,
    })
    if (id !== requestId) return
    rows.value = data?.rows || []
    total.value = data?.total ?? rows.value.length
  } catch (e) {
    if (id !== requestId) return
    error.value = errorText(e, 'Could not load records.')
  } finally {
    if (id === requestId) loading.value = false
  }
}

// ---- Selection ----
const selected = ref([])
const allOnPageSelected = computed(() => rows.value.length > 0 && rows.value.every((r) => selected.value.includes(r.name)))
const someOnPageSelected = computed(() => rows.value.some((r) => selected.value.includes(r.name)))

function toggleRow(name) {
  selected.value = selected.value.includes(name) ? selected.value.filter((n) => n !== name) : [...selected.value, name]
}

function toggleAllOnPage() {
  const names = rows.value.map((r) => r.name)
  selected.value = allOnPageSelected.value
    ? selected.value.filter((n) => !names.includes(n))
    : [...new Set([...selected.value, ...names])]
}

// Any change to what's being asked for (not just the page) starts again
// from page 1 - else page 3 of an old search could come back empty - and
// drops a selection that no longer matches what's shown.
function restart() {
  selected.value = []
  if (page.value !== 0) page.value = 0
  else load()
}

const queryKey = computed(() =>
  JSON.stringify([listFilters.value, sortField.value, sortOrder.value, pageSize.value, visibleColumnNames.value]),
)
watch(queryKey, restart)
// Typing in search waits for a pause rather than fetching per keystroke.
watchDebounced(search, restart, { debounce: 300 })
watch(page, load)
watch(() => metaResource.data, load, { immediate: true })

const numberFormat = new Intl.NumberFormat()
function formatNumber(value) {
  return numberFormat.format(value || 0)
}

// "32m", "5h", "3d", "2w", "4mo", "1y" - the compact age Desk's list shows.
function shortAgo(value) {
  const d = new Date(String(value).replace(' ', 'T'))
  if (isNaN(d)) return ''
  const s = Math.max(0, (Date.now() - d.getTime()) / 1000)
  if (s < 60) return 'now'
  if (s < 3600) return `${Math.floor(s / 60)}m`
  if (s < 86400) return `${Math.floor(s / 3600)}h`
  if (s < 7 * 86400) return `${Math.floor(s / 86400)}d`
  if (s < 30 * 86400) return `${Math.floor(s / (7 * 86400))}w`
  if (s < 365 * 86400) return `${Math.floor(s / (30 * 86400))}mo`
  return `${Math.floor(s / (365 * 86400))}y`
}

// Phone cards: a status-like dropdown column becomes the pill on top, the
// title field the card's name, and every other chosen column goes in the
// two-wide grid - so a column added through Columns shows on the phone too.
const statusColumn = computed(
  () => columns.value.find((c) => c.fieldtype === 'Select' && /status/i.test(`${c.fieldname} ${c.label}`)) || null,
)
const mobileColumns = computed(() =>
  columns.value.filter((c) => c !== statusColumn.value && c.fieldname !== titleField.value?.fieldname),
)

function rowTitle(row) {
  for (const field of [titleField.value, columns.value[0]]) {
    if (field && !isEmptyValue(row[field.fieldname])) return formatFieldValue(row[field.fieldname], field)
  }
  return row.name
}

function isUserLink(field) {
  return field.fieldtype === 'Link' && field.options === 'User'
}

// ---- Export ----
// A CSV of the visible columns: the ticked rows, or every record matching
// the current search + filters (up to 5000).
const exporting = ref(false)

function csvCell(value) {
  const text = value == null ? '' : String(value)
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

async function exportCsv(names = null) {
  exporting.value = true
  try {
    const filters = names?.length ? [...listFilters.value, ['name', 'in', names]] : listFilters.value
    const data = await call('chw.api.get_list_page', {
      doctype: props.doctype,
      fields: JSON.stringify(columns.value.map((c) => c.fieldname)),
      filters: JSON.stringify(filters),
      search: names?.length ? '' : search.value.trim(),
      order_by: `${sortField.value} ${sortOrder.value}`,
      start: 0,
      page_length: 5000,
    })
    const header = ['ID', ...columns.value.map((c) => c.label || c.fieldname)]
    const lines = [header, ...(data?.rows || []).map((r) => [r.name, ...columns.value.map((c) => r[c.fieldname])])]
    // Leading BOM so Excel opens it as UTF-8 (names in Indian scripts).
    const blob = new Blob([`﻿${lines.map((l) => l.map(csvCell).join(',')).join('\n')}`], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${props.doctype.toLowerCase().replace(/\s+/g, '-')}.csv`
    a.click()
    URL.revokeObjectURL(url)
  } catch (e) {
    toast.error(errorText(e, 'Export failed.'))
  } finally {
    exporting.value = false
  }
}

// ---- Delete ----
// Frappe's own bulk delete - checks delete permission per record.
const confirmDelete = ref(false)
const deleting = ref(false)

async function deleteSelected() {
  deleting.value = true
  const count = selected.value.length
  try {
    await call('frappe.desk.reportview.delete_items', { items: JSON.stringify(selected.value), doctype: props.doctype })
    // More than 10 are deleted in the background by Frappe.
    toast.success(count > 10 ? `Deleting ${count} records in the background` : `Deleted ${count} record${count === 1 ? '' : 's'}`)
    selected.value = []
    confirmDelete.value = false
    load()
  } catch (e) {
    toast.error(errorText(e, 'Delete failed.'))
  } finally {
    deleting.value = false
  }
}

// ---- Navigation ----
function goToNew() {
  if (isGenericRoute) {
    // Carry the link filter along so a new entry made from a filtered list
    // (e.g. one family member's pregnancies) starts linked to that record.
    router.push({ name: 'DoctypeNew', params: { doctypeRoute: route.params.doctypeRoute }, query: linkFilters.value })
  } else {
    router.push({ name: route.name.replace('List', 'New') })
  }
}

function goToRow(name) {
  if (isGenericRoute) {
    router.push({ name: 'DoctypeForm', params: { doctypeRoute: route.params.doctypeRoute, name } })
  } else {
    router.push({ name: route.name.replace('List', 'Form'), params: { name } })
  }
}
</script>

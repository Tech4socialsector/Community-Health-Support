<template>
  <AppLayout>
    <PageHeader>
      <template #title>
        <h1 class="text-lg font-semibold text-gray-900 dark:text-gray-100">{{ pageTitle }}</h1>
      </template>
      <template #actions>
        <Button
          v-if="metaResource.data"
          variant="solid"
          @click="goToNew"
        >
          New
        </Button>
      </template>
    </PageHeader>

    <div v-if="metaResource.loading && !metaResource.data" class="space-y-2">
      <Skeleton v-for="i in 5" :key="i" height="2.5rem" />
    </div>
    <ErrorMessage v-else-if="metaResource.error" :message="metaResource.error" />

    <template v-else-if="metaResource.data">
      <!-- Mobile: a row of labeled filter boxes that fits fine on desktop
      stacks into a tall wall of inputs on a phone, pushing the actual list
      below the fold. A compact "Filter" pill (tap to open the same
      per-field inputs in a bottom sheet instead) replaces that inline row
      there - same AND-per-field semantics as desktop, just tucked behind
      a tap. -->
      <div v-if="isMobile && filterFields.length" class="mb-4">
        <button
          class="flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm text-gray-700 dark:border-gray-700 dark:text-gray-300"
          :class="hasActiveFilters ? 'border-gray-900 dark:border-gray-100' : 'border-gray-200'"
          @click="showFilterSheet = true"
        >
          <FeatherIcon name="filter" class="h-3.5 w-3.5" />
          Filter
          <span
            v-if="activeFilterCount"
            class="flex h-4 min-w-4 items-center justify-center rounded-full bg-gray-900 px-1 text-[10px] text-white dark:bg-gray-100 dark:text-gray-900"
          >
            {{ activeFilterCount }}
          </span>
          <FeatherIcon
            v-if="hasActiveFilters"
            name="x"
            class="h-3.5 w-3.5 text-gray-400"
            @click.stop="clearFilters"
          />
        </button>
      </div>
      <div v-else-if="!isMobile && filterFields.length" class="mb-4 flex flex-wrap items-end gap-3">
        <div v-for="field in filterFields" :key="field.fieldname" class="w-52 flex-shrink-0">
          <FormControl
            v-if="field.fieldtype === 'Select'"
            type="select"
            class="[&_[data-slot=trigger]]:w-full"
            :label="field.label"
            :options="[{ label: `All ${field.label}`, value: '' }, ...selectOptionsFor(field)]"
            v-model="filterValues[field.fieldname]"
          />
          <FormControl
            v-else-if="field.fieldtype === 'Check'"
            type="select"
            class="[&_[data-slot=trigger]]:w-full"
            :label="field.label"
            :options="[{ label: `All ${field.label}`, value: '' }, { label: 'Yes', value: '1' }, { label: 'No', value: '0' }]"
            v-model="filterValues[field.fieldname]"
          />
          <FormControl
            v-else-if="field.fieldtype === 'Date' || field.fieldtype === 'Datetime'"
            type="date"
            :label="field.label"
            v-model="filterValues[field.fieldname]"
          />
          <FormControl
            v-else
            type="text"
            :label="field.label"
            :placeholder="`Filter by ${field.label}`"
            v-model="filterValues[field.fieldname]"
          />
        </div>
        <Button v-if="hasActiveFilters" variant="ghost" @click="clearFilters">
          <template #prefix>
            <FeatherIcon name="x" class="h-4 w-4" />
          </template>
          Clear filters
        </Button>
      </div>

      <Dialog v-model="showFilterSheet" :options="{ size: 'sm', title: 'filter-sheet' }">
        <template #body>
          <div class="filter-sheet-panel flex flex-col">
            <div class="flex h-12 flex-shrink-0 items-center justify-between border-b px-4 dark:border-gray-800">
              <h3 class="text-base font-semibold text-gray-900 dark:text-gray-100">Filter</h3>
              <button
                class="flex h-7 w-7 items-center justify-center rounded text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800"
                @click="showFilterSheet = false"
              >
                <FeatherIcon name="x" class="h-4 w-4" />
              </button>
            </div>

            <div class="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4">
              <div v-for="field in filterFields" :key="field.fieldname">
                <FormControl
                  v-if="field.fieldtype === 'Select'"
                  type="select"
                  class="[&_[data-slot=trigger]]:w-full"
                  :label="field.label"
                  :options="[{ label: `All ${field.label}`, value: '' }, ...selectOptionsFor(field)]"
                  v-model="filterValues[field.fieldname]"
                />
                <FormControl
                  v-else-if="field.fieldtype === 'Check'"
                  type="select"
                  class="[&_[data-slot=trigger]]:w-full"
                  :label="field.label"
                  :options="[{ label: `All ${field.label}`, value: '' }, { label: 'Yes', value: '1' }, { label: 'No', value: '0' }]"
                  v-model="filterValues[field.fieldname]"
                />
                <FormControl
                  v-else-if="field.fieldtype === 'Date' || field.fieldtype === 'Datetime'"
                  type="date"
                  :label="field.label"
                  v-model="filterValues[field.fieldname]"
                />
                <FormControl
                  v-else
                  type="text"
                  :label="field.label"
                  :placeholder="`Filter by ${field.label}`"
                  v-model="filterValues[field.fieldname]"
                />
              </div>
            </div>

            <div class="flex flex-shrink-0 gap-2 border-t p-4 dark:border-gray-800">
              <Button v-if="hasActiveFilters" class="flex-1" @click="clearFilters">
                Clear
              </Button>
              <Button variant="solid" class="flex-1" @click="showFilterSheet = false">
                Done
              </Button>
            </div>
          </div>
        </template>
      </Dialog>

      <div v-if="rows.loading && !rows.data" class="space-y-2">
        <Skeleton v-for="i in 5" :key="i" height="2.5rem" />
      </div>
      <ErrorMessage v-else-if="rows.error" :message="rows.error" />
      <div
        v-else-if="!rows.data || rows.data.length === 0"
        class="py-10 text-center text-gray-500 dark:text-gray-400"
      >
        No records yet.
      </div>

      <!-- Mobile: a table forces horizontal scrolling to see anything past
      the first column or two, which is awkward on a phone - each row
      becomes its own card instead, with the first list-view column as the
      card's title and every other column shown as a label/value line. -->
      <div v-if="isMobile" class="space-y-2">
        <div
          v-for="row in rows.data"
          :key="row.name"
          class="cursor-pointer rounded-lg border p-3 hover:bg-gray-50 dark:border-gray-800 dark:hover:bg-gray-800"
          @click="goToRow(row.name)"
        >
          <div class="truncate text-sm font-medium text-gray-900 dark:text-gray-100">
            {{ formatValue(row[columns[0]?.fieldname], columns[0]) }}
          </div>
          <div v-if="columns.length > 1" class="mt-1.5 space-y-1">
            <div
              v-for="col in columns.slice(1)"
              :key="col.fieldname"
              class="flex items-baseline justify-between gap-3 text-sm"
            >
              <span class="flex-shrink-0 text-gray-500 dark:text-gray-400">{{ col.label }}</span>
              <span class="truncate text-right text-gray-700 dark:text-gray-300">
                <UserLinkHoverCard v-if="isUserLink(col) && row[col.fieldname]" :user="row[col.fieldname]" @click.stop>
                  <span class="underline decoration-dotted">{{ row[col.fieldname] }}</span>
                </UserLinkHoverCard>
                <template v-else>{{ formatValue(row[col.fieldname], col) }}</template>
              </span>
            </div>
          </div>
        </div>
      </div>

      <div v-else class="overflow-x-auto rounded-lg border dark:border-gray-800">
        <table class="w-full min-w-[36rem] text-left text-sm">
          <thead class="border-b bg-gray-50 text-xs uppercase text-gray-500 dark:border-gray-800 dark:bg-gray-800 dark:text-gray-400">
            <tr>
              <th v-for="col in columns" :key="col.fieldname" class="whitespace-nowrap px-4 py-2">
                {{ col.label }}
              </th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="row in rows.data"
              :key="row.name"
              class="cursor-pointer border-b last:border-0 hover:bg-gray-50 dark:border-gray-800 dark:hover:bg-gray-800"
              @click="goToRow(row.name)"
            >
              <td v-for="col in columns" :key="col.fieldname" class="whitespace-nowrap px-4 py-2 text-gray-900 dark:text-gray-100">
                <UserLinkHoverCard v-if="isUserLink(col) && row[col.fieldname]" :user="row[col.fieldname]" @click.stop>
                  <span class="underline decoration-dotted">{{ row[col.fieldname] }}</span>
                </UserLinkHoverCard>
                <template v-else>{{ formatValue(row[col.fieldname], col) }}</template>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div class="mt-4 flex justify-end gap-2">
        <Button :disabled="!rows.hasPreviousPage" @click="rows.previous()">
          Previous
        </Button>
        <Button :disabled="!rows.hasNextPage" @click="rows.next()">
          Next
        </Button>
      </div>
    </template>
  </AppLayout>
</template>

<style>
/* Same data-dialog hook pattern as SettingsDialog.vue/ChildTable.vue's
row editor. Only used on mobile (the "Filter" pill that opens it is
isMobile-gated in the template), so this is a bottom sheet outright
rather than a centered-card/full-screen split by breakpoint like those -
anchored to the bottom edge and rounded only on top, matching the
conventional mobile filter-sheet affordance instead of a dialog that
happens to fill the screen. */
[data-dialog='filter-sheet'].dialog-overlay {
  z-index: 50;
}
[data-dialog='filter-sheet'].dialog-overlay > div {
  align-items: flex-end;
  padding: 0;
}
[data-dialog='filter-sheet'] .dialog-content {
  margin: 0;
  max-width: none;
  width: 100vw;
  border-radius: 1rem 1rem 0 0;
}

.filter-sheet-panel {
  width: 100%;
  max-height: 75vh;
}
</style>

<script setup>
import { computed, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { breakpointsTailwind, useBreakpoints } from '@vueuse/core'
import { useList, Button, Dialog, ErrorMessage, FeatherIcon, FormControl } from 'frappe-ui'
import AppLayout from '@/layouts/AppLayout.vue'
import PageHeader from '@/components/PageHeader.vue'
import UserLinkHoverCard from '@/components/UserLinkHoverCard.vue'
import Skeleton from '@/components/Skeleton.vue'
import { useMeta, useListFields, useFilterFields } from '@/data/useMeta'
import { findModuleByRoute } from '@/data/modules'
import { setPageTitle } from '@/data/pageTitle'

const breakpoints = useBreakpoints(breakpointsTailwind)
const isMobile = breakpoints.smaller('sm')

const props = defineProps({
  doctype: { type: String, required: true },
})

const route = useRoute()
const router = useRouter()

const metaResource = useMeta(props.doctype)
const columns = useListFields(metaResource)
const filterFields = useFilterFields(metaResource)

const filterValues = reactive({})

watch(
  filterFields,
  (fields) => {
    for (const key of Object.keys(filterValues)) delete filterValues[key]
    for (const f of fields) filterValues[f.fieldname] = ''
  },
  { immediate: true },
)

const hasActiveFilters = computed(() => Object.values(filterValues).some((v) => v !== ''))

function clearFilters() {
  for (const key of Object.keys(filterValues)) filterValues[key] = ''
}

function selectOptionsFor(field) {
  return (field.options || '')
    .split('\n')
    .map((v) => v.trim())
    .filter(Boolean)
    .map((v) => ({ label: v, value: v }))
}

const listFilters = computed(() => {
  const result = {}
  for (const field of filterFields.value) {
    const value = filterValues[field.fieldname]
    if (value === '' || value == null) continue
    if (field.fieldtype === 'Check') {
      result[field.fieldname] = Number(value)
    } else if (field.fieldtype === 'Select' || field.fieldtype === 'Date' || field.fieldtype === 'Datetime') {
      result[field.fieldname] = value
    } else {
      result[field.fieldname] = ['like', value]
    }
  }
  return result
})

const pageTitle = findModuleByRoute(route.params.doctypeRoute)?.label || props.doctype
setPageTitle(pageTitle)

// `immediate: false` - metaResource.data (and the `columns`/`orderBy` it
// drives) isn't ready on mount, so an immediate fetch would run with the
// wrong fields/orderBy. useList's own useFetch already watches its computed
// URL and auto-refetches whenever it changes (refetch: true, the default) -
// since that URL is itself derived from columns.value/metaResource.data,
// the moment metaResource.data resolves is the moment the URL changes and
// this fires on its own. An explicit rows.fetch() call here used to race
// that same auto-refetch (both firing in the same tick, one aborting the
// other), leaking an AbortError into rows.error as "signal is aborted
// without reason" - removed rather than raced against.
const rows = useList({
  doctype: props.doctype,
  fields: () => (columns.value.length ? ['name', ...columns.value.map((c) => c.fieldname)] : ['name']),
  filters: () => listFilters.value,
  orderBy: () => {
    const meta = metaResource.data
    return `${meta?.sort_field || 'modified'} ${meta?.sort_order || 'desc'}`
  },
  limit: 20,
  immediate: false,
})

// The mobile "Filter" pill (see showFilterSheet below) opens the same
// per-field inputs as desktop instead of a separate single-search-box
// mechanism - `rows` above is now the one shared data source for both,
// so there's no separate mobile resource/normalization needed here
// anymore.
const showFilterSheet = ref(false)
const activeFilterCount = computed(
  () => Object.values(filterValues).filter((v) => v !== '' && v != null).length,
)

function formatValue(value, field) {
  if (value == null || value === '') return '-'
  if (field.fieldtype === 'Check') return value ? 'Yes' : 'No'
  return value
}

function isUserLink(field) {
  return field.fieldtype === 'Link' && field.options === 'User'
}

// Doctypes reached via the generic /:doctypeRoute path use the shared
// DoctypeNew/DoctypeForm route names with a doctypeRoute param; doctypes
// with their own dedicated routes (e.g. Email Account, not tied to any
// App Module Setting module) use their own New/Form route names instead -
// derive which pattern applies from this list route's own name.
const isGenericRoute = route.name === 'DoctypeList'

function goToNew() {
  if (isGenericRoute) {
    router.push({ name: 'DoctypeNew', params: { doctypeRoute: route.params.doctypeRoute } })
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

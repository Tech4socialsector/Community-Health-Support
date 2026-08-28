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
      <div v-if="filterFields.length" class="mb-4 flex flex-wrap items-end gap-3">
        <div v-for="field in filterFields" :key="field.fieldname" class="w-40">
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

<script setup>
import { computed, reactive, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useList, Button, ErrorMessage, FeatherIcon, FormControl } from 'frappe-ui'
import AppLayout from '@/layouts/AppLayout.vue'
import PageHeader from '@/components/PageHeader.vue'
import UserLinkHoverCard from '@/components/UserLinkHoverCard.vue'
import Skeleton from '@/components/Skeleton.vue'
import { useMeta, useListFields, useFilterFields } from '@/data/useMeta'
import { findModuleByRoute } from '@/data/modules'
import { setPageTitle } from '@/data/pageTitle'

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
// drives) isn't ready on mount, so an immediate fetch would race a second,
// metadata-driven one moments later: the first request gets aborted, and
// that AbortError was leaking into rows.error and rendering as "signal is
// aborted without reason". Firing exactly once, only after metaResource.data
// resolves, avoids the race entirely.
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

const stopMetaWatch = watch(
  () => metaResource.data,
  (meta) => {
    if (!meta) return
    rows.fetch()
    stopMetaWatch()
  },
  { immediate: true },
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

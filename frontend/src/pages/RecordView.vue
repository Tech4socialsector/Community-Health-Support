<template>
  <AppLayout>
    <div :class="ui.PAGE">
      <ErrorMessage v-if="loadError" :message="loadError" />

      <!-- Loading: header, facts strip and two section cards' shapes. -->
      <template v-else-if="loading">
        <div class="flex items-center gap-4">
          <Skeleton width="3.5rem" height="3.5rem" round />
          <div class="flex-1 space-y-2">
            <Skeleton width="14rem" height="1.5rem" />
            <Skeleton width="9rem" height="1rem" />
          </div>
        </div>
        <Skeleton height="4.5rem" />
        <div class="grid gap-5 lg:grid-cols-2">
          <div v-for="i in 2" :key="i" :class="[ui.CARD, 'space-y-3 p-4']">
            <Skeleton width="12rem" height="1.25rem" />
            <Skeleton v-for="j in 6" :key="j" height="1.75rem" />
          </div>
        </div>
      </template>

      <template v-else-if="doc">
        <!-- Breadcrumb -->
        <nav class="flex min-w-0 items-center gap-1.5 text-sm text-gray-500 dark:text-gray-400" aria-label="Breadcrumb">
          <router-link :to="{ name: 'Home' }" class="flex-shrink-0 hover:text-navy-900 dark:hover:text-gray-100" aria-label="Home">
            <LucideIcon name="house" class="h-4 w-4" />
          </router-link>
          <LucideIcon name="chevron-right" class="h-3.5 w-3.5 flex-shrink-0 text-gray-300" />
          <router-link
            v-if="appItem"
            :to="{ name: 'DoctypeList', params: { doctypeRoute: appItem.route } }"
            class="truncate hover:text-navy-900 dark:hover:text-gray-100"
          >
            {{ formLabel }}
          </router-link>
          <span v-else class="truncate">{{ formLabel }}</span>
          <LucideIcon name="chevron-right" class="h-3.5 w-3.5 flex-shrink-0 text-gray-300" />
          <span class="truncate font-medium text-navy-900 dark:text-gray-100">{{ doc.name }}</span>
        </nav>

        <!-- Header: what this record is and who it's about, plus actions. -->
        <header class="flex flex-wrap items-center justify-between gap-4">
          <div class="flex min-w-0 items-center gap-4">
            <span class="flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-full bg-forest-50 text-forest-700 ring-4 ring-forest-100/70 dark:bg-forest-900/40 dark:text-forest-200 dark:ring-forest-900">
              <LucideIcon :name="appItem?.icon || 'file-text'" class="h-6 w-6" />
            </span>
            <div class="min-w-0">
              <h1 class="truncate text-xl font-bold text-navy-900 dark:text-gray-100 sm:text-2xl">{{ formLabel }}</h1>
              <div class="mt-0.5 flex flex-wrap items-center gap-2">
                <span class="truncate text-base font-medium text-gray-700 dark:text-gray-300">{{ title }}</span>
                <span v-if="doc.status" :class="[ui.PILL, TONE_CLASSES[toneFor(doc.status)]]">{{ doc.status }}</span>
              </div>
            </div>
          </div>
          <div class="flex w-full flex-shrink-0 items-center gap-2 sm:w-auto">
            <button v-if="appItem" type="button" :class="[ui.BTN_PRIMARY, 'flex-1 sm:flex-none']" @click="editRecord">
              <LucideIcon name="pencil" class="h-4 w-4" />
              Edit
            </button>
            <button type="button" :class="[ui.BTN_SECONDARY, 'flex-1 sm:flex-none']" @click="goBack">
              <LucideIcon name="x" class="h-4 w-4" />
              Close
            </button>
          </div>
        </header>

        <!-- Facts strip: the record's ID and headline details at a glance,
        each with its own icon, and when it was last updated. Side by side
        from sm up; two per row on a phone. -->
        <section :class="[ui.CARD, 'overflow-hidden']">
          <div class="grid grid-cols-2 sm:flex">
            <div
              v-for="fact in facts"
              :key="fact.key"
              class="flex min-w-0 items-center gap-3 border-b border-gray-100 p-3 odd:border-r dark:border-gray-800 sm:flex-1 sm:border-b-0 sm:border-r sm:px-4 sm:py-3.5"
            >
              <span :class="ui.ICON_TILE">
                <LucideIcon :name="fact.icon" class="h-[18px] w-[18px]" />
              </span>
              <span class="min-w-0">
                <span class="block truncate text-sm font-semibold text-navy-900 dark:text-gray-100" :title="fact.value">{{ fact.value }}</span>
                <span class="block truncate text-xs text-gray-500 dark:text-gray-400">{{ fact.label }}</span>
              </span>
            </div>
            <div
              v-if="doc.modified"
              class="col-span-2 flex items-center gap-3 bg-navy-50/80 p-3 dark:bg-navy-900/30 sm:col-span-1 sm:flex-none sm:px-5"
            >
              <LucideIcon name="clock" class="h-5 w-5 flex-shrink-0 text-navy-600 dark:text-navy-300" />
              <span class="min-w-0">
                <span class="block text-xs font-medium text-navy-600 dark:text-navy-300">Last Updated</span>
                <span class="block whitespace-nowrap text-sm font-semibold text-navy-900 dark:text-gray-100">
                  {{ formatFieldValue(doc.modified, { fieldtype: 'Datetime' }) }}
                </span>
              </span>
            </div>
          </div>
        </section>

        <!-- Section cards, full width, one after another. Inside, each field
        is a question / answer pair - the label small and grey on top, the
        answer bold and dark underneath - in two or three columns, so it's
        obvious at a glance which is which. No per-field icons. -->
        <section
          v-for="(section, sectionIndex) in visibleSections"
          :key="section.key"
          :class="[ui.CARD, 'overflow-hidden']"
        >
          <h2 class="flex items-center gap-3 px-4 py-3 sm:px-6" :class="ui.sectionHeadAt(sectionIndex).bar">
            <span class="h-4 w-1 flex-shrink-0 rounded-full" :class="ui.sectionHeadAt(sectionIndex).stripe" />
            <span class="text-xs font-bold uppercase tracking-wider" :class="ui.sectionHeadAt(sectionIndex).text">{{ section.label }}</span>
          </h2>
          <dl class="grid grid-cols-1 gap-x-8 gap-y-5 p-4 sm:grid-cols-2 sm:p-6 lg:grid-cols-3">
            <div
              v-for="field in section.fields"
              :key="field.fieldname"
              class="min-w-0"
              :class="{ 'sm:col-span-2 lg:col-span-3': isWide(field) }"
            >
              <dt class="text-xs font-medium text-gray-500 dark:text-gray-400">{{ field.label || field.fieldname }}</dt>
              <dd class="mt-1 min-w-0 break-words text-[15px] font-semibold leading-snug text-gray-900 dark:text-gray-100">
                <span v-if="isEmptyValue(doc[field.fieldname])" class="font-normal text-gray-300 dark:text-gray-600">—</span>

                <RecordChildTable v-else-if="field.fieldtype === 'Table'" :field="field" :rows="doc[field.fieldname]" />

                <span v-else-if="pillTone(field) !== null" :class="[ui.PILL, TONE_CLASSES[pillTone(field)]]">
                  {{ formatFieldValue(doc[field.fieldname], field) }}
                </span>

                <span v-else-if="field.fieldtype === 'Currency'" class="tabular-nums">
                  {{ formatCurrency(doc[field.fieldname]) }}
                </span>

                <!-- A linked record opens in this same detail view. -->
                <router-link
                  v-else-if="isRecordLink(field)"
                  :to="{ name: 'RecordView', params: { doctype: field.options, name: doc[field.fieldname] } }"
                  class="text-forest-700 hover:underline dark:text-forest-300"
                >
                  {{ doc[field.fieldname] }}
                </router-link>

                <!-- A signature is a PNG data URL - show the signature, not its code. -->
                <img
                  v-else-if="field.fieldtype === 'Signature'"
                  :src="doc[field.fieldname]"
                  :alt="field.label"
                  class="max-h-32 rounded-lg bg-white ring-1 ring-gray-200 dark:ring-gray-800"
                />
                <a v-else-if="field.fieldtype === 'Attach Image'" :href="doc[field.fieldname]" target="_blank" rel="noopener">
                  <img :src="doc[field.fieldname]" :alt="field.label" class="max-h-40 rounded-lg ring-1 ring-gray-200 dark:ring-gray-800" />
                </a>

                <a
                  v-else-if="field.fieldtype === 'Attach'"
                  :href="doc[field.fieldname]"
                  target="_blank"
                  rel="noopener"
                  class="inline-flex items-center gap-1 text-forest-700 hover:underline dark:text-forest-300"
                >
                  <LucideIcon name="paperclip" class="h-4 w-4" />
                  {{ fileName(doc[field.fieldname]) }}
                </a>

                <span v-else-if="isLongText(field)" class="block whitespace-pre-wrap font-medium">{{ doc[field.fieldname] }}</span>

                <template v-else>{{ formatFieldValue(doc[field.fieldname], field) }}</template>
              </dd>
            </div>
          </dl>
        </section>

        <div v-if="!visibleSections.length" :class="ui.EMPTY_STATE">
          <LucideIcon name="file-text" class="h-8 w-8 text-gray-300 dark:text-gray-600" />
          This form has no fields to show.
        </div>

        <DocActivity :doctype="doctype" :name="doc.name" />
      </template>
    </div>
  </AppLayout>
</template>

<script setup>
import { computed, ref, watchEffect } from 'vue'
import { useRouter } from 'vue-router'
import { ErrorMessage, call } from 'frappe-ui'
import AppLayout from '@/layouts/AppLayout.vue'
import Skeleton from '@/components/Skeleton.vue'
import LucideIcon from '@/components/LucideIcon.vue'
import RecordChildTable from '@/components/RecordChildTable.vue'
import DocActivity from '@/components/DocActivity.vue'
import { useMeta } from '@/data/useMeta'
import { findModuleByDoctype } from '@/data/modules'
import { setPageTitle } from '@/data/pageTitle'
import { isEmptyValue, formatFieldValue, isLayoutField, iconForField, toneFor } from '@/data/recordFormat'
import * as ui from '@/data/ui'

// Read-only detail page for any record - opened from the Overview
// drilldown, so a coordinator can look a record over without landing in its
// edit form. Laid out from the DocType's own meta: its Section/Tab Breaks
// become the section cards, in the DocType's own field order.

const props = defineProps({
  doctype: { type: String, required: true },
  name: { type: String, required: true },
})

const router = useRouter()

const metaResource = useMeta(props.doctype)

// frappe.client.get applies the user's normal read permissions, and returns
// child table rows along with the document.
const doc = ref(null)
const docLoading = ref(true)
const docError = ref(null)

call('frappe.client.get', { doctype: props.doctype, name: props.name })
  .then((data) => {
    doc.value = data
  })
  .catch((e) => {
    docError.value = e?.messages?.join(', ') || e?.message || 'Could not load this record.'
  })
  .finally(() => {
    docLoading.value = false
  })

const loading = computed(() => docLoading.value || (metaResource.loading && !metaResource.data))
const loadError = computed(() => docError.value || metaResource.error)

// The app's own page for this DocType, if it has one (icon, label, Edit
// target); null for DocTypes only reachable in Desk.
const appItem = computed(() => findModuleByDoctype(props.doctype) || null)

const title = computed(() => {
  const titleField = metaResource.data?.title_field
  return (titleField && doc.value?.[titleField]) || doc.value?.name || props.name
})

watchEffect(() => setPageTitle(title.value))

const visibleFields = computed(() =>
  (metaResource.data?.fields || []).filter((f) => !f.hidden && !isLayoutField(f)),
)

// ---- Colour by meaning ----
// Full class strings so Tailwind's content scan picks them up.
// Meaning colours, shared app-wide (ui.js) - a "Pending" reads the same
// amber here as on Work Orders. Chips use the plain white "gray" variant.
const TONE_CLASSES = { ...ui.TONE, gray: 'bg-white text-gray-700 ring-gray-200 dark:bg-gray-900 dark:text-gray-300 dark:ring-gray-700' }


// Short Select values, Yes/No checks and the status field read as pills;
// long sentence-style Select options (socio-economic answers) stay plain
// text, where a pill would be harder to read. null = not a pill.
// "No" on a Check is just "not ticked" - neutral, unlike a Select's "No".
function pillTone(field) {
  const value = doc.value?.[field.fieldname]
  if (field.fieldtype === 'Check') return value ? 'green' : 'gray'
  if ((field.fieldtype === 'Select' || field.fieldname === 'status') && String(value).length <= 30) {
    return toneFor(value)
  }
  return null
}

// The facts strip: the record ID first, then the list view's own columns
// (minus the title - it's already the heading - and anything empty), each
// with its field's icon.
const formLabel = computed(() => appItem.value?.label || props.doctype)

const facts = computed(() => {
  if (!doc.value) return []
  const titleField = metaResource.data?.title_field
  const fields = visibleFields.value
    .filter(
      (f) =>
        f.in_list_view &&
        f.fieldname !== titleField &&
        f.fieldname !== 'status' &&
        f.fieldtype !== 'Table' &&
        !isEmptyValue(doc.value[f.fieldname]),
    )
    .slice(0, 5)
  return [
    { key: '__name', icon: 'id-card', value: doc.value.name, label: `${formLabel.value} ID` },
    ...fields.map((f) => ({
      key: f.fieldname,
      icon: iconForField(f),
      value: String(f.fieldtype === 'Currency' ? formatCurrency(doc.value[f.fieldname]) : formatFieldValue(doc.value[f.fieldname], f)),
      label: f.label || f.fieldname,
    })),
  ]
})

// Fields grouped by the DocType's Section / Tab Breaks, in field order. A
// section with no label borrows its tab's, then falls back to a generic one.
const sections = computed(() => {
  const fields = metaResource.data?.fields || []
  const result = []
  let tabLabel = ''
  let current = { key: '__start', label: '', fields: [] }
  const push = () => {
    if (current.fields.length) result.push(current)
  }
  for (const f of fields) {
    if (f.fieldtype === 'Tab Break' || f.fieldtype === 'Section Break') {
      if (f.fieldtype === 'Tab Break') tabLabel = f.label || ''
      push()
      current = { key: f.fieldname, label: f.label || tabLabel, fields: [] }
      continue
    }
    if (f.hidden || isLayoutField(f)) continue
    current.fields.push(f)
  }
  push()
  const genericLabel = `${appItem.value?.label || props.doctype} Information`
  return result.map((s, i) => ({ ...s, label: s.label || (i === 0 ? genericLabel : 'More details') }))
})

// Every field is shown, empty ones as "—", so the page always reflects the
// whole form - nothing goes missing just because it wasn't filled in.
const visibleSections = computed(() => (doc.value ? sections.value : []))

const LONG_TEXT_FIELDTYPES = new Set(['Small Text', 'Text', 'Long Text', 'Text Editor', 'Code', 'Markdown Editor', 'JSON'])
// Wide fields stack label over value instead of the label | value row.
const WIDE_FIELDTYPES = new Set([...LONG_TEXT_FIELDTYPES, 'Table', 'Attach Image', 'Geolocation', 'Signature'])

function isLongText(field) {
  return LONG_TEXT_FIELDTYPES.has(field.fieldtype)
}

function isWide(field) {
  return WIDE_FIELDTYPES.has(field.fieldtype)
}

const currencyFormat = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 })
function formatCurrency(value) {
  const n = Number(value)
  return Number.isFinite(n) ? currencyFormat.format(n) : value
}

// Linked records open in this same detail view - except Users, whose
// record is account settings rather than anything worth reading here.
function isRecordLink(field) {
  return field.fieldtype === 'Link' && field.options && field.options !== 'User'
}

function fileName(url) {
  return decodeURIComponent(String(url).split('/').pop() || url)
}

function editRecord() {
  router.push({ name: 'DoctypeForm', params: { doctypeRoute: appItem.value.route, name: props.name } })
}

// Back to wherever the user came from (normally the Overview drilldown);
// a page opened directly (bookmark, new tab) has no history to go back to.
function goBack() {
  if (window.history.state?.back) router.back()
  else router.push({ name: 'Overview' })
}
</script>

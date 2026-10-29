<template>
  <AppLayout>
    <div :class="ui.PAGE_FULL">
      <!-- Header bar: back, what's being edited, Save. One line at every
      width (the title truncates, the buttons never wrap below it), and
      pinned to the top of the scroll area so the single Save stays in
      reach on a long form. The negative margins stretch its background to
      the scroll area's edges, matching AppLayout / MobileShell padding;
      the negative `top` cancels that same padding, which sticky positioning
      otherwise keeps as a gap above the bar (content showed through it). -->
      <div
        class="sticky -top-4 z-20 -mx-4 -mt-4 border-b border-gray-200 bg-gray-50/95 px-4 py-3 backdrop-blur dark:border-gray-800 dark:bg-gray-900/95 sm:-top-6 sm:-mx-6 sm:-mt-6 sm:px-6 sm:py-4"
      >
        <div class="flex items-center gap-2 sm:gap-3">
        <button
          type="button"
          class="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-white text-gray-600 ring-1 ring-gray-200 transition hover:text-navy-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-forest-400 dark:bg-gray-900 dark:text-gray-300 dark:ring-gray-700"
          :aria-label="t('Back')"
          @click="goBack"
        >
          <LucideIcon name="arrow-left" class="h-4 w-4" />
        </button>
        <!-- The doctype's own icon (no tile/background behind it - just the
        glyph), title on top (the form this is), the record's own ID
        underneath - same hierarchy as the read-only RecordView page's
        header. -->
        <LucideIcon :name="moduleItem?.icon || 'file-text'" class="h-10 w-10 flex-shrink-0 text-forest-700 dark:text-forest-300" />
        <div class="min-w-0 flex-1">
          <h1 class="truncate text-base font-bold text-navy-900 dark:text-gray-100 sm:text-lg">{{ t(formLabel) }}</h1>
          <p class="truncate text-sm font-medium text-gray-500 dark:text-gray-400">
            {{ isNew ? t('New {0}', [t(formLabel)]) : isTempName(name) ? t('New {0}', [t(formLabel)]) : name }}
          </p>
        </div>
        <!-- Desk's "Not Saved": stays until a save actually succeeds, so an
        edited form is never mistaken for a saved one. -->
        <span v-if="showNotSaved" :class="[ui.PILL, ui.TONE.amber, 'flex-shrink-0 !px-2.5 !py-1']">{{ t('Not saved') }}</span>
        <!-- Saved, but only on this phone so far (offline mode). -->
        <span v-else-if="values.__offline" :class="[ui.PILL, ui.TONE.blue, 'flex-shrink-0 gap-1 !px-2.5 !py-1']">
          <LucideIcon name="cloud-upload" class="h-3 w-3" />
          {{ t('Not synced') }}
        </span>
        <!-- Shared across Volunteer, Nurse and Doctor: a live glance at
        whether each Lab/Scan Investigation panel is done, without needing
        to open rows that Volunteer can't even see. -->
        <button
          v-if="showInvestigationStatusButton"
          type="button"
          :class="[ui.BTN_SECONDARY, 'flex-shrink-0 !px-2.5']"
          :aria-label="t('Investigation Status')"
          @click="openInvestigationStatus"
        >
          <LucideIcon name="flask-conical" class="h-4 w-4" />
        </button>

        <button
          v-if="canPrint"
          type="button"
          :class="[ui.BTN_SECONDARY, 'flex-shrink-0 !px-2.5']"
          :aria-label="t('Print')"
          @click="printOpen = true"
        >
          <LucideIcon name="printer" class="h-4 w-4" />
        </button>

        <!-- Desk's "..." menu: Delete lives here, not as a button beside
        Save, so it can't be tapped by mistake. Only shown to people whose
        role may delete this record. -->
        <ToolbarMenu v-if="canDelete" :label="t('More actions')" icon="ellipsis" icon-only align="right" width="sm:w-48" class="flex-shrink-0">
          <template #default="{ close }">
            <button
              type="button"
              class="flex w-full items-center gap-2 rounded-md px-2 py-2.5 text-left text-sm font-medium text-red-700 hover:bg-red-50 dark:text-red-300 dark:hover:bg-red-900/30 sm:py-1.5"
              @click="close(); confirmDelete = true"
            >
              <LucideIcon name="trash-2" class="h-4 w-4" />
              {{ t('Delete') }}
            </button>
          </template>
        </ToolbarMenu>
        <button type="button" :class="[ui.BTN_PRIMARY, 'flex-shrink-0']" :disabled="saving" @click="save">
          <LucideIcon :name="saving ? 'loader-circle' : 'check'" class="h-4 w-4" :class="{ 'animate-spin': saving }" />
          {{ t('Save') }}
        </button>
        </div>
      </div>

      <Dialog v-model="confirmDelete" :options="{ title: t('Delete {0}?', [name]), size: 'sm' }">
        <template #body-content>
          <p class="text-sm text-gray-600 dark:text-gray-300">
            {{ t('This permanently deletes this {0} record. It cannot be undone.', [t(formLabel)]) }}
          </p>
        </template>
        <template #actions>
          <div class="flex justify-end gap-2">
            <button type="button" :class="ui.BTN_SECONDARY" :disabled="deleting" @click="confirmDelete = false">{{ t('Cancel') }}</button>
            <button
              type="button"
              class="inline-flex h-9 items-center gap-1.5 rounded-lg bg-red-600 px-3 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-60"
              :disabled="deleting"
              @click="deleteRecord"
            >
              <LucideIcon :name="deleting ? 'loader-circle' : 'trash-2'" class="h-4 w-4" :class="{ 'animate-spin': deleting }" />
              {{ t('Delete') }}
            </button>
          </div>
        </template>
      </Dialog>

      <PrintPreviewDialog
        v-if="canPrint"
        v-model="printOpen"
        :doctype="doctype"
        :docname="name"
        :print-format="printFormat"
        :title="t(formLabel)"
      />

      <Dialog v-model="investigationStatusDialog" :options="{ title: t('Investigation Status'), size: '5xl' }">
        <template #body-header>
          <div
            class="-mx-4 -mt-5 mb-6 grid grid-cols-[1fr_auto_1fr] items-center gap-3 rounded-t-xl bg-gradient-to-r from-navy-50 via-white to-forest-50 px-4 py-4 sm:-mx-6 sm:px-6 dark:from-navy-900/40 dark:via-gray-900 dark:to-forest-900/30"
          >
            <span class="hidden sm:block" />
            <h3 class="justify-self-center text-center text-2xl font-bold tracking-tight text-navy-900 dark:text-gray-100">
              {{ t('Investigation Status') }}
            </h3>
            <div class="flex items-center justify-end gap-2">
              <button
                type="button"
                :class="[ui.BTN_PRIMARY, '!h-8 !px-2 sm:!px-3']"
                :disabled="investigationStatusLoading"
                :aria-label="t('Export')"
                :title="t('Export')"
                @click="exportInvestigationStatus"
              >
                <LucideIcon name="download" class="h-4 w-4" />
                <span class="hidden sm:inline">{{ t('Export') }}</span>
              </button>
              <button
                type="button"
                :class="[ui.BTN_SECONDARY, '!h-8 !w-8 !px-0']"
                :aria-label="t('Close')"
                @click="investigationStatusDialog = false"
              >
                <LucideIcon name="x" class="h-4 w-4" />
              </button>
            </div>
          </div>
        </template>
        <template #body-content>
          <Skeleton v-if="investigationStatusLoading" height="4rem" />
          <div v-else class="grid grid-cols-1 gap-x-8 gap-y-5 sm:grid-cols-2">
            <div
              v-for="section in investigationStatusSections"
              :key="section.key"
              class="rounded-lg bg-gray-50/60 px-3 py-2.5 dark:bg-gray-800/30"
            >
              <p class="mb-1 text-sm font-bold uppercase tracking-wide" :class="investigationSectionClass(section)">{{ t(section.title) }}</p>
              <p v-if="!section.rows.length" class="py-2 text-sm text-gray-400 dark:text-gray-500">{{ t('Nothing recorded yet.') }}</p>
              <ul v-else class="divide-y divide-gray-100 text-sm dark:divide-gray-800">
                <li v-for="row in section.rows" :key="row.key || row.label" class="py-2">
                  <button
                    type="button"
                    class="flex w-full items-start justify-between gap-3 text-left"
                    :class="{ 'cursor-default': !canExpandInvestigationRow(row) }"
                    @click="canExpandInvestigationRow(row) && toggleInvestigationRow(section.key, row.key || row.label)"
                  >
                    <span class="inline-flex items-center gap-1 font-medium text-navy-900 dark:text-gray-100">
                      {{ t(row.label) }}
                      <LucideIcon
                        v-if="canExpandInvestigationRow(row)"
                        :name="expandedInvestigationRows.has(`${section.key}:${row.key || row.label}`) ? 'chevron-up' : 'chevron-down'"
                        class="h-3.5 w-3.5 text-gray-400"
                      />
                    </span>
                    <span v-if="row.status === 'Completed'" class="text-right text-forest-700 dark:text-forest-300">
                      {{ t('Completed by {0}', [row.filled_by]) }}
                    </span>
                    <span v-else-if="row.status === 'Not Yet Due'" class="text-right text-gray-400 dark:text-gray-500">{{ t('Not yet due') }}</span>
                    <span v-else class="text-right text-amber-700 dark:text-amber-400">{{ t('Pending') }}</span>
                  </button>
                  <div
                    v-if="canExpandInvestigationRow(row) && expandedInvestigationRows.has(`${section.key}:${row.key || row.label}`)"
                    class="mt-1.5 space-y-1 pl-1 text-xs text-gray-600 dark:text-gray-400"
                  >
                    <div v-for="v in row.values" :key="v.label" class="flex justify-between gap-3">
                      <span>{{ t(v.label) }}</span>
                      <span class="font-medium text-navy-900 dark:text-gray-100">{{ v.value }}</span>
                    </div>
                  </div>
                </li>
              </ul>
            </div>
          </div>
        </template>
      </Dialog>

      <div
        v-if="(metaResource.loading && !metaResource.data) || (!isNew && existingDoc.loading && !existingDoc.doc)"
        :class="[ui.CARD, 'grid grid-cols-1 gap-x-6 gap-y-5 p-4 sm:grid-cols-2 sm:p-6']"
      >
        <div v-for="i in 8" :key="i" class="space-y-1.5">
          <Skeleton width="30%" height="0.75rem" />
          <Skeleton height="2.25rem" />
        </div>
      </div>
      <ErrorMessage v-else-if="metaResource.error" :message="metaResource.error" />

      <form v-else class="space-y-5" @submit.prevent="save">
        <!-- Why the last save failed - at the top, where it's seen (it used
        to sit under a long form, off screen). -->
        <div v-if="saveError" ref="saveErrorBox" class="scroll-mt-24">
          <ErrorMessage :message="saveError" />
        </div>

        <DocConnections v-if="!isNew && name && isGenericRoute" :doctype="doctype" :name="name" :refresh-key="activityKey" />

        <!-- Desk's layout, in its own skin rather than Desk's plain white
        boxes: one card per section (Section / Tab Break), each with a
        colored header band + icon badge (alternating the brand's two
        colors, like Home's cards and the read-only RecordView page) instead
        of a bare heading - collapsible ones closed until tapped, each table
        inside the section it belongs to and Heading fields as sub-headings.
        Sections whose fields are all hidden by conditions disappear, as in
        Desk. Inside a card: Desk's own Column Break positions become real
        grid columns (not an auto-flowing CSS column layout, which filled
        columns by vertical space and scrambled which fields Desk actually
        grouped together) - on a phone every block still stacks to one
        column. -->
        <section
          v-for="(sec, sectionIndex) in formSections"
          :key="sec.key"
          :class="[ui.CARD, 'overflow-hidden !shadow-md']"
        >
          <button
            v-if="sec.label && sec.collapsible"
            type="button"
            class="flex w-full items-center gap-3 px-4 py-3 text-left sm:px-6"
            :class="ui.sectionHeadAt(sectionIndex).bar"
            :aria-expanded="openSections.has(sec.key)"
            @click="toggleSection(sec.key)"
          >
            <span :class="sectionIconTileClass(sectionIndex)">
              <LucideIcon :name="sectionIconAt(sectionIndex)" class="h-4 w-4" />
            </span>
            <h2 class="flex-1 truncate text-sm font-bold" :class="ui.sectionHeadAt(sectionIndex).text">{{ t(sec.label) }}</h2>
            <LucideIcon :name="openSections.has(sec.key) ? 'chevron-up' : 'chevron-down'" class="h-4 w-4 flex-shrink-0 text-gray-400" />
          </button>
          <h2
            v-else-if="sec.label"
            class="flex items-center gap-3 px-4 py-3 text-sm font-bold sm:px-6"
            :class="[ui.sectionHeadAt(sectionIndex).bar, ui.sectionHeadAt(sectionIndex).text]"
          >
            <span :class="sectionIconTileClass(sectionIndex)">
              <LucideIcon :name="sectionIconAt(sectionIndex)" class="h-4 w-4" />
            </span>
            {{ t(sec.label) }}
          </h2>

          <div
            v-show="!sec.collapsible || openSections.has(sec.key)"
            class="space-y-5 p-4 sm:p-6"
            :class="{ 'pt-4': sec.label }"
          >
            <template v-for="block in sec.blocks" :key="block.key || block">
              <div v-if="block.kind === 'table'" class="min-w-0" :data-fieldname="block.key">
                <ChildTable
                  :field="block.field"
                  :parent-doc="values"
                  :doctype="doctype"
                  :link-query-for="(fieldname, row) => linkQueryFor(fieldname, row, block.field.fieldname)"
                  :row-class="(row) => rowClassFor(block.field.fieldname, row)"
                  v-model="values[block.field.fieldname]"
                  @row-added="(row, idx) => onRowAdded(block.field.fieldname, row, idx)"
                  @rows-removed="(rows) => onRowsRemoved(block.field.fieldname, rows)"
                />
              </div>
              <!-- A columns block: Desk's own column split, preserved as
              real grid columns, each filled top-to-bottom like Desk's - a
              Heading or HTML item just sits in its own column's stack,
              same as a further-down heading (e.g. "NT Scan" under "Dating
              Ultrasounds") staying paired with whatever's alongside it.
              Each column stacks its own items independently (not locked to
              a shared row per item) - a tall field (a textarea) in one
              column then only makes that column taller, instead of forcing
              blank space into the other. -->
              <div
                v-else
                class="grid grid-cols-1 gap-x-6 gap-y-5 sm:[grid-template-columns:repeat(var(--form-cols),minmax(0,1fr))]"
                :style="{ '--form-cols': block.columns.length }"
              >
                <div v-for="(col, ci) in block.columns" :key="ci" class="min-w-0 space-y-5">
                  <template v-for="item in col" :key="item.key">
                    <h3
                      v-if="item.kind === 'heading'"
                      class="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400"
                    >
                      {{ t(item.label) }}
                    </h3>
                    <div
                      v-else-if="item.kind === 'html'"
                      class="rounded-lg bg-gray-50 p-4 text-sm leading-relaxed text-gray-800 dark:bg-gray-800/60 dark:text-gray-200 [&_hr]:my-3 [&_hr]:border-gray-200 [&_p+p]:mt-3 [&_strong]:font-semibold"
                      :data-fieldname="item.key"
                      v-html="item.html"
                    />
                    <!-- A run of Check fields under its heading: one per line
                    as in Desk, or a compact 2-up grid where Desk packs them
                    onto the same rows (e.g. "Pregnancy Assessment"). -->
                    <div v-else-if="item.kind === 'checkboxGroup'">
                      <h3 v-if="item.heading" class="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                        {{ t(item.heading) }}
                      </h3>
                      <div class="grid gap-x-4 gap-y-2" :class="item.stacked ? 'grid-cols-1' : 'grid-cols-2'">
                        <div v-for="sub in item.items" :key="sub.key" :data-fieldname="sub.key" :class="fieldClassFor(sub.field.fieldname)">
                          <DynamicField
                            :field="sub.field"
                            :doctype="doctype"
                            :docname="isNew ? null : name"
                            :doc="values"
                            v-model="values[sub.field.fieldname]"
                          />
                        </div>
                      </div>
                    </div>
                    <div v-else :data-fieldname="item.key" :class="fieldClassFor(item.field.fieldname)">
                      <DynamicField
                        :field="item.field"
                        :doctype="doctype"
                        :docname="isNew ? null : name"
                        :doc="values"
                        :link-query="item.field.fieldtype === 'Link' ? linkQueryFor(item.field.fieldname) : null"
                        v-model="values[item.field.fieldname]"
                      />
                    </div>
                  </template>
                </div>
              </div>
            </template>
          </div>
        </section>

        <DocActivity v-if="!isNew && name && !isLocalName(name) && offlineState.online" :doctype="doctype" :name="name" :refresh-key="activityKey" />
      </form>
    </div>
  </AppLayout>
</template>

<script setup>
import { computed, nextTick, reactive, ref, watch, watchEffect } from 'vue'
import { onBeforeRouteLeave, onBeforeRouteUpdate, useRoute, useRouter } from 'vue-router'
import { onKeyStroke, useEventListener } from '@vueuse/core'
import { useDoc, useNewDoc, call, Dialog, ErrorMessage, toast } from 'frappe-ui'
import ToolbarMenu from '@/components/ToolbarMenu.vue'
import PrintPreviewDialog from '@/components/PrintPreviewDialog.vue'
import { printFormatFor } from '@/data/printFormats.js'
import AppLayout from '@/layouts/AppLayout.vue'
import Skeleton from '@/components/Skeleton.vue'
import DynamicField from '@/components/DynamicField.vue'
import ChildTable from '@/components/ChildTable.vue'
import DocConnections from '@/components/DocConnections.vue'
import DocActivity from '@/components/DocActivity.vue'
import { formCrumbs, findParentRecord } from '@/data/breadcrumbs'
import LucideIcon from '@/components/LucideIcon.vue'
import { findModuleByRoute } from '@/data/modules'
import * as ui from '@/data/ui'
import { useMeta, useFormFields, useTableFields } from '@/data/useMeta'
import { visibleFieldnames, withLiveRequired } from '@/data/dependsOn'
import { buildFormSections, sectionHasField } from '@/data/formSections'
import { applyDefaults } from '@/data/defaults'
import { rowKey } from '@/data/rowKey'
import { isPhoneField, warnIfNotDigits } from '@/doctype-hooks/utils'
import { getDoctypeHooks } from '@/doctype-hooks'
import { setPageTitle, setPageCrumbs } from '@/data/pageTitle'
import { dataCollectorResource } from '@/data/dataCollector'
import { t } from '@/data/i18n'
import { offlineState } from '@/data/offline/state'
import { getRecord, isLocalName, isTempName } from '@/data/offline/store'

const { doctype, isNew, name } = defineProps({
  doctype: { type: String, required: true },
  isNew: { type: Boolean, default: false },
  name: { type: String, default: null },
})

const route = useRoute()
const router = useRouter()

// Mirrors DoctypeList.vue's routing: generic /:doctypeRoute doctypes use the
// shared DoctypeList route name, dedicated doctypes (e.g. Email Account)
// have their own List route name derived the same way.
const isGenericRoute = route.name === 'DoctypeNew' || route.name === 'DoctypeForm'

// Back = wherever the user actually came from (the household they opened
// this family member from, a filtered list, Work Orders ...). Opened
// directly (bookmark, new tab, after "Create"), there's no history to go
// back to, so fall back to the parent record if there is one, else the list.
function goBack() {
  if (window.history.state?.back) {
    router.back()
    return
  }
  if (isGenericRoute) {
    const parent = findParentRecord(findModuleByRoute(route.params.doctypeRoute) || {}, values)
    if (parent) {
      router.push({ name: 'DoctypeForm', params: { doctypeRoute: parent.parent.route, name: parent.value } })
    } else {
      router.push({ name: 'DoctypeList', params: { doctypeRoute: route.params.doctypeRoute } })
    }
  } else {
    router.push({ name: route.name.replace('New', 'List').replace('Form', 'List') })
  }
}

const metaResource = useMeta(doctype)

// The form's own name for the header ("Pregnancy Registration") - the app
// item's label where there is one, else the DocType itself.
// Recomputed as `values` loads / changes, so the parent crumb appears once
// the record (or a prefilled link on a new one) is in.
const crumbs = computed(() => formCrumbs(route.params.doctypeRoute, name, values, isNew))

const moduleItem = computed(() => findModuleByRoute(route.params.doctypeRoute))
const formLabel = computed(() => moduleItem.value?.label || metaResource.data?.name || doctype)
const fields = useFormFields(metaResource)
const tableFields = useTableFields(metaResource)
const hooks = getDoctypeHooks(doctype)

watchEffect(() => {
  setPageTitle(isNew ? t('New {0}', [t(metaResource.data?.name || doctype)]) : name)
})

const newDoc = isNew ? useNewDoc(doctype) : null
const existingDoc = isNew ? null : useDoc({ doctype, name })

// `values` is the single source of truth the form binds to - a plain
// reactive object kept in sync with newDoc.doc / existingDoc.doc below,
// rather than binding the form directly to either, so both code paths
// (new vs. existing) look identical to DynamicField/ChildTable and to the
// doctype-hooks diffing below.
const values = reactive({})

// --- Desk conditions ---------------------------------------------------
// What the form shows right now: fields, tables and sections whose
// depends_on holds for the current values (e.g. the high-risk factors only
// once "identified as high risk?" is Yes), with mandatory_depends_on shown
// as required. Hidden fields keep their values, as in Desk.
const visibleNames = computed(() => visibleFieldnames(metaResource.data?.fields, values))
const visibleFormFields = computed(() =>
  fields.value.filter((f) => visibleNames.value.has(f.fieldname)).map((f) => withLiveRequired(f, values)),
)
const visibleTableFields = computed(() =>
  tableFields.value.filter((f) => visibleNames.value.has(f.fieldname)).map((f) => withLiveRequired(f, values)),
)

// The form as Desk lays it out: sections in meta order, each with the
// visible fields, tables and headings that follow its Section / Tab Break,
// and Desk's own Column Break positions preserved as real column groups
// (see data/formSections.js, shared with ChildTable.vue's row dialog).
const formSections = computed(() => {
  const formByName = new Map(visibleFormFields.value.map((f) => [f.fieldname, f]))
  const tableByName = new Map(visibleTableFields.value.map((f) => [f.fieldname, f]))
  return buildFormSections(metaResource.data?.fields, { formByName, tableByName, visibleNames: visibleNames.value })
})

// Collapsible sections start closed, as in Desk.
const openSections = reactive(new Set())
function toggleSection(key) {
  if (openSections.has(key)) openSections.delete(key)
  else openSections.add(key)
}

// Section card header badges: a small, varied set of neutral icons (not
// meaning colours - see ui.js's colour rules) so the cards don't all read
// identically, cycled independently of the 2-tone bar/text colour
// alternation (ui.sectionHeadAt) so two adjacent same-tone sections still
// look distinct from each other.
const SECTION_ICONS = ['clipboard-list', 'layers', 'list-checks', 'folder-open']
function sectionIconAt(index) {
  return SECTION_ICONS[index % SECTION_ICONS.length]
}
function sectionIconTileClass(index) {
  const forest = index % 2 === 0
  return `flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full text-white ${
    forest ? 'bg-forest-600 dark:bg-forest-500' : 'bg-navy-600 dark:bg-navy-500'
  }`
}

// --- "Not saved" -------------------------------------------------------
// A copy of the record as last loaded / saved; any visible field or child
// row that differs from it means unsaved edits. Compared loosely (null, ''
// and a missing key are all "empty"; 0 / false and 1 / true match) so a
// control normalising an untouched value doesn't count as an edit.
let savedState = null
const savedVersion = ref(0) // bumped when savedState is replaced, to recompute
const clone = (v) => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)))
const norm = (v) => (v == null ? '' : typeof v === 'boolean' ? String(Number(v)) : String(v))
const sameValue = (a, b) => norm(a) === norm(b)
// Bookkeeping Frappe adds to child rows - not something the user edited.
const ROW_META = new Set(['name', 'owner', 'creation', 'modified', 'modified_by', 'docstatus', 'idx', 'parent', 'parentfield', 'parenttype', 'doctype'])

function sameRows(a = [], b = []) {
  if ((a || []).length !== (b || []).length) return false
  return (a || []).every((row, i) => {
    const other = b[i] || {}
    const keys = new Set([...Object.keys(row), ...Object.keys(other)])
    return [...keys].every((k) => ROW_META.has(k) || k.startsWith('__') || sameValue(row[k], other[k]))
  })
}

function markSaved() {
  savedState = clone(values)
  savedVersion.value++
}

const isDirty = computed(() => {
  savedVersion.value // eslint-disable-line no-unused-expressions
  if (!savedState) return false
  return (
    fields.value.some((f) => !sameValue(values[f.fieldname], savedState[f.fieldname])) ||
    tableFields.value.some((f) => !sameRows(values[f.fieldname], savedState[f.fieldname]))
  )
})
// A new entry isn't saved at all yet, like Desk shows it.
const showNotSaved = computed(() => isNew || isDirty.value)

// Leaving with unsaved edits asks first - in the app (back, sidebar,
// breadcrumb) and when closing / reloading the tab.
let skipLeaveCheck = false
function confirmLeave() {
  if (skipLeaveCheck || !isDirty.value) return true
  return window.confirm(t('You have unsaved changes. Leave without saving?'))
}
onBeforeRouteLeave(confirmLeave)
onBeforeRouteUpdate(confirmLeave)
useEventListener(window, 'beforeunload', (e) => {
  if (!isDirty.value) return
  e.preventDefault()
  e.returnValue = ''
})

// Every value field of the record, hidden ones included: Desk scripts react
// to hidden fields too (e.g. PNC's high_risk, set from a visit row).
const VALUE_SKIP = new Set(['Section Break', 'Column Break', 'Tab Break', 'HTML', 'Heading', 'Button', 'Table'])
const valueFieldnames = computed(() =>
  (metaResource.data?.fields || []).filter((f) => !VALUE_SKIP.has(f.fieldtype)).map((f) => f.fieldname),
)

function scalarSnapshot() {
  const snap = {}
  for (const name of valueFieldnames.value) snap[name] = values[name]
  return snap
}

// { tableField: Map(rowKey -> copy of the row) }
function childRowsSnapshot() {
  const snap = {}
  for (const f of tableFields.value) {
    snap[f.fieldname] = new Map((values[f.fieldname] || []).map((row) => [rowKey(row), { ...row }]))
  }
  return snap
}

// What a hook module gets besides the values - the Desk equivalents of
// frappe.call, the doctype's fields (frm.meta) and msgprint.
function hookCtx() {
  return {
    isNew,
    call,
    toast,
    meta: metaResource.data,
    getField: (fieldname) => metaResource.data?.fields.find((f) => f.fieldname === fieldname),
  }
}

// --- Hook wiring state -----------------------------------------------
// doctype-hooks reimplements frappe.ui.form.on(...) client scripts, which
// don't exist in this Vue app. There's no field-level @change event to hook
// into generically (DynamicField/ChildTable are metadata-driven, not aware
// of business logic) - so instead this diffs `values` against its last-seen
// snapshot on every reactive tick, and calls the matching hook for whatever
// changed. A fixed-point loop re-diffs after each hook call (up to 20
// iterations) so a hook-triggered change (e.g. setting date_of_birth) can
// itself cascade into another hook (age, in turn, from date_of_birth).
let lastScalarSnapshot = null
let lastChildSnapshot = null
let applyingHookChange = false

function initSnapshots() {
  lastScalarSnapshot = scalarSnapshot()
  lastChildSnapshot = childRowsSnapshot()
}

function runScalarDiffLoop() {
  if (applyingHookChange) return
  // Desk's phone check, on every form - including ones with no hook module.
  if (!hooks?.onFieldChange) {
    const current = scalarSnapshot()
    for (const k of Object.keys(current)) {
      if (current[k] !== lastScalarSnapshot[k] && isPhoneField(hookCtx().getField(k))) warnIfNotDigits(current[k])
    }
    lastScalarSnapshot = current
    return
  }
  applyingHookChange = true
  try {
    for (let i = 0; i < 20; i++) {
      const current = scalarSnapshot()
      // Every field that changed, not just the first: one link fetch fills
      // several at once (name, village, DOB, phone) and each needs its event.
      const changed = Object.keys(current).filter((k) => current[k] !== lastScalarSnapshot[k])
      if (!changed.length) break
      lastScalarSnapshot = current
      for (const fieldname of changed) {
        if (isPhoneField(hookCtx().getField(fieldname))) warnIfNotDigits(values[fieldname])
        hooks.onFieldChange(fieldname, values, hookCtx())
      }
    }
    lastScalarSnapshot = scalarSnapshot()
  } finally {
    applyingHookChange = false
  }
}

// Rows are matched by key, not position, and every changed field is
// reported with the *live* row - a hook that sets a value on the row (a
// classification, a BMI) now changes the form, not a throwaway copy.
// Added / removed rows are reported by ChildTable itself (see below).
function runChildDiff() {
  if (!hooks?.onChildFieldChange || applyingHookChange) {
    lastChildSnapshot = childRowsSnapshot()
    return
  }
  applyingHookChange = true
  try {
    for (const tableField of tableFields.value) {
      const fieldname = tableField.fieldname
      const lastRows = lastChildSnapshot?.[fieldname] || new Map()
      for (const row of values[fieldname] || []) {
        const lastRow = lastRows.get(rowKey(row))
        if (!lastRow) continue
        const keys = new Set([...Object.keys(row), ...Object.keys(lastRow)])
        for (const k of keys) {
          if (row[k] !== lastRow[k]) hooks.onChildFieldChange(fieldname, k, row, values, hookCtx())
        }
      }
    }
  } finally {
    // Taken after the hooks ran, so their own changes don't echo back.
    lastChildSnapshot = childRowsSnapshot()
    lastScalarSnapshot = scalarSnapshot()
    applyingHookChange = false
  }
}

watch(
  () => [scalarSnapshot(), childRowsSnapshot()],
  () => {
    if (applyingHookChange || !lastScalarSnapshot) return
    runScalarDiffLoop()
    runChildDiff()
  },
  { deep: true },
)

// Desk's <table>_add / <table>_remove events, raised by ChildTable.
function onRowAdded(tableField, row, idx) {
  if (!hooks?.onChildRowAdd) return
  applyingHookChange = true
  try {
    hooks.onChildRowAdd(tableField, row, idx, values, hookCtx())
  } finally {
    lastChildSnapshot = childRowsSnapshot()
    lastScalarSnapshot = scalarSnapshot()
    applyingHookChange = false
  }
}

function onRowsRemoved(tableField, removed) {
  if (!hooks?.onChildRowRemove) return
  applyingHookChange = true
  try {
    hooks.onChildRowRemove(tableField, removed, values, hookCtx())
  } finally {
    lastChildSnapshot = childRowsSnapshot()
    lastScalarSnapshot = scalarSnapshot()
    applyingHookChange = false
  }
}

// Desk's set_query, row highlighting and alert-field styling, from the
// doctype's hook module.
function linkQueryFor(fieldname, row = null, tableField = null) {
  return hooks?.getLinkQuery?.(fieldname, values, { row, tableField }) || null
}
function rowClassFor(tableField, row) {
  return hooks?.rowClass?.(tableField, row, values) || ''
}

function fieldClassFor(fieldname) {
  return hooks?.fieldClass?.(fieldname, values) || ''
}

// Any doctype whose form has a health_worker_name ("Data Collector") field
// defaults it to the logged-in user's own Health Worker record on a new
// entry - Administrator included (one is created for a user who has none) -
// generic, so it applies across every doctype that has the field without
// each one needing its own hook for this. Guarded on the field still being
// empty so it never overwrites a value a doctype-specific hook (or the
// user) has already set.
function applyCurrentHealthWorkerDefault() {
  if (!isNew) return
  if (!fields.value.some((f) => f.fieldname === 'health_worker_name')) return
  if (values.health_worker_name) return
  const healthWorker = dataCollectorResource.data
  if (healthWorker) {
    values.health_worker_name = healthWorker
    // A default, not an edit - it may arrive after the form has loaded.
    if (savedState) savedState.health_worker_name = healthWorker
  }
}

watch(() => dataCollectorResource.data, applyCurrentHealthWorkerDefault)

// --- Prefill from the URL ----------------------------------------------
// A new entry opened from a record's Connections panel (or a list filtered
// to one record) arrives as e.g. ?familymember_id=FM-00064 - start it
// linked to that record. Only real fields of this DocType are honoured,
// and never over a value something else already set.
function applyQueryPrefill() {
  if (!isNew || !metaResource.data) return
  for (const [key, value] of Object.entries(route.query)) {
    if (typeof value !== 'string' || !value || values[key]) continue
    if (metaResource.data.fields.some((f) => f.fieldname === key)) {
      values[key] = value
      if (savedState) savedState[key] = value
    }
  }
}

// Desk's field defaults on a new record ("Today", "Pending", 0 ...) - see
// data/defaults.js. Applied after the URL prefill so a prefilled value
// wins, and counted as the starting state, not as an edit.
// Once only: the load watcher re-runs whenever the new doc's child rows
// change, and a box the user emptied on purpose mustn't refill itself.
let defaultsApplied = false
function applyNewDocDefaults() {
  if (!isNew || !metaResource.data || defaultsApplied) return
  defaultsApplied = true
  const before = { ...values }
  applyDefaults(metaResource.data.fields, values)
  if (savedState) {
    for (const key of Object.keys(values)) if (before[key] !== values[key]) savedState[key] = clone(values[key])
  }
}

watch(
  () => metaResource.data,
  () => {
    // The Data Collector default needs the form's fields - when the meta is
    // the last thing to arrive, this is the only pass that can fill it.
    applyCurrentHealthWorkerDefault()
    applyQueryPrefill()
    applyNewDocDefaults()
  },
)

// --- fetch_from --------------------------------------------------------
// Desk fills "fetch from" fields (e.g. a Family Member's name / village /
// HHID onto a Pregnancy Registration) the moment the Link they come from
// is set; this Vue form had no equivalent, so a linked record looked half
// empty until saved. Same rules as Desk: refetch whenever the Link changes,
// skip targets marked fetch_if_empty that already have a value, and clear
// targets when the Link is cleared. Built from all of the meta's fields,
// not just the visible ones, so hidden fetched fields are kept in step too.
const fetchFromMap = computed(() => {
  const map = {}
  for (const f of metaResource.data?.fields || []) {
    if (!f.fetch_from) continue
    const [linkField, source] = f.fetch_from.split('.')
    if (!linkField || !source) continue
    ;(map[linkField] ||= []).push({ target: f.fieldname, source, ifEmpty: !!f.fetch_if_empty })
  }
  return map
})

// Link values the fetched fields were last filled from. A Link only seen
// for the first time is adopted as-is on an existing doc (its fetched
// values are already saved), but treated as "was empty" on a new doc so a
// prefilled Link still triggers its fetch.
let lastLinkValues = {}
const fetchSeq = {}

async function fetchLinkedValues(linkFieldname, value) {
  const linkField = metaResource.data?.fields.find((f) => f.fieldname === linkFieldname)
  const targets = fetchFromMap.value[linkFieldname] || []
  if (!linkField || linkField.fieldtype !== 'Link' || !linkField.options || !targets.length) return

  // A fetched value never triggers a fetch of its own: re-baselining any
  // target that's itself a Link stops chains like Palliative care
  // followup's pcid -> hhid -> pcid (hhid.members_added) from fetching
  // pcid's own link value back out from under it.
  const setFetched = (target, newValue) => {
    values[target] = newValue
    // A fetched value follows its Link: if the Link itself is unchanged
    // (e.g. prefilled on a new entry), what it fetched isn't a user edit.
    if (savedState && sameValue(values[linkFieldname], savedState[linkFieldname])) savedState[target] = clone(newValue)
    if (target in fetchFromMap.value) lastLinkValues[target] = newValue ?? null
  }

  const seq = (fetchSeq[linkFieldname] = (fetchSeq[linkFieldname] || 0) + 1)
  if (!value) {
    for (const t of targets) if (!t.ifEmpty) setFetched(t.target, null)
    return
  }
  try {
    const linked = await call('frappe.client.get_value', {
      doctype: linkField.options,
      filters: value,
      fieldname: [...new Set(targets.map((t) => t.source))],
    })
    // Dropped if the Link changed again while this was in flight.
    if (seq !== fetchSeq[linkFieldname] || values[linkFieldname] !== value) return
    for (const t of targets) {
      if (t.ifEmpty && values[t.target]) continue
      setFetched(t.target, linked?.[t.source] ?? null)
    }
  } catch (e) {
    // Unreadable/missing linked record - leave the fields for the server's
    // own fetch-on-save (or the user) rather than blocking the form.
    console.warn(`Could not fetch values for ${linkFieldname}`, e)
  }
}

watch(
  () => Object.keys(fetchFromMap.value).map((k) => [k, values[k] ?? null]),
  (pairs) => {
    for (const [k, current] of pairs) {
      if (!(k in lastLinkValues)) lastLinkValues[k] = isNew ? null : current
      if (current === lastLinkValues[k]) continue
      lastLinkValues[k] = current
      fetchLinkedValues(k, current)
    }
  },
)

let afterLoadDone = false

// --- Load doc into `values` -------------------------------------------
watch(
  () => (isNew ? newDoc?.doc : existingDoc?.doc),
  (doc) => {
    if (!doc) return
    Object.keys(doc).forEach((k) => {
      values[k] = doc[k]
    })
    // Values just loaded from the server are already in step with their
    // Links - re-baseline so loading/saving never triggers a refetch.
    lastLinkValues = isNew
      ? {}
      : Object.fromEntries(Object.keys(fetchFromMap.value).map((k) => [k, values[k] ?? null]))
    initSnapshots()
    if (isNew && hooks?.onLoad) {
      applyingHookChange = true
      hooks.onLoad(values, hookCtx())
      applyingHookChange = false
      initSnapshots()
    }
    applyCurrentHealthWorkerDefault()
    applyQueryPrefill()
    applyNewDocDefaults()
    // First load only: later passes are this same doc echoing edits (child
    // tables share their arrays with it) or a save, which re-marks itself.
    if (!savedState) {
      markSaved()
      runAfterLoad()
    }
  },
  { immediate: true, deep: true },
)

// Desk's refresh: runs when the form opens - new or saved record - and
// again after each save (e.g. build an empty visit schedule, as Desk does on
// opening a Child 6w-1y record). Needs both the record and its meta, which
// arrive in either order. Anything it changes shows as "Not saved", as in
// Desk. (Its flag is declared before the load watcher, which runs at once.)
function runAfterLoad() {
  if (afterLoadDone || !savedState || !metaResource.data || !hooks?.onAfterLoad) return
  afterLoadDone = true
  applyingHookChange = true
  try {
    hooks.onAfterLoad(values, hookCtx())
  } finally {
    initSnapshots()
    applyingHookChange = false
  }
}
watch(() => metaResource.data, runAfterLoad)

const saving = ref(false)
// Bumped after each save so the Activity section picks up the new edit.
const activityKey = ref(0)
const saveError = ref(null)

// frappe-ui's save calls don't throw when the server refuses a save (a
// required field empty, a permission, a validation in the DocType): they
// resolve with nothing and leave the reason on `.error`. Without checking,
// an edit "succeeded" with a false "Saved", and a failed create crashed on
// `created.name` and lost the real reason. So: check, and say clearly
// either way - toast for both, plus the error box at the top of the form.
function saveErrorText(e) {
  const messages = e?.messages?.length ? e.messages : [e?.message || String(e || '')]
  // Server messages can carry HTML (<b>GBLAD</b>) - toasts show plain text.
  const text = messages.map((m) => String(m).replace(/<[^>]*>/g, '')).join(' ').trim()
  return text || t('The record could not be saved.')
}

const saveErrorBox = ref(null)

// --- Print ---------------------------------------------------------------
// Only shown once this doctype has a real Print Format configured (see
// data/printFormats.js) and the record actually exists on the server - a
// record saved only on this phone (offline) has nothing there yet to render.
const printFormat = computed(() => printFormatFor(doctype))
const canPrint = computed(() => !isNew && !!name && !isLocalName(name) && !!printFormat.value)
const printOpen = ref(false)

// --- Delete ------------------------------------------------------------
// Asked of the server per record, so the menu matches the user's role
// (Role Permission Manager) - most CHW roles may not delete.
const canDelete = ref(false)
// A record that exists only on this phone has nothing on the server to
// delete - it's discarded from the Offline & Sync page instead.
if (!isNew && name && !isLocalName(name)) {
  call('frappe.client.has_permission', { doctype, docname: name, perm_type: 'delete' })
    .then((r) => (canDelete.value = !!r?.has_permission))
    .catch(() => (canDelete.value = false))
}

const confirmDelete = ref(false)
const deleting = ref(false)

// --- ANC Follow-up: Investigation Status --------------------------------
// One shared button for Volunteer, Nurse and Doctor alike - a live
// snapshot of every Lab Investigation (trimester-gated) and Scan
// Investigation (open at any time) panel, computed fresh from Nurse's and
// Doctor's rows every click (chw.common.doctype.anc_follow_up.
// anc_follow_up.get_investigation_summary). Nothing is stored just for
// this button; it's the same Status/Filled By/value fields already
// mirrored onto every Nurse/Doctor row, just read back in one place for
// whoever can't see those rows themselves (Volunteer) - a Completed row
// expands to its actual values on tap.
const showInvestigationStatusButton = computed(() => doctype === 'ANC Follow-up' && !isNew && !isLocalName(name))
const investigationStatusDialog = ref(false)
const investigationStatusLoading = ref(false)
const investigationSummary = ref({ trimester: [], scan: [], tt_status: [], risk: [] })
const expandedInvestigationRows = ref(new Set())

// Each section gets its own accent color - Risk in warning amber since it's
// the one that actually needs to stand out, the rest alternating the
// brand's two colors so the page reads as organized groups, not a wall of
// identical gray labels.
const investigationStatusSections = computed(() => [
  { key: 'trimester', title: 'Lab Investigations', rows: investigationSummary.value.trimester || [], color: 'navy' },
  { key: 'scan', title: 'Scan Investigations', rows: investigationSummary.value.scan || [], color: 'forest' },
  { key: 'tt_status', title: 'TT Status', rows: investigationSummary.value.tt_status || [], color: 'navy' },
  { key: 'risk', title: 'Risk', rows: investigationSummary.value.risk || [], color: 'amber' },
])

const INVESTIGATION_SECTION_COLOR_CLASSES = {
  navy: 'text-navy-800 dark:text-navy-200',
  forest: 'text-forest-800 dark:text-forest-200',
  amber: 'text-amber-800 dark:text-amber-300',
}
function investigationSectionClass(section) {
  return INVESTIGATION_SECTION_COLOR_CLASSES[section.color] || INVESTIGATION_SECTION_COLOR_CLASSES.navy
}

function canExpandInvestigationRow(row) {
  return row.status === 'Completed' && (row.values || []).length > 0
}
function toggleInvestigationRow(sectionKey, label) {
  const key = `${sectionKey}:${label}`
  const next = new Set(expandedInvestigationRows.value)
  if (next.has(key)) next.delete(key)
  else next.add(key)
  expandedInvestigationRows.value = next
}

// A plain, printable copy of the summary in its own tab - the browser's own
// print dialog (Save as PDF works the same way) is what actually gets
// handed to or shown to the doctor, so there's no server round trip and it
// works offline too.
function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])
}

function investigationStatusRowLine(row) {
  const statusText =
    row.status === 'Completed'
      ? t('Completed by {0}', [row.filled_by])
      : row.status === 'Not Yet Due'
        ? t('Not yet due')
        : t('Pending')
  const valuesHtml = (row.values || [])
    .map((v) => `<div class="value-row"><span>${escapeHtml(v.label)}</span><b>${escapeHtml(v.value)}</b></div>`)
    .join('')
  return `
    <div class="row">
      <div class="row-head"><span>${escapeHtml(row.label)}</span><span>${escapeHtml(statusText)}</span></div>
      ${valuesHtml}
    </div>
  `
}

function exportInvestigationStatus() {
  const win = window.open('', '_blank')
  if (!win) return
  const sectionsHtml = investigationStatusSections.value
    .map(
      (section) => `
        <section>
          <h2>${escapeHtml(t(section.title))}</h2>
          ${section.rows.length ? section.rows.map(investigationStatusRowLine).join('') : `<p class="empty">${escapeHtml(t('Nothing recorded yet.'))}</p>`}
        </section>
      `,
    )
    .join('')

  win.document.write(`
    <!doctype html>
    <html>
      <head>
        <meta charset="utf-8" />
        <title>${escapeHtml(t('Investigation Status'))} - ${escapeHtml(name)}</title>
        <style>
          body { font-family: -apple-system, Helvetica, Arial, sans-serif; color: #111; padding: 24px; max-width: 800px; margin: 0 auto; }
          h1 { font-size: 20px; margin: 0 0 4px; }
          h2 { font-size: 15px; margin: 24px 0 8px; border-bottom: 1px solid #ddd; padding-bottom: 4px; }
          .row { padding: 6px 0; border-bottom: 1px solid #eee; }
          .row-head { display: flex; justify-content: space-between; gap: 12px; font-weight: 600; }
          .value-row { display: flex; justify-content: space-between; gap: 12px; padding: 2px 0 2px 14px; font-size: 13px; color: #444; }
          .empty { color: #888; font-size: 13px; padding: 6px 0; }
          @media print { body { padding: 0; } }
        </style>
      </head>
      <body>
        <h1>${escapeHtml(t('Investigation Status'))}</h1>
        <div>${escapeHtml(name)}</div>
        ${sectionsHtml}
      </body>
    </html>
  `)
  win.document.close()
  win.focus()
  win.print()
}

function openInvestigationStatus() {
  investigationStatusDialog.value = true
  investigationStatusLoading.value = true
  expandedInvestigationRows.value = new Set()
  call('chw.common.doctype.anc_follow_up.anc_follow_up.get_investigation_summary', { name })
    .then((r) => (investigationSummary.value = r || { trimester: [], scan: [], tt_status: [], risk: [] }))
    .catch(() => (investigationSummary.value = { trimester: [], scan: [], tt_status: [], risk: [] }))
    .finally(() => (investigationStatusLoading.value = false))
}

async function deleteRecord() {
  deleting.value = true
  try {
    await call('frappe.client.delete', { doctype, name })
  } catch (e) {
    // Most often "Cannot delete ... because it is linked with ..." - the
    // household still has members, the pregnancy still has follow-ups.
    confirmDelete.value = false
    toast.error(saveErrorText(e) || t('The record could not be deleted.'))
    return
  } finally {
    deleting.value = false
  }
  confirmDelete.value = false
  toast.success(t('Deleted {0}', [name]))
  // Gone - leaving can't lose anything, and Back would land on a page for
  // a record that no longer exists, so go to its list instead.
  skipLeaveCheck = true
  if (isGenericRoute) router.replace({ name: 'DoctypeList', params: { doctypeRoute: route.params.doctypeRoute } })
  else router.replace({ name: route.name.replace('Form', 'List') })
}

// --- Mandatory fields ----------------------------------------------------
// The server refuses a record with a required field empty. Online that
// refusal comes back at once; offline the record went into the Outbox and
// was only refused at sync, after the CHW had left the house. So the form
// checks first, by the server's own rule: every field marked mandatory
// (or required by its mandatory_depends_on), in the record and in each
// child row - except read-only fields filled from a Link (fetch_from), which
// the server fills itself on save.
const LAYOUT_TYPES = new Set(['Section Break', 'Column Break', 'Tab Break', 'HTML', 'Heading', 'Button', 'Image', 'Fold'])
const isBlank = (v) => v == null || (Array.isArray(v) ? v.length === 0 : String(v).replace(/<[^>]*>/g, '').trim() === '')
const serverFills = (f) => f.read_only && f.fetch_from

const childMetas = new Map()
function childMeta(childDoctype) {
  if (!childMetas.has(childDoctype)) {
    childMetas.set(
      childDoctype,
      fetch(`/api/v2/doctype/${encodeURIComponent(childDoctype)}/meta`)
        .then((r) => r.json())
        .then((b) => b.data || null)
        .catch(() => null),
    )
  }
  return childMetas.get(childDoctype)
}

async function missingMandatory() {
  const missing = []
  for (const f of metaResource.data?.fields || []) {
    if (LAYOUT_TYPES.has(f.fieldtype) || serverFills(f)) continue
    if (!withLiveRequired(f, values).reqd) continue
    if (isBlank(values[f.fieldname])) missing.push({ fieldname: f.fieldname, label: t(f.label || f.fieldname) })
  }
  // Required columns inside child-table rows.
  for (const f of tableFields.value) {
    const rows = values[f.fieldname] || []
    if (!rows.length) continue
    const meta = await childMeta(f.options)
    for (const [i, row] of rows.entries()) {
      for (const cf of meta?.fields || []) {
        if (LAYOUT_TYPES.has(cf.fieldtype) || serverFills(cf)) continue
        if (!withLiveRequired(cf, row, values).reqd || !isBlank(row[cf.fieldname])) continue
        missing.push({
          fieldname: f.fieldname,
          label: t('{0}, row {1}: {2}', [t(f.label || f.fieldname), i + 1, t(cf.label || cf.fieldname)]),
        })
      }
    }
  }
  return missing
}

// Brings the first empty required field into view (opening its section if
// it is a collapsed one).
async function showField(fieldname) {
  const sec = formSections.value.find((s) => sectionHasField(s, fieldname))
  if (sec?.collapsible) openSections.add(sec.key)
  await nextTick()
  const el = document.querySelector(`[data-fieldname="${CSS.escape(fieldname)}"]`)
  el?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  el?.querySelector('input, textarea, select, button')?.focus({ preventScroll: true })
}

async function save() {
  saving.value = true
  saveError.value = null
  try {
    const missing = await missingMandatory()
    if (missing.length) {
      const text = t('Mandatory fields required: {0}', [missing.map((m) => m.label).join(', ')])
      saveError.value = new Error(text)
      toast.error(text)
      showField(missing[0].fieldname)
      return
    }
    if (isNew) {
      // Inserted with frappe.client.insert rather than useNewDoc's submit:
      // when the server refused (e.g. "Could not find Village: Bhaim"),
      // submit swallowed the reason and only "The record could not be
      // created." was shown. call() throws with the server's own message.
      const doc = { ...values, doctype }
      if (!doc.name || String(doc.name).startsWith('new-')) delete doc.name
      const created = await call('frappe.client.insert', { doc })
      if (!created?.name) throw new Error(t('The record could not be created.'))
      if (created.__offline) toast.success(t('Saved on this phone. It will sync when you are online.'))
      else toast.success(t('Created {0}', [created.name]))
      // Saved - moving on to the new record's own page isn't "leaving edits".
      skipLeaveCheck = true
      if (isGenericRoute) {
        router.replace({
          name: 'DoctypeForm',
          params: { doctypeRoute: route.params.doctypeRoute, name: created.name },
        })
      } else {
        router.replace({ name: route.name.replace('New', 'Form'), params: { name: created.name } })
      }
    } else {
      const result = await existingDoc.setValue.submit(values)
      if (existingDoc.setValue.error || !result) {
        throw existingDoc.setValue.error || new Error(t('The record could not be saved.'))
      }
      // The saved doc has just been copied back into `values` (the load
      // watcher, on the next tick) - that, server-side fills included, is
      // the new "saved" state.
      await nextTick()
      markSaved()
      afterLoadDone = false
      runAfterLoad()
      if (result.__offline) toast.success(t('Saved on this phone. It will sync when you are online.'))
      else toast.success(t('{0} saved', [t(formLabel.value)]))
      activityKey.value++
    }
  } catch (e) {
    saveError.value = e
    toast.error(saveErrorText(e))
    await nextTick()
    saveErrorBox.value?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  } finally {
    saving.value = false
  }
}

// A record made offline gets its real ID when it syncs - move this form
// to it (unless there are edits in progress, which save to it anyway).
watch(
  () => (name ? offlineState.renamed[name] : null),
  (realName) => {
    if (!realName || isDirty.value) return
    skipLeaveCheck = true
    if (isGenericRoute) router.replace({ name: 'DoctypeForm', params: { doctypeRoute: route.params.doctypeRoute, name: realName } })
  },
  { immediate: true },
)

// An offline edit to this record just synced - drop the "Not synced" mark.
watch(
  () => offlineState.syncing,
  async (syncing) => {
    if (syncing || !values.__offline || isNew || isTempName(name)) return
    const record = await getRecord(doctype, name)
    if (record && !record.__offline) {
      delete values.__offline
      if (savedState) delete savedState.__offline
    }
  },
)

onKeyStroke((e) => (e.key === 's' || e.key === 'S') && (e.metaKey || e.ctrlKey), (e) => {
  e.preventDefault()
  if (!saving.value) save()
})

// Desktop shows the breadcrumb trail in the top navbar (one header row,
// not two). Kept at the end: it runs immediately and reads `values`
// (through `crumbs`), which must already be declared.
watchEffect(() => {
  if (isGenericRoute) setPageCrumbs(route.path, crumbs.value)
})
</script>

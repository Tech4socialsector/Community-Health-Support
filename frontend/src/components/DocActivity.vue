<template>
  <!-- The record's history, in the compact style of Desk's form timeline:
  one short line per event - a small icon, "who did what", and how long
  ago on the right. A save that touched many fields collapses into one
  line ("changed 7 fields: ...") with an optional "Show changes" for the
  detail. Field-by-field edits exist only for DocTypes with "Track
  Changes" on; otherwise Desk-style "created" / "last edited" lines. -->
  <section :class="[ui.CARD, 'p-4 sm:p-5']">
    <h2 class="mb-3 flex items-center gap-2">
      <LucideIcon name="activity" class="h-4 w-4 text-gray-500" />
      <span class="text-sm font-semibold text-navy-900 dark:text-gray-100">Activity</span>
      <span v-if="entries.length" :class="ui.COUNT_BADGE">{{ entries.length }}</span>
    </h2>

    <div v-if="loading && !entries.length" class="space-y-3">
      <div v-for="i in 2" :key="i" class="flex items-center gap-3">
        <Skeleton width="1.5rem" height="1.5rem" round />
        <Skeleton width="70%" height="0.875rem" />
      </div>
    </div>
    <p v-else-if="error" class="text-sm text-gray-500 dark:text-gray-400">Activity isn't available for this record.</p>

    <ul v-else class="divide-y divide-gray-100 dark:divide-gray-800">
      <li v-for="(entry, index) in entries" :key="index" class="flex gap-3 py-3 first:pt-1 last:pb-0">
        <span
          class="mt-0.5 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full ring-1"
          :class="entry.type === 'created' ? 'bg-forest-50 text-forest-700 ring-forest-100 dark:bg-forest-900/40 dark:text-forest-300 dark:ring-forest-800' : 'bg-gray-50 text-gray-500 ring-gray-200 dark:bg-gray-800 dark:text-gray-400 dark:ring-gray-700'"
        >
          <LucideIcon :name="entry.type === 'created' ? 'plus' : 'pencil'" class="h-3 w-3" />
        </span>

        <div class="min-w-0 flex-1">
          <div class="flex items-start justify-between gap-3">
            <p class="min-w-0 text-sm leading-6 text-gray-600 dark:text-gray-300">
              <span class="font-semibold text-gray-900 dark:text-gray-100">{{ who(entry) }}</span>
              <template v-if="entry.type === 'created'"> created this document</template>
              <template v-else-if="entry.type === 'edited'"> last edited this document</template>

              <!-- One field: "set X to [v]" / "changed X from [a] to [b]". -->
              <template v-else-if="entry.changes?.length === 1 && !tableNotes(entry).length">
                <template v-if="isBlank(entry.changes[0].from)">
                  set <span class="font-medium text-gray-900 dark:text-gray-100">{{ entry.changes[0].label }}</span> to
                  <span :class="CHIP">{{ shown(entry.changes[0].to, entry.changes[0].fieldtype) }}</span>
                </template>
                <template v-else>
                  changed <span class="font-medium text-gray-900 dark:text-gray-100">{{ entry.changes[0].label }}</span> from
                  <span :class="CHIP">{{ shown(entry.changes[0].from, entry.changes[0].fieldtype) }}</span> to
                  <span :class="CHIP">{{ shown(entry.changes[0].to, entry.changes[0].fieldtype) }}</span>
                </template>
              </template>

              <!-- Several fields (or table rows): one summary line. -->
              <template v-else>
                {{ summary(entry) }}
              </template>
            </p>
            <span class="flex-shrink-0 whitespace-nowrap text-xs leading-6 text-gray-400 dark:text-gray-500" :title="exactTime(entry.at)">
              {{ relativeTime(entry.at) }}
            </span>
          </div>

          <template v-if="isMulti(entry)">
            <button
              type="button"
              class="mt-1 text-xs font-semibold text-forest-700 hover:underline dark:text-forest-300"
              @click="expanded[index] = !expanded[index]"
            >
              {{ expanded[index] ? 'Hide changes' : 'Show changes' }}
            </button>
            <ul v-if="expanded[index]" class="mt-2 space-y-1.5 border-l-2 border-gray-100 pl-3 text-[13px] dark:border-gray-800">
              <li v-for="(change, i) in entry.changes" :key="i" class="break-words text-gray-600 dark:text-gray-300">
                <span class="font-medium text-gray-900 dark:text-gray-100">{{ change.label }}</span>:
                <template v-if="!isBlank(change.from)">
                  <span class="text-gray-400 line-through">{{ shown(change.from, change.fieldtype) }}</span> →
                </template>
                {{ shown(change.to, change.fieldtype) }}
              </li>
              <li v-if="entry.more" class="text-gray-400">…and {{ entry.more }} more</li>
              <li v-for="note in tableNotes(entry)" :key="note" class="text-gray-600 dark:text-gray-300">{{ note }}</li>
            </ul>
          </template>
        </div>
      </li>
    </ul>
  </section>
</template>

<script setup>
import { reactive, ref, watch } from 'vue'
import { call } from 'frappe-ui'
import Skeleton from '@/components/Skeleton.vue'
import LucideIcon from '@/components/LucideIcon.vue'
import { session } from '@/data/session'
import * as ui from '@/data/ui'

const props = defineProps({
  doctype: { type: String, required: true },
  name: { type: String, required: true },
  // Bumped by the form after a save, so a new edit shows up right away.
  refreshKey: { type: Number, default: 0 },
})

const entries = ref([])
const loading = ref(false)
const error = ref(false)
let requestId = 0

async function load() {
  const id = ++requestId
  loading.value = true
  error.value = false
  try {
    const data = await call('chw.api.get_doc_activity', { doctype: props.doctype, name: props.name })
    if (id === requestId) entries.value = data || []
  } catch {
    // Not worth a red error box under a form - just say it's unavailable.
    if (id === requestId) error.value = true
  } finally {
    if (id === requestId) loading.value = false
  }
}

watch(() => props.refreshKey, load, { immediate: true })

// A small grey chip around a value, like Desk's timeline.
const CHIP =
  'mx-0.5 inline-block max-w-full truncate rounded bg-gray-100 px-1.5 py-px align-bottom text-[13px] font-medium text-gray-800 dark:bg-gray-800 dark:text-gray-200'

// Which saves' detail lists are open.
const expanded = reactive({})

// "You" for the person looking, like Desk.
function who(entry) {
  if (entry.user && entry.user === session.user) return 'You'
  return entry.user_name || entry.user
}

function isBlank(value) {
  return value === null || value === undefined || value === ''
}

function tableNotes(entry) {
  const t = entry.tables || {}
  return [
    ...(t.added || []).map((x) => `Added rows to ${x}`),
    ...(t.removed || []).map((x) => `Removed rows from ${x}`),
    ...(t.changed || []).map((x) => `Edited rows in ${x}`),
  ]
}

// A save that needs the "Show changes" detail: more than one field, or any
// child-table rows touched.
function isMulti(entry) {
  return entry.type === 'changed' && ((entry.changes?.length || 0) > 1 || tableNotes(entry).length > 0)
}

// One short line per save: "changed Village and Phone Number" for two
// fields, just "changed 7 fields" beyond that - form labels run long, so
// listing them made the line a paragraph. The names are under "Show
// changes".
function summary(entry) {
  const labels = (entry.changes || []).map((c) => c.label)
  const total = labels.length + (entry.more || 0)
  const parts = []
  if (total === 2 && labels.length === 2) parts.push(`changed ${labels[0]} and ${labels[1]}`)
  else if (total) parts.push(`changed ${total} field${total === 1 ? '' : 's'}`)
  const notes = tableNotes(entry)
  if (notes.length) parts.push(notes.map((n) => n.charAt(0).toLowerCase() + n.slice(1)).join(', '))
  return parts.join('; ') || 'made changes'
}

// Old/new values as people read them - blanks spelled out, a tick box's
// 0/1 as No/Yes (only for Check fields - a count going 1 -> 2 stays a
// number), long text clipped.
function shown(value, fieldtype) {
  if (value === null || value === undefined || value === '') return '(empty)'
  if (fieldtype === 'Check') return Number(value) ? 'Yes' : 'No'
  const text = String(value)
  return text.length > 60 ? `${text.slice(0, 57)}…` : text
}

// Frappe sends "2026-10-06 15:20:11.123456" (server local time).
function parse(value) {
  const d = new Date(String(value).replace(' ', 'T'))
  return isNaN(d) ? null : d
}

function exactTime(value) {
  const d = parse(value)
  return d
    ? d.toLocaleString(undefined, { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
    : ''
}

const relativeFormat = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' })
const UNITS = [
  ['year', 365 * 24 * 3600],
  ['month', 30 * 24 * 3600],
  ['week', 7 * 24 * 3600],
  ['day', 24 * 3600],
  ['hour', 3600],
  ['minute', 60],
]

function relativeTime(value) {
  const d = parse(value)
  if (!d) return ''
  const seconds = (d.getTime() - Date.now()) / 1000
  for (const [unit, size] of UNITS) {
    if (Math.abs(seconds) >= size) return relativeFormat.format(Math.round(seconds / size), unit)
  }
  return 'just now'
}
</script>

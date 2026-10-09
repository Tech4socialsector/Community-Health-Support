<template>
  <!-- The Vue counterpart of Desk's "Connections" cards above a form: one
  card per connected form with this record's entry count. Tapping a card
  expands it into the linked records themselves (most recent first), each
  opening its own form, plus "View all" for the full filtered list; "+"
  starts a new entry already linked to this record. -->
  <section v-if="loading || connections.length">
    <h2 class="mb-2 text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">Connections</h2>
    <div class="grid grid-cols-1 items-start gap-2 min-[480px]:grid-cols-2 lg:grid-cols-3">
      <template v-if="loading && !connections.length">
        <Skeleton v-for="i in 3" :key="i" height="3rem" />
      </template>
      <template v-else>
        <div
          v-for="conn in connections"
          :key="conn.key"
          class="overflow-hidden rounded-lg ring-1 transition"
          :class="[conn.color, { 'shadow-md': isOpen(conn) }]"
        >
          <div class="flex items-center gap-2 px-3 py-2.5">
            <button
              type="button"
              class="flex min-w-0 flex-1 items-center gap-2 text-left focus:outline-none focus-visible:underline"
              :aria-expanded="isOpen(conn)"
              :title="conn.label"
              @click="toggle(conn)"
            >
              <LucideIcon
                name="chevron-right"
                class="h-4 w-4 flex-shrink-0 opacity-60 transition-transform"
                :class="{ 'rotate-90': isOpen(conn) }"
              />
              <span class="min-w-0 flex-1 truncate text-sm font-medium">{{ conn.label }}</span>
              <!-- The count, 0 included - every card always says how many. -->
              <span
                v-if="conn.count != null"
                class="rounded-full bg-white px-2 py-0.5 text-xs font-semibold tabular-nums text-gray-700 ring-1 ring-black/5 dark:bg-gray-900 dark:text-gray-300 dark:ring-white/10"
              >
                {{ conn.count }}
              </span>
            </button>
            <router-link
              :to="{ name: 'DoctypeNew', params: { doctypeRoute: conn.item.route }, query: conn.query }"
              :class="ui.BTN_ADD"
              class="!h-7 !w-7 !rounded-md"
              :title="`New ${conn.label}`"
              :aria-label="`New ${conn.label}`"
            >
              <LucideIcon name="plus" class="h-4 w-4" />
            </router-link>
          </div>

          <!-- Expanded: the linked records themselves. -->
          <div v-if="isOpen(conn)" class="border-t border-black/5 bg-white dark:border-white/10 dark:bg-gray-900">
            <div v-if="records[conn.key]?.loading" class="space-y-1.5 p-2">
              <Skeleton v-for="i in Math.min(conn.count || 2, 3)" :key="i" height="2.25rem" />
            </div>
            <p v-else-if="records[conn.key]?.error" class="px-3 py-3 text-sm text-gray-500">Couldn't load these records.</p>
            <p v-else-if="!records[conn.key]?.rows.length" class="px-3 py-3 text-sm text-gray-500 dark:text-gray-400">
              No {{ conn.label }} records yet.
            </p>
            <ul v-else class="divide-y divide-gray-100 dark:divide-gray-800">
              <li v-for="row in records[conn.key].rows.slice(0, PREVIEW)" :key="row.name">
                <router-link
                  :to="{ name: 'DoctypeForm', params: { doctypeRoute: conn.item.route, name: row.name } }"
                  class="flex items-center gap-2 px-3 py-2 text-sm transition hover:bg-forest-50/60 dark:hover:bg-gray-800/60"
                >
                  <span class="min-w-0 flex-1">
                    <span class="block truncate font-medium text-navy-900 dark:text-gray-100">{{ row.title || row.name }}</span>
                    <span class="block truncate text-xs text-gray-500 dark:text-gray-400">
                      <template v-if="row.title">{{ row.name }} · </template>{{ formatDate(row.creation) }}
                    </span>
                  </span>
                  <LucideIcon name="chevron-right" class="h-4 w-4 flex-shrink-0 text-gray-300 dark:text-gray-600" />
                </router-link>
              </li>
            </ul>
            <router-link
              v-if="conn.count"
              :to="{ name: 'DoctypeList', params: { doctypeRoute: conn.item.route }, query: conn.query }"
              class="flex items-center justify-center gap-1 border-t border-gray-100 px-3 py-2 text-xs font-semibold text-forest-700 hover:bg-forest-50/60 dark:border-gray-800 dark:text-forest-300 dark:hover:bg-gray-800/60"
            >
              View all {{ conn.count }}
              <LucideIcon name="arrow-right" class="h-3.5 w-3.5" />
            </router-link>
          </div>
        </div>
      </template>
    </div>
  </section>
</template>

<script setup>
import { computed, reactive } from 'vue'
import { call, useCall } from 'frappe-ui'
import Skeleton from '@/components/Skeleton.vue'
import LucideIcon from '@/components/LucideIcon.vue'
import { findModuleByDoctype } from '@/data/modules'
import * as ui from '@/data/ui'

const props = defineProps({
  doctype: { type: String, required: true },
  name: { type: String, required: true },
})

// How many linked records an expanded card lists before "View all".
const PREVIEW = 5

// Fetched per mount - the form remounts per record (remountOnParamChange),
// and counts should be fresh each time a record is opened, so no cacheKey.
const connectionsResource = useCall({
  url: '/api/v2/method/chw.api.get_doc_connections',
  method: 'GET',
  params: { doctype: props.doctype, name: props.name },
})

const loading = computed(() => connectionsResource.loading)

// Light tints of the logo's two brand colours (tailwind.config.js navy /
// forest), alternated per card so neighbouring connections are still easy
// to tell apart. Full class strings so Tailwind's content scan picks them up.
const CARD_COLORS = [
  'bg-navy-50 ring-navy-100 text-navy-900 dark:bg-navy-900/40 dark:ring-navy-800 dark:text-navy-100',
  'bg-forest-50 ring-forest-100 text-forest-900 dark:bg-forest-900/40 dark:ring-forest-800 dark:text-forest-100',
]

// Only connected forms this app has a page for - anything else couldn't be
// opened from here anyway.
const connections = computed(() =>
  (connectionsResource.data || [])
    .map((conn) => {
      const item = findModuleByDoctype(conn.doctype)
      if (!item) return null
      return {
        key: `${item.route}:${conn.fieldname}`,
        doctype: conn.doctype,
        fieldname: conn.fieldname,
        item,
        label: item.label || item.doctype_name,
        count: conn.count,
        query: { [conn.fieldname]: props.name },
      }
    })
    .filter(Boolean)
    // Coloured after filtering so the shown cards cycle without gaps.
    .map((conn, index) => ({ ...conn, color: CARD_COLORS[index % CARD_COLORS.length] })),
)

// ---- Expand / collapse ----
const open = reactive({})
// Linked records per card, fetched the first time it's opened and kept
// for re-opening (the form remounts per record, so they never go stale
// across records).
const records = reactive({})

function isOpen(conn) {
  return !!open[conn.key]
}

async function toggle(conn) {
  open[conn.key] = !open[conn.key]
  if (!open[conn.key] || records[conn.key]) return
  records[conn.key] = { loading: true, error: false, rows: [] }
  try {
    const rows = await call('chw.api.get_connection_records', {
      doctype: conn.doctype,
      fieldname: conn.fieldname,
      value: props.name,
      limit: PREVIEW,
    })
    records[conn.key] = { loading: false, error: false, rows: rows || [] }
  } catch {
    records[conn.key] = { loading: false, error: true, rows: [] }
  }
}

function formatDate(value) {
  const d = new Date(String(value).replace(' ', 'T'))
  return isNaN(d) ? '' : d.toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' })
}
</script>

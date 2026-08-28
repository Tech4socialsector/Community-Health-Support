<template>
  <div ref="boxRef" class="relative w-full max-w-lg">
    <div class="relative">
      <FeatherIcon name="search" class="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
      <input
        ref="inputRef"
        v-model="query"
        type="text"
        placeholder="Search or type a command"
        class="h-8 w-full rounded border border-gray-200 bg-gray-50 pl-8 pr-3 text-sm text-gray-900 placeholder:text-gray-400 focus:border-gray-300 focus:outline-none focus:ring-1 focus:ring-gray-300 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 dark:placeholder:text-gray-500"
        @focus="open = true"
        @keydown.esc="open = false"
      />
      <kbd class="pointer-events-none absolute right-2 top-1/2 hidden -translate-y-1/2 rounded border border-gray-300 bg-white px-1 py-0.5 text-[10px] font-medium text-gray-400 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-500 sm:block">
        {{ shortcutLabel }}
      </kbd>
    </div>

    <div
      v-if="open && query.trim()"
      class="absolute left-0 right-0 top-9 z-30 max-h-96 overflow-y-auto rounded-lg border bg-white py-2 shadow-lg dark:border-gray-800 dark:bg-gray-900"
    >
      <div v-if="moduleMatches.length" class="mb-1">
        <div class="px-3 py-1 text-[11px] font-medium uppercase tracking-wide text-gray-400 dark:text-gray-500">
          Modules
        </div>
        <button
          v-for="item in moduleMatches"
          :key="`mod-${item.route}`"
          class="flex w-full items-center gap-2 px-3 py-1.5 text-left hover:bg-gray-50 dark:hover:bg-gray-800"
          @click="goToList(item)"
        >
          <FeatherIcon name="folder" class="h-4 w-4 flex-shrink-0 text-gray-400" />
          <span class="text-sm text-gray-900 dark:text-gray-100">Go to {{ item.label || item.doctype_name }}</span>
        </button>
      </div>

      <div v-if="createMatches.length" class="mb-1">
        <div class="px-3 py-1 text-[11px] font-medium uppercase tracking-wide text-gray-400 dark:text-gray-500">
          Create New
        </div>
        <button
          v-for="item in createMatches"
          :key="`new-${item.route}`"
          class="flex w-full items-center gap-2 px-3 py-1.5 text-left hover:bg-gray-50 dark:hover:bg-gray-800"
          @click="goToNew(item)"
        >
          <FeatherIcon name="plus" class="h-4 w-4 flex-shrink-0 text-gray-400" />
          <span class="text-sm text-gray-900 dark:text-gray-100">New {{ item.label || item.doctype_name }}</span>
        </button>
      </div>

      <div>
        <div class="px-3 py-1 text-[11px] font-medium uppercase tracking-wide text-gray-400 dark:text-gray-500">
          Search Results
        </div>
        <div v-if="searchResource.loading" class="px-3 py-3 text-center text-sm text-gray-500">
          Searching...
        </div>
        <div
          v-else-if="!moduleMatches.length && !createMatches.length && searchRecords.length === 0"
          class="px-3 py-3 text-center text-sm text-gray-500 dark:text-gray-400"
        >
          No results.
        </div>
        <button
          v-for="(item, idx) in searchRecords"
          :key="`rec-${item.doctype_name}-${item.name}-${idx}`"
          class="flex w-full flex-col items-start px-3 py-1.5 text-left hover:bg-gray-50 dark:hover:bg-gray-800"
          @click="selectRecord(item)"
        >
          <span class="text-sm text-gray-900 dark:text-gray-100">{{ item.description || item.name }}</span>
          <span class="text-xs text-gray-500 dark:text-gray-400">{{ item.doctype_name }}</span>
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch } from 'vue'
import { useRouter } from 'vue-router'
import { onClickOutside, onKeyStroke, useDebounceFn } from '@vueuse/core'
import { FeatherIcon } from 'frappe-ui'
import { searchQuery, searchResource } from '@/data/search'
import { flatModuleItems } from '@/data/modules'

const router = useRouter()
const boxRef = ref(null)
const inputRef = ref(null)
const open = ref(false)
const query = searchQuery

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent)
const shortcutLabel = isMac ? '⌘K' : 'Ctrl+K'

onKeyStroke((e) => (e.key === 'k' || e.key === 'K') && (e.metaKey || e.ctrlKey), (e) => {
  e.preventDefault()
  inputRef.value?.focus()
})

const NEW_PREFIX = /^new\s+/i

const moduleMatches = computed(() => {
  const q = query.value.trim().toLowerCase()
  if (!q || NEW_PREFIX.test(query.value.trim())) return []
  return flatModuleItems.value
    .filter((item) => (item.label || item.doctype_name).toLowerCase().includes(q))
    .slice(0, 5)
})

const createMatches = computed(() => {
  const raw = query.value.trim()
  const q = NEW_PREFIX.test(raw) ? raw.replace(NEW_PREFIX, '').trim().toLowerCase() : raw.toLowerCase()
  if (!q) return []
  return flatModuleItems.value
    .filter((item) => (item.label || item.doctype_name).toLowerCase().includes(q))
    .slice(0, 5)
})

const searchRecords = computed(() => searchResource.data || [])

const runSearch = useDebounceFn(() => {
  const raw = query.value.trim()
  if (raw && !NEW_PREFIX.test(raw)) {
    searchResource.fetch()
  }
}, 300)

watch(query, runSearch)

onClickOutside(boxRef, () => {
  open.value = false
})

function reset() {
  open.value = false
  query.value = ''
}

function goToList(item) {
  reset()
  router.push({ name: 'DoctypeList', params: { doctypeRoute: item.route } })
}

function goToNew(item) {
  reset()
  router.push({ name: 'DoctypeNew', params: { doctypeRoute: item.route } })
}

function selectRecord(item) {
  reset()
  router.push({ name: 'DoctypeForm', params: { doctypeRoute: item.route, name: item.name } })
}
</script>

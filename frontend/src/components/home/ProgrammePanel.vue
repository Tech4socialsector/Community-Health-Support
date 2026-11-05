<template>
  <!-- One programme on Home: its icon and name with the total records,
  then a row per form (open the list, count, +). MCH's
  forms come grouped under stage headings (Pregnancy, Birth & after,
  Child), laid side by side when the panel is wide enough. -->
  <section :class="[ui.HOME_CARD, 'flex flex-col overflow-hidden']" :aria-label="t(programme.title)">
    <header class="flex items-center gap-3.5 border-b border-gray-100 px-5 py-4 dark:border-gray-800">
      <span class="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg text-white" :class="tone.tile" aria-hidden="true">
        <LucideIcon :name="programme.icon || 'layout-grid'" class="h-[1.125rem] w-[1.125rem]" />
      </span>
      <h2 class="min-w-0 flex-1 truncate text-base font-semibold tracking-tight text-gray-900 dark:text-gray-50">
        {{ t(programme.title) }}
      </h2>
      <div class="flex flex-col items-end">
        <Skeleton v-if="loading" width="1.5rem" height="1.25rem" />
        <span v-else class="text-lg font-bold leading-none tracking-tight tabular-nums" :class="tone.text">{{ total }}</span>
        <span class="mt-0.5 text-[11px] font-medium text-gray-500 dark:text-gray-400">{{ t('records') }}</span>
      </div>
    </header>

    <!-- grid-cols-[minmax(0,1fr)]: without it a grid column grows to its
    widest row, and a long form name pushed the + out of a narrow panel. -->
    <div class="grid flex-1 grid-cols-[minmax(0,1fr)] gap-x-5 gap-y-2 px-3.5 pb-4 pt-2.5" :class="stageGrid">
      <div v-for="stage in programme.stages" :key="stage.title || 'forms'" class="min-w-0">
        <h3
          v-if="stage.title"
          class="flex items-center gap-2 px-1.5 pb-1.5 pt-2.5 text-[11px] font-semibold uppercase tracking-wider"
          :class="tone.text"
        >
          <span class="h-1.5 w-1.5 rounded-full" :class="tone.dot" aria-hidden="true" />
          {{ t(stage.title) }}
        </h3>
        <div class="grid grid-cols-[minmax(0,1fr)] gap-2 pt-1.5" :class="rowGrid">
          <div v-for="item in stage.items" :key="item.route" :class="[ui.HOME_ROW, tone.rowHover]">
            <span class="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md" :class="tone.tint" aria-hidden="true">
              <LucideIcon name="file-text" class="h-3.5 w-3.5" />
            </span>
            <!-- The stretched ::after makes the whole row open the list; the
            + sits above it (z-10). -->
            <router-link
              :to="{ name: 'DoctypeList', params: { doctypeRoute: item.route } }"
              :title="t(item.label)"
              class="min-w-0 flex-1 truncate text-sm font-medium text-gray-800 after:absolute after:inset-0 after:rounded-xl focus:outline-none dark:text-gray-100"
            >
              {{ t(item.label) }}
            </router-link>
            <Skeleton v-if="loading" width="1.875rem" height="1.5rem" />
            <span v-else :class="ui.HOME_COUNT_PILL">{{ countFor(item) ?? '—' }}</span>
            <router-link
              :to="{ name: 'DoctypeNew', params: { doctypeRoute: item.route } }"
              :aria-label="t('New {0}', [t(item.label)])"
              :title="t('New {0}', [t(item.label)])"
              class="relative z-10 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md text-white transition"
              :class="tone.button"
            >
              <LucideIcon name="plus" class="h-3.5 w-3.5" />
            </router-link>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>

<script setup>
import { computed } from 'vue'
import LucideIcon from '@/components/LucideIcon.vue'
import Skeleton from '@/components/Skeleton.vue'
import * as ui from '@/data/ui'
import { t } from '@/data/i18n'

const props = defineProps({
  // { key, title, icon, stages: [{ title, items: [{ doctype_name, label, route }] }] }
  programme: { type: Object, required: true },
  // The panel's share of the 12-column row (see Home.vue) - decides how
  // its stages and rows lay out inside it.
  span: { type: Number, default: 12 },
  counts: { type: Object, default: () => ({}) },
  loading: { type: Boolean, default: false },
})

const tone = computed(() => ui.programmeTone(props.programme.key))
const staged = computed(() => props.programme.stages.length > 1)

// Literal classes so Tailwind keeps them. Full width: every stage side by
// side; the 2/3 slot beside a small programme: two columns.
const STAGE_GRID = { 1: '', 2: 'md:grid-cols-2', 3: 'md:grid-cols-3', 4: 'md:grid-cols-2 xl:grid-cols-4' }
const stageGrid = computed(() => {
  if (!staged.value) return ''
  const n = props.programme.stages.length
  return props.span === 12 ? STAGE_GRID[Math.min(n, 4)] : 'md:grid-cols-2'
})
// A one-stage programme alone on its row lays its forms side by side.
const rowGrid = computed(() => (!staged.value && props.span >= 12 ? 'sm:grid-cols-2' : ''))

function countFor(item) {
  const value = props.counts?.[item.doctype_name]
  return typeof value === 'number' ? value : null
}

const total = computed(() =>
  props.programme.stages.reduce((sum, s) => sum + s.items.reduce((n, item) => n + (countFor(item) || 0), 0), 0),
)
</script>

<template>
  <AppLayout>
    <PageHeader>
      <template #title>
        <h1 class="text-lg font-semibold text-gray-900 dark:text-gray-100">{{ greeting }}</h1>
      </template>
    </PageHeader>

    <div v-if="modulesResource.loading && !modulesResource.data" class="grid grid-cols-3 gap-3 sm:grid-cols-[repeat(auto-fill,minmax(7rem,max-content))] sm:gap-4">
      <div v-for="i in 6" :key="i" class="flex flex-col items-center gap-2 p-2">
        <Skeleton width="4rem" height="4rem" round />
        <Skeleton width="3.5rem" height="0.75rem" />
      </div>
    </div>
    <ErrorMessage v-else-if="modulesResource.error" :message="modulesResource.error" />
    <div
      v-else-if="!modulesResource.data || modulesResource.data.length === 0"
      class="py-10 text-center text-gray-500 dark:text-gray-400"
    >
      No modules are configured for your account yet. Ask a coordinator to
      enable modules in App Module Setting.
    </div>

    <!-- Desktop: a plain wrapping grid, unchanged. Mobile: a single row
    instead of wrapping - only as many tiles as actually fit the screen
    width render at once (measured live via useElementSize, not a fixed
    guess), and anything past that stays hidden behind the arrow buttons
    rather than wrapping onto a second row or growing the page taller. -->
    <div v-else-if="!isMobile" class="grid grid-cols-3 gap-3 sm:grid-cols-[repeat(auto-fill,minmax(7rem,max-content))] sm:gap-4">
      <button
        v-for="mod in modulesResource.data"
        :key="mod.label"
        class="flex flex-col items-center gap-2 rounded-lg p-2 text-center hover:bg-gray-100 dark:hover:bg-gray-800"
        :class="{ 'bg-gray-100 dark:bg-gray-800': activeModule?.label === mod.label }"
        @click="toggleModule(mod)"
      >
        <span class="flex h-16 w-16 items-center justify-center rounded-2xl bg-white shadow-sm ring-1 ring-gray-200 dark:bg-gray-800 dark:ring-gray-700 sm:h-[4.5rem] sm:w-[4.5rem]">
          <LucideIcon :name="mod.icon" class="h-7 w-7 text-gray-600 dark:text-gray-300 sm:h-8 sm:w-8" />
        </span>
        <span class="line-clamp-2 text-xs font-medium leading-tight text-gray-900 dark:text-gray-100 sm:text-sm">
          {{ mod.label }}
        </span>
      </button>
    </div>

    <div v-else ref="sliderContainerRef" class="flex items-center gap-2">
      <button
        v-if="modulePageCount > 1"
        class="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full border text-gray-500 disabled:opacity-30 dark:border-gray-700 dark:text-gray-400"
        :disabled="modulePage === 0"
        @click="modulePage--"
      >
        <FeatherIcon name="chevron-left" class="h-4 w-4" />
      </button>

      <div class="flex min-w-0 flex-1 justify-center gap-3">
        <button
          v-for="mod in pagedModules"
          :key="mod.label"
          class="flex flex-col items-center gap-2 rounded-lg p-2 text-center hover:bg-gray-100 dark:hover:bg-gray-800"
          :class="{ 'bg-gray-100 dark:bg-gray-800': activeModule?.label === mod.label }"
          @click="toggleModule(mod)"
        >
          <span class="flex h-16 w-16 items-center justify-center rounded-2xl bg-white shadow-sm ring-1 ring-gray-200 dark:bg-gray-800 dark:ring-gray-700">
            <LucideIcon :name="mod.icon" class="h-7 w-7 text-gray-600 dark:text-gray-300" />
          </span>
          <span class="line-clamp-2 w-16 text-xs font-medium leading-tight text-gray-900 dark:text-gray-100">
            {{ mod.label }}
          </span>
        </button>
      </div>

      <button
        v-if="modulePageCount > 1"
        class="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full border text-gray-500 disabled:opacity-30 dark:border-gray-700 dark:text-gray-400"
        :disabled="modulePage === modulePageCount - 1"
        @click="modulePage++"
      >
        <FeatherIcon name="chevron-right" class="h-4 w-4" />
      </button>
    </div>

    <!-- Desktop already surfaces the active module's doctypes in the
    sidebar; on mobile there's no sidebar, so show them right here, inline,
    as soon as a module tile is tapped. -->
    <div
      v-if="activeModule"
      class="mt-4 rounded-xl border bg-white dark:border-gray-800 dark:bg-gray-900 sm:hidden"
    >
      <div class="flex items-center justify-between border-b px-3 py-2 dark:border-gray-800">
        <span class="text-xs font-medium uppercase tracking-wide text-gray-400 dark:text-gray-500">
          {{ activeModule.label }}
        </span>
        <button
          class="flex h-6 w-6 items-center justify-center rounded text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"
          @click="clearActiveModule"
        >
          <FeatherIcon name="x" class="h-4 w-4" />
        </button>
      </div>
      <router-link
        v-for="item in activeModule.doctypes || []"
        :key="item.route"
        :to="{ name: 'DoctypeList', params: { doctypeRoute: item.route } }"
        class="flex items-center gap-3 border-b px-3 py-2.5 text-sm text-gray-700 last:border-0 hover:bg-gray-50 dark:border-gray-800 dark:text-gray-300 dark:hover:bg-gray-800"
      >
        <LucideIcon :name="item.icon || activeModule.icon" class="h-4 w-4 flex-shrink-0 text-gray-400" />
        {{ item.label || item.doctype_name }}
      </router-link>
    </div>
  </AppLayout>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import { breakpointsTailwind, useBreakpoints, useElementSize } from '@vueuse/core'
import { FeatherIcon, ErrorMessage } from 'frappe-ui'
import AppLayout from '@/layouts/AppLayout.vue'
import PageHeader from '@/components/PageHeader.vue'
import Skeleton from '@/components/Skeleton.vue'
import LucideIcon from '@/components/LucideIcon.vue'
import { modulesResource } from '@/data/modules'
import { activeModule, setActiveModule, clearActiveModule } from '@/data/activeModule'
import { setPageTitle } from '@/data/pageTitle'
import { session } from '@/data/session'

setPageTitle('Home')

const breakpoints = useBreakpoints(breakpointsTailwind)
const isMobile = breakpoints.smaller('sm')

// Each tile is w-16 (4rem/64px) with gap-3 (0.75rem/12px) between them -
// how many actually fit in one row depends on the real viewport width
// (a small phone fits 3, a larger one 4+), so this is measured live via
// useElementSize rather than a fixed guess. The arrow buttons (h-8/32px
// + their own gap-2/8px on each side, only rendered once page 2+ exists)
// eat into that same row, so a first pass without them can undercount by
// one tile right at the boundary where a 2nd page would just barely not
// be needed - not worth a second measurement pass to correct for.
const TILE_WIDTH = 64
const TILE_GAP = 12
const ARROW_RESERVED_WIDTH = 2 * (32 + 8)
const sliderContainerRef = ref(null)
const { width: sliderWidth } = useElementSize(sliderContainerRef)

const modulesPerPage = computed(() => {
  const available = sliderWidth.value - ARROW_RESERVED_WIDTH
  if (available <= 0) return 1
  return Math.max(1, Math.floor((available + TILE_GAP) / (TILE_WIDTH + TILE_GAP)))
})

const modulePage = ref(0)
const modulePageCount = computed(() =>
  Math.max(1, Math.ceil((modulesResource.data?.length || 0) / modulesPerPage.value)),
)
const pagedModules = computed(() => {
  const start = modulePage.value * modulesPerPage.value
  return (modulesResource.data || []).slice(start, start + modulesPerPage.value)
})

// Clamp back onto a real page if the module list shrinks (role change,
// etc.) or a resize changes how many tiles fit per page, and the current
// page would otherwise point past the end.
watch(modulePageCount, (count) => {
  if (modulePage.value > count - 1) modulePage.value = count - 1
})

const greeting = computed(() => {
  const hour = new Date().getHours()
  const timeGreeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'
  const firstName = (session.full_name || '').split(' ')[0] || session.user
  return firstName ? `${timeGreeting}, ${firstName}` : timeGreeting
})

function toggleModule(mod) {
  if (activeModule.value?.label === mod.label) {
    clearActiveModule()
  } else {
    setActiveModule(mod)
  }
}
</script>

<template>
  <AppLayout>
    <div :class="ui.PAGE">
      <!-- Hero: greeting + date on the logo's own hill green (#245535 =
      forest-700, also the New / Save buttons), with the logo's two hill
      outlines drawn faintly along the bottom, and search over the form
      cards below. -->
      <section class="relative overflow-hidden rounded-2xl bg-forest-700 px-5 pb-12 pt-6 text-white shadow-sm sm:px-8 sm:pb-14 sm:pt-8">
        <svg
          class="pointer-events-none absolute inset-x-0 bottom-0 h-10 w-full sm:h-12"
          viewBox="0 0 640 100"
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          <path d="M0 98 C60 92 110 80 150 52 C175 34 200 22 215 24 C240 28 270 60 300 78 C330 92 380 98 420 99" fill="none" stroke="white" stroke-opacity="0.18" stroke-width="4" vector-effect="non-scaling-stroke" stroke-linecap="round" />
          <path d="M170 99 C220 70 250 52 280 56 C300 58 312 40 330 34 C350 28 370 10 400 6 C420 4 430 30 445 42 C460 54 470 46 490 52 C530 64 580 86 640 98" fill="none" stroke="white" stroke-opacity="0.18" stroke-width="4" vector-effect="non-scaling-stroke" stroke-linecap="round" />
        </svg>
        <div class="relative flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
          <div class="min-w-0">
            <p class="text-xs font-medium uppercase tracking-wider text-forest-200">{{ todayLabel }}</p>
            <h1 class="mt-1 text-xl font-semibold sm:text-2xl">{{ greeting }}</h1>
            <p class="mt-1 text-sm text-forest-100">Pick a form to view records or start a new entry.</p>
          </div>
          <div class="relative w-full md:w-72">
            <LucideIcon
              name="search"
              class="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-forest-200"
            />
            <input
              v-model="search"
              type="search"
              placeholder="Find a form…"
              class="h-10 w-full rounded-lg border-0 bg-white/10 pl-9 pr-3 text-sm text-white placeholder-forest-200 ring-1 ring-white/20 focus:bg-white/15 focus:outline-none focus:ring-2 focus:ring-white/40"
            />
          </div>
        </div>
      </section>

      <!-- Forms -->
      <div v-if="modulesResource.loading && !modulesResource.data" :class="ui.STAT_GRID">
        <div v-for="i in 8" :key="i" :class="ui.STAT_CARD">
          <Skeleton width="70%" height="0.875rem" />
          <Skeleton width="3rem" height="2rem" />
          <Skeleton width="5.5rem" height="0.875rem" />
        </div>
      </div>
      <ErrorMessage v-else-if="modulesResource.error" :message="modulesResource.error" />
      <div v-else-if="!modules.length" :class="ui.EMPTY_STATE">
        <LucideIcon name="inbox" class="h-8 w-8 text-gray-300 dark:text-gray-600" />
        No modules are configured for your account yet. Ask a coordinator to
        enable modules in App Module Setting.
      </div>
      <template v-else>
        <section v-for="mod in filteredModules" :key="mod.label">
          <div class="mb-3 flex items-center gap-3">
            <h2 :class="ui.SECTION_LABEL">{{ mod.label }}</h2>
            <span :class="ui.COUNT_BADGE">{{ mod.doctypes.length }}</span>
            <span class="h-px flex-1 bg-gray-200 dark:bg-gray-800" />
          </div>
          <div :class="ui.STAT_GRID">
            <!-- Card is a plain div (not a link) because it holds two
            separate actions - nesting the "+ New" link inside an outer link
            is invalid HTML. The stretched ::after on the title link makes
            the whole card clickable anyway; "+ New" sits above it (z-10). -->
            <div v-for="(item, index) in mod.doctypes" :key="item.route" :class="ui.statCardAt(index)">
              <router-link
                :to="{ name: 'DoctypeList', params: { doctypeRoute: item.route } }"
                :title="item.displayLabel"
                :class="[ui.STAT_LABEL, 'after:absolute after:inset-0 after:rounded-xl focus:outline-none']"
              >
                {{ item.displayLabel }}
              </router-link>
              <Skeleton v-if="countsLoading" width="3rem" height="2rem" />
              <span v-else :class="ui.statCountAt(index)">
                <template v-if="countFor(item) != null">{{ countFor(item) }}</template>
                <span v-else class="text-gray-300 dark:text-gray-600">—</span>
              </span>
              <span class="flex w-full items-center justify-between gap-2">
                <span :class="ui.STAT_CTA">
                  <span class="hidden min-[400px]:inline">View records</span>
                  <span class="min-[400px]:hidden">View</span>
                  <LucideIcon name="arrow-right" class="h-4 w-4 transition group-hover:translate-x-0.5" />
                </span>
                <router-link
                  :to="{ name: 'DoctypeNew', params: { doctypeRoute: item.route } }"
                  :title="`New ${item.displayLabel}`"
                  :aria-label="`New ${item.displayLabel}`"
                  :class="ui.BTN_ADD"
                >
                  <LucideIcon name="plus" class="h-4 w-4" />
                </router-link>
              </span>
            </div>
          </div>
        </section>

        <div v-if="!filteredModules.length" :class="ui.EMPTY_STATE">
          <LucideIcon name="search" class="h-8 w-8 text-gray-300 dark:text-gray-600" />
          No forms match “{{ search }}”.
        </div>
      </template>
    </div>
  </AppLayout>
</template>

<script setup>
import { computed, ref } from 'vue'
import { ErrorMessage, useCall } from 'frappe-ui'
import AppLayout from '@/layouts/AppLayout.vue'
import Skeleton from '@/components/Skeleton.vue'
import LucideIcon from '@/components/LucideIcon.vue'
import { modulesResource } from '@/data/modules'
import { setPageTitle } from '@/data/pageTitle'
import { session } from '@/data/session'
import * as ui from '@/data/ui'

setPageTitle('Home')

const search = ref('')


const modules = computed(() =>
  (modulesResource.data || [])
    .filter((mod) => mod.doctypes?.length)
    .map((mod) => ({
      ...mod,
      doctypes: mod.doctypes.map((item) => ({
        ...item,
        displayLabel: item.label || item.doctype_name,
      })),
    })),
)

const filteredModules = computed(() => {
  const term = search.value.trim().toLowerCase()
  if (!term) return modules.value
  return modules.value
    .map((mod) => ({
      ...mod,
      doctypes: mod.doctypes.filter((item) => item.displayLabel.toLowerCase().includes(term)),
    }))
    .filter((mod) => mod.doctypes.length)
})

const countsResource = useCall({
  url: '/api/v2/method/chw.api.get_module_record_counts',
  method: 'GET',
  cacheKey: 'chw-home-record-counts',
})

const countsLoading = computed(() => countsResource.loading && !countsResource.data)

function countFor(item) {
  const value = countsResource.data?.[item.doctype_name]
  return typeof value === 'number' ? value : null
}

const todayLabel = new Date().toLocaleDateString(undefined, {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
})

const greeting = computed(() => {
  const hour = new Date().getHours()
  const timeGreeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'
  const firstName = (session.full_name || '').split(' ')[0] || session.user
  return firstName ? `${timeGreeting}, ${firstName}` : timeGreeting
})
</script>

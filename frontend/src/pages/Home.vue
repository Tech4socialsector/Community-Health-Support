<template>
  <AppLayout>
    <div :class="ui.PAGE" class="!space-y-7">
      <!-- Hero: greeting + date on the logo's own hill green (#245535 =
      forest-700, also the New / Save buttons), with the logo's two hill
      outlines drawn faintly along the bottom, and the Language menu. -->
      <!-- No overflow-hidden on the banner itself: the Language menu's list
      opens below it and was being cut off. Only the hills are clipped, by
      their own rounded wrapper. -->
      <section class="relative z-10 rounded-2xl bg-forest-800 px-5 py-6 text-white shadow-lg shadow-forest-900/25 sm:px-8 sm:py-7">
        <div class="pointer-events-none absolute inset-0 overflow-hidden rounded-2xl" aria-hidden="true">
          <svg
            class="pointer-events-none absolute inset-x-0 bottom-0 h-10 w-full sm:h-12"
            viewBox="0 0 640 100"
            preserveAspectRatio="none"
            aria-hidden="true"
          >
            <path d="M0 98 C60 92 110 80 150 52 C175 34 200 22 215 24 C240 28 270 60 300 78 C330 92 380 98 420 99" fill="none" stroke="white" stroke-opacity="0.16" stroke-width="4" vector-effect="non-scaling-stroke" stroke-linecap="round" />
            <path d="M170 99 C220 70 250 52 280 56 C300 58 312 40 330 34 C350 28 370 10 400 6 C420 4 430 30 445 42 C460 54 470 46 490 52 C530 64 580 86 640 98" fill="none" stroke="white" stroke-opacity="0.16" stroke-width="4" vector-effect="non-scaling-stroke" stroke-linecap="round" />
          </svg>
        </div>
        <div class="relative flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div class="min-w-0">
            <p class="text-[11px] font-semibold uppercase tracking-[0.1em] text-forest-200">{{ todayLabel }}</p>
            <h1 class="mt-1.5 text-xl font-semibold tracking-tight sm:text-2xl">{{ greeting }}</h1>
          </div>
          <!-- Language menu right where the app opens, one tap away. -->
          <div class="flex">
            <LanguageMenu
              align="right"
              class="flex-shrink-0"
              menu-class="[&>button]:!h-10 [&>button]:!bg-white/10 [&>button]:!text-white [&>button]:!ring-1 [&>button]:!ring-white/25 [&>button:hover]:!bg-white/15"
            />
          </div>
        </div>
      </section>

      <div v-if="layoutResource.loading && !layoutResource.data" class="space-y-7">
        <div class="grid gap-4 sm:grid-cols-2 sm:gap-5">
          <div v-for="i in 2" :key="i" :class="[ui.HOME_CARD, 'flex items-center gap-5 p-6']">
            <Skeleton width="3.5rem" height="3.5rem" />
            <div class="flex-1 space-y-2">
              <Skeleton width="40%" height="0.875rem" />
              <Skeleton width="3rem" height="2rem" />
            </div>
          </div>
        </div>
        <div :class="[ui.HOME_CARD, 'h-64']" />
      </div>
      <ErrorMessage v-else-if="layoutResource.error" :message="layoutResource.error" />
      <template v-else>
        <!-- Household & Family: always on, the same for every programme mix -->
        <section v-if="core.length" class="space-y-3.5">
          <div class="flex items-center gap-3">
            <h2 :class="ui.SECTION_LABEL">{{ t('Household & Family') }}</h2>
            <span class="h-px flex-1 bg-gray-200 dark:bg-gray-800" />
          </div>
          <div class="grid gap-4 sm:grid-cols-2 sm:gap-5">
            <HomeStatCard
              v-for="(item, index) in core"
              :key="item.route"
              :item="item"
              :icon="CORE_ICONS[item.doctype_name] || 'file-text'"
              :tone-key="index === 0 ? 'palliative' : 'mch'"
              :count="countFor(item)"
              :loading="countsLoading"
            />
          </div>
        </section>

        <!-- Programmes: one panel per programme that is on (App Setting) -->
        <section class="space-y-3.5">
          <div class="flex items-center gap-3">
            <h2 :class="ui.SECTION_LABEL">{{ t('Programmes') }}</h2>
            <span class="h-px flex-1 bg-gray-200 dark:bg-gray-800" />
          </div>

          <div
            v-if="!panels.length"
            class="flex flex-col items-center gap-3.5 rounded-2xl border-[1.5px] border-dashed border-forest-200 bg-white px-6 py-12 text-center dark:border-forest-800 dark:bg-gray-900"
          >
            <span class="flex h-14 w-14 items-center justify-center rounded-2xl bg-forest-700 text-white shadow-lg shadow-forest-700/30" aria-hidden="true">
              <LucideIcon name="stethoscope" class="h-7 w-7" />
            </span>
            <p class="text-lg font-semibold text-gray-900 dark:text-gray-50">{{ t('No programme is turned on') }}</p>
            <p class="max-w-lg text-sm leading-relaxed text-gray-600 dark:text-gray-400">
              {{ t('Households and family members are always available. Turn on MCH, Palliative Care, Mental Health, NCD or Cancer in Settings → App Settings to bring their forms here.') }}
            </p>
            <button v-if="isAdmin" type="button" :class="ui.BTN_PRIMARY" @click="openSettingsDialog()">
              <LucideIcon name="settings" class="h-4 w-4" />
              {{ t('Open App Settings') }}
            </button>
          </div>

          <div v-else class="grid gap-4 sm:gap-5 lg:grid-cols-12">
            <ProgrammePanel
              v-for="panel in panels"
              :key="panel.key"
              :programme="panel"
              :span="panel.span"
              :counts="countsResource.data || {}"
              :loading="countsLoading"
              :class="SPAN_CLASS[panel.span]"
            />
          </div>
        </section>
      </template>
    </div>
  </AppLayout>
</template>

<script setup>
import { computed } from 'vue'
import { ErrorMessage, useCall } from 'frappe-ui'
import AppLayout from '@/layouts/AppLayout.vue'
import Skeleton from '@/components/Skeleton.vue'
import LucideIcon from '@/components/LucideIcon.vue'
import LanguageMenu from '@/components/LanguageMenu.vue'
import HomeStatCard from '@/components/home/HomeStatCard.vue'
import ProgrammePanel from '@/components/home/ProgrammePanel.vue'
import { openSettingsDialog } from '@/data/settingsDialog'
import { userContextResource } from '@/data/userContext'
import { setPageTitle } from '@/data/pageTitle'
import { session } from '@/data/session'
import * as ui from '@/data/ui'
import { t, dateLocale } from '@/data/i18n'

setPageTitle('Home')

// Household profile / Family members, then a group per programme that is
// on - roles, App Setting switches and form ticks already applied.
const layoutResource = useCall({
  url: '/api/v2/method/chw.api.get_home_layout',
  method: 'GET',
  cacheKey: 'chw-home-layout',
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

const CORE_ICONS = { 'Household profile': 'house', 'Family members': 'users' }

const core = computed(() => layoutResource.data?.core || [])

// Panel widths on a 12-column row (large screens; phones stack them):
// MCH, with its 7 forms in stages, takes the wide slot - the full row, or
// 2/3 beside a single small programme; the small programmes share the
// rest equally (4 in a row at most). One programme alone gets the full row.
const SPAN_CLASS = { 12: 'lg:col-span-12', 8: 'lg:col-span-8', 6: 'lg:col-span-6', 4: 'lg:col-span-4', 3: 'lg:col-span-3' }

const panels = computed(() => {
  const data = layoutResource.data || {}
  const list = [
    ...(data.programmes || []),
    // Forms an App Module Setting adds outside the five programmes keep a
    // place, as a panel of their own.
    ...(data.other || []).map((group, i) => ({
      key: `other-${i}`,
      title: group.title,
      icon: 'layout-grid',
      stages: [{ title: '', items: group.items }],
    })),
  ]
  const wide = list.find((p) => p.stages.length > 1)
  const small = list.filter((p) => p !== wide)
  const smallSpan = (n) => (n >= 4 ? 3 : n === 3 ? 4 : n === 2 ? 6 : 12)
  return list.map((p) => {
    let span
    if (list.length === 1) span = 12
    else if (p === wide) span = small.length === 1 ? 8 : 12
    else if (wide && small.length === 1) span = 4
    else span = smallSpan(small.length)
    return { ...p, span }
  })
})

// App Settings is for privileged roles only (as in the Settings dialog).
const isAdmin = computed(() => !!userContextResource.data?.is_privileged)

// computed, so the date's language follows the Language menu.
const todayLabel = computed(() =>
  new Date().toLocaleDateString(dateLocale(), { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }),
)

const greeting = computed(() => {
  const hour = new Date().getHours()
  // Whole sentence as one key ("Good morning, {0}") so languages can put
  // the name where their grammar wants it.
  // Written out in full (not built from pieces) so the auto-translate's
  // text collector finds each one.
  const firstName = (session.full_name || '').split(' ')[0] || session.user || ''
  if (hour < 12) return t('Good morning, {0}', [firstName])
  if (hour < 17) return t('Good afternoon, {0}', [firstName])
  return t('Good evening, {0}', [firstName])
})
</script>

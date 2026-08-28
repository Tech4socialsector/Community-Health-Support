<template>
  <AppLayout>
    <PageHeader>
      <template #title>
        <h1 class="text-lg font-semibold text-gray-900 dark:text-gray-100">Dashboard</h1>
      </template>
      <template #actions>
        <Button variant="outline" :loading="loading" @click="refresh">
          <template #prefix>
            <FeatherIcon name="refresh-cw" class="h-4 w-4" />
          </template>
          Refresh
        </Button>
      </template>
    </PageHeader>

    <div v-if="loading && !dashboardCardsResource.data" class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <div
        v-for="i in 6"
        :key="i"
        class="flex items-center gap-4 rounded-lg border p-4 dark:border-gray-800"
      >
        <Skeleton width="2.5rem" height="2.5rem" />
        <div class="flex-1 space-y-2">
          <Skeleton width="3rem" height="1.25rem" />
          <Skeleton width="70%" height="0.75rem" />
        </div>
      </div>
    </div>
    <ErrorMessage v-else-if="dashboardCardsResource.error" :message="dashboardCardsResource.error" />
    <ErrorMessage v-else-if="dashboardStatsResource.error" :message="dashboardStatsResource.error" />

    <div
      v-else-if="cards.length === 0"
      class="py-10 text-center text-gray-500 dark:text-gray-400"
    >
      No dashboard cards are configured yet. Ask a coordinator to enable
      cards in App Setting.
    </div>

    <div v-else class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <div
        v-for="card in cards"
        :key="card.stat_key"
        class="flex items-center gap-4 rounded-lg border bg-white p-4 dark:border-gray-800 dark:bg-gray-800"
      >
        <span class="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg" :class="colorClasses(card.color)">
          <LucideIcon :name="card.icon" class="h-5 w-5" />
        </span>
        <span>
          <span class="block text-2xl font-semibold text-gray-900 dark:text-gray-100">
            {{ statValue(card.stat_key) }}
          </span>
          <span class="block text-sm text-gray-500 dark:text-gray-400">{{ card.label }}</span>
        </span>
      </div>
    </div>
  </AppLayout>
</template>

<script setup>
import { computed } from 'vue'
import { FeatherIcon, ErrorMessage, Button } from 'frappe-ui'
import AppLayout from '@/layouts/AppLayout.vue'
import PageHeader from '@/components/PageHeader.vue'
import Skeleton from '@/components/Skeleton.vue'
import LucideIcon from '@/components/LucideIcon.vue'
import { dashboardCardsResource, dashboardStatsResource, colorClasses } from '@/data/dashboard'
import { setPageTitle } from '@/data/pageTitle'

setPageTitle('Dashboard')

dashboardCardsResource.fetch()
dashboardStatsResource.fetch()

const loading = computed(() => dashboardCardsResource.loading || dashboardStatsResource.loading)
const cards = computed(() => dashboardCardsResource.data || [])

function refresh() {
  dashboardCardsResource.reload()
  dashboardStatsResource.reload()
}

function statValue(key) {
  const value = dashboardStatsResource.data?.[key]
  return value == null ? '-' : value
}
</script>

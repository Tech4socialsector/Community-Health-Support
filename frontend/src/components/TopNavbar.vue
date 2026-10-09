<template>
  <div class="grid h-12 flex-shrink-0 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-4 border-b bg-white px-4 dark:border-gray-800 dark:bg-gray-900">
    <div class="flex min-w-0 items-center gap-2">
      <!-- Pages with a trail (lists, forms) show it here - Home / Household
      profile / HH-00027 / Family members - each part a way back up. Other
      pages show their plain title. -->
      <Breadcrumbs v-if="crumbs" :crumbs="crumbs" class="min-w-0" />
      <template v-else>
        <Tooltip text="Home">
          <router-link
            :to="{ name: 'Home' }"
            class="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800"
          >
            <FeatherIcon name="home" class="h-4 w-4" />
          </router-link>
        </Tooltip>
        <h1 class="truncate text-base font-semibold text-navy-900 dark:text-gray-100">
          {{ pageTitle }}
        </h1>
      </template>
    </div>

    <AwesomeBar class="w-full sm:w-96" />

    <div></div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { FeatherIcon, Tooltip } from 'frappe-ui'
import AwesomeBar from '@/components/AwesomeBar.vue'
import Breadcrumbs from '@/components/Breadcrumbs.vue'
import { pageTitle, pageCrumbs } from '@/data/pageTitle'

const route = useRoute()

// Only the current page's own trail - see setPageCrumbs.
const crumbs = computed(() => (pageCrumbs.value.path === route.path ? pageCrumbs.value.crumbs : null))
</script>

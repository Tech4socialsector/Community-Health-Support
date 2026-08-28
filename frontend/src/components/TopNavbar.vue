<template>
  <div class="grid h-12 flex-shrink-0 grid-cols-[1fr_auto_1fr] items-center gap-4 border-b bg-white px-4 dark:border-gray-800 dark:bg-gray-900">
    <div class="flex min-w-0 items-center gap-2">
      <Tooltip text="Home">
        <router-link
          :to="{ name: 'Home' }"
          class="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800"
        >
          <FeatherIcon name="home" class="h-4 w-4" />
        </router-link>
      </Tooltip>
      <h1 class="truncate text-base font-semibold text-gray-900 dark:text-gray-100">
        {{ pageTitle }}
      </h1>
    </div>

    <AwesomeBar class="w-full sm:w-96" />

    <div></div>
  </div>
</template>

<script setup>
import { FeatherIcon, Tooltip } from 'frappe-ui'
import AwesomeBar from '@/components/AwesomeBar.vue'
import { pageTitle } from '@/data/pageTitle'
</script>

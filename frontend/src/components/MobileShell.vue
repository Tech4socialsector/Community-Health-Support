<template>
  <div class="flex h-screen flex-col bg-gray-50 dark:bg-gray-900">
    <div class="flex flex-shrink-0 items-center gap-3 border-b bg-white px-4 py-3 dark:border-gray-800 dark:bg-gray-900">
      <img
        v-if="brandingResource.data?.app_logo"
        :src="brandingResource.data.app_logo"
        class="h-7 w-7 flex-shrink-0 rounded-lg object-cover"
      />
      <FeatherIcon v-else name="activity" class="h-6 w-6 flex-shrink-0 text-gray-500" />
      <h1 class="truncate text-base font-semibold text-gray-900 dark:text-gray-100">
        {{ pageTitle }}
      </h1>
    </div>

    <div class="border-b bg-white px-4 py-2 dark:border-gray-800 dark:bg-gray-900">
      <AwesomeBar class="w-full" />
    </div>

    <main class="flex-1 overflow-y-auto px-4 py-4 pb-20">
      <slot />
    </main>

    <MobileNav />
    <NotificationPanel />
    <AiAssistant />
  </div>
</template>

<script setup>
import { FeatherIcon } from 'frappe-ui'
import AwesomeBar from '@/components/AwesomeBar.vue'
import MobileNav from '@/components/MobileNav.vue'
import NotificationPanel from '@/components/NotificationPanel.vue'
import AiAssistant from '@/components/AiAssistant.vue'
import { brandingResource } from '@/data/branding'
import { pageTitle } from '@/data/pageTitle'
</script>

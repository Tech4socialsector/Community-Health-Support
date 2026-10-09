<template>
  <div class="flex h-screen flex-col bg-gray-50 dark:bg-gray-900">
    <!-- App bar: logo + app name (each page shows its own title below, so
    repeating it here only doubled it up). Padded for the notch / status
    bar when installed as an app. -->
    <div class="flex flex-shrink-0 items-center gap-3 border-b border-gray-200 bg-white px-4 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))] dark:border-gray-800 dark:bg-gray-900">
      <img :src="appLogo" alt="Logo" class="h-9 w-9 flex-shrink-0 rounded-lg bg-white object-contain p-0.5 ring-1 ring-gray-200 dark:ring-gray-700" />
      <span class="min-w-0">
        <span class="block truncate text-base font-bold leading-tight text-navy-900 dark:text-gray-100">{{ appName }}</span>
        <span class="block truncate text-xs text-gray-500 dark:text-gray-400">{{ pageTitle }}</span>
      </span>
    </div>

    <main class="min-w-0 flex-1 overflow-x-hidden overflow-y-auto px-4 pb-[calc(5.5rem+env(safe-area-inset-bottom))] pt-4">
      <slot />
    </main>

    <MobileNav />
    <NotificationPanel />
    <AiAssistant />
  </div>
</template>

<script setup>
import MobileNav from '@/components/MobileNav.vue'
import NotificationPanel from '@/components/NotificationPanel.vue'
import AiAssistant from '@/components/AiAssistant.vue'
import { computed } from 'vue'
import { appLogo, brandingResource } from '@/data/branding'
import { pageTitle } from '@/data/pageTitle'

const appName = computed(() => brandingResource.data?.app_name || 'CHW')
</script>

<template>
  <div class="flex h-screen flex-col bg-gray-50 dark:bg-gray-900">
    <!-- App bar: logo + app name (each page shows its own title below, so
    repeating it here only doubled it up). Padded for the notch / status
    bar when installed as an app. -->
    <div class="flex flex-shrink-0 items-center gap-3 border-b border-gray-200 bg-white px-4 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))] dark:border-gray-800 dark:bg-gray-900">
      <!-- Logo and name lead Home, as on most apps. -->
      <router-link :to="{ name: 'Home' }" class="flex min-w-0 items-center gap-3 rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-forest-400" :aria-label="t('Home')">
        <span class="h-9 w-9 flex-shrink-0"><AppMark /></span>
        <span class="min-w-0">
          <span class="block truncate text-base font-bold leading-tight text-navy-900 dark:text-gray-100">{{ appName }}</span>
          <span class="block truncate text-xs text-gray-500 dark:text-gray-400">{{ t(pageTitle) }}</span>
        </span>
      </router-link>
      <SyncStatus class="ml-auto" />
    </div>

    <main class="min-w-0 flex-1 overflow-x-hidden overflow-y-auto px-4 pb-[calc(5.5rem+env(safe-area-inset-bottom))] pt-4">
      <slot />
    </main>

    <MobileNav />
    <NotificationPanel />
    <AiAssistant />
    <!-- Opened from the Menu sheet's Settings (the desktop sidebar has its own). -->
    <SettingsDialog v-model="showSettingsDialog" />
  </div>
</template>

<script setup>
import MobileNav from '@/components/MobileNav.vue'
import NotificationPanel from '@/components/NotificationPanel.vue'
import AiAssistant from '@/components/AiAssistant.vue'
import SyncStatus from '@/components/SyncStatus.vue'
import SettingsDialog from '@/components/SettingsDialog.vue'
import { showSettingsDialog } from '@/data/settingsDialog'
import { computed } from 'vue'
import { brandingResource } from '@/data/branding'
import AppMark from '@/components/AppMark.vue'
import { pageTitle } from '@/data/pageTitle'

const appName = computed(() => brandingResource.data?.app_name || 'CHW')
</script>

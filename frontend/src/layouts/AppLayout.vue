<template>
  <MobileShell v-if="isMobile">
    <slot />
  </MobileShell>
  <div v-else class="flex h-screen bg-gray-50 dark:bg-gray-900">
    <AppSidebar />
    <div class="flex min-w-0 flex-1 flex-col">
      <TopNavbar />
      <main class="flex-1 overflow-y-auto px-4 py-4 sm:px-6 sm:py-6">
        <slot />
      </main>
    </div>
  </div>
</template>

<script setup>
import { breakpointsTailwind, useBreakpoints } from '@vueuse/core'
import AppSidebar from '@/components/AppSidebar.vue'
import TopNavbar from '@/components/TopNavbar.vue'
import MobileShell from '@/components/MobileShell.vue'

const breakpoints = useBreakpoints(breakpointsTailwind)
const isMobile = breakpoints.smaller('sm')
</script>

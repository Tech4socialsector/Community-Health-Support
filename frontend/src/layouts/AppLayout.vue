<template>
  <MobileShell v-if="isMobile">
    <slot />
  </MobileShell>
  <div v-else class="flex h-screen bg-gray-50 dark:bg-gray-900">
    <AppSidebar />
    <div class="flex min-w-0 flex-1 flex-col">
      <TopNavbar />
      <main class="min-w-0 flex-1 overflow-x-hidden overflow-y-auto px-4 py-4 sm:px-6 sm:py-6">
        <slot />
      </main>
    </div>
  </div>
</template>

<script setup>
import { onBeforeUnmount, onMounted } from 'vue'
import { breakpointsTailwind, useBreakpoints } from '@vueuse/core'
import AppSidebar from '@/components/AppSidebar.vue'
import TopNavbar from '@/components/TopNavbar.vue'
import MobileShell from '@/components/MobileShell.vue'

const breakpoints = useBreakpoints(breakpointsTailwind)
const isMobile = breakpoints.smaller('sm')

// The shell is exactly one screen tall and scrolls inside <main>. Anything
// that adds height below it (a long form's hidden parts, a popup's portal)
// made the page itself scroll too - two scrollbars on one screen. While the
// shell is up, the page never scrolls; only <main> does (see index.css).
onMounted(() => document.documentElement.classList.add('chw-shell'))
onBeforeUnmount(() => document.documentElement.classList.remove('chw-shell'))
</script>

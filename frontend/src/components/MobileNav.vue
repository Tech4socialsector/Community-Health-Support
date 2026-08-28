<template>
  <nav
    class="fixed inset-x-0 bottom-0 z-30 flex items-stretch justify-around border-t bg-white pb-[env(safe-area-inset-bottom)] dark:border-gray-800 dark:bg-gray-900"
  >
    <router-link
      :to="{ name: 'Home' }"
      class="flex flex-1 flex-col items-center gap-0.5 py-2 text-xs"
      :class="route.name === 'Home' ? 'text-gray-900 dark:text-gray-100' : 'text-gray-400 dark:text-gray-500'"
    >
      <FeatherIcon name="home" class="h-5 w-5" />
      Home
    </router-link>

    <router-link
      :to="{ name: 'Worklist' }"
      class="flex flex-1 flex-col items-center gap-0.5 py-2 text-xs"
      :class="route.name === 'Worklist' ? 'text-gray-900 dark:text-gray-100' : 'text-gray-400 dark:text-gray-500'"
    >
      <FeatherIcon name="check-square" class="h-5 w-5" />
      Worklist
    </router-link>

    <button
      class="relative flex flex-1 flex-col items-center gap-0.5 py-2 text-xs text-gray-400 dark:text-gray-500"
      @click="toggleNotifications"
    >
      <span class="relative">
        <FeatherIcon name="bell" class="h-5 w-5" />
        <span
          v-if="unreadCount > 0"
          class="absolute -right-1.5 -top-1 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-red-500 px-0.5 text-[9px] font-medium text-white"
        >
          {{ unreadCount > 9 ? '9+' : unreadCount }}
        </span>
      </span>
      Alerts
    </button>

    <button
      class="flex flex-1 flex-col items-center gap-0.5 py-2 text-xs text-gray-400 dark:text-gray-500"
      @click="showMenu = true"
    >
      <FeatherIcon name="menu" class="h-5 w-5" />
      Menu
    </button>
  </nav>

  <Transition name="menu-overlay">
    <div
      v-if="showMenu"
      class="fixed inset-0 z-40 bg-black/40"
      @click.self="showMenu = false"
    >
      <Transition name="menu-drawer" appear>
        <div
          v-if="showMenu"
          class="h-full w-72 max-w-[80vw] overflow-y-auto pb-[env(safe-area-inset-bottom)] pt-[env(safe-area-inset-top)]"
        >
          <AppSidebar disable-collapse embedded />
        </div>
      </Transition>
    </div>
  </Transition>
</template>

<script setup>
import { ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { FeatherIcon } from 'frappe-ui'
import AppSidebar from '@/components/AppSidebar.vue'
import { unreadCount, toggleNotifications } from '@/data/notifications'

const route = useRoute()
const showMenu = ref(false)

// AppSidebar's own items navigate via router.replace - close the drawer
// whenever that happens, the same way tapping a link in a mobile drawer
// normally dismisses it.
watch(() => route.fullPath, () => {
  showMenu.value = false
})
</script>

<style scoped>
.menu-overlay-enter-active,
.menu-overlay-leave-active {
  transition: opacity 0.2s ease;
}
.menu-overlay-enter-from,
.menu-overlay-leave-to {
  opacity: 0;
}

.menu-drawer-enter-active,
.menu-drawer-leave-active {
  transition: transform 0.2s ease;
}
.menu-drawer-enter-from,
.menu-drawer-leave-to {
  transform: translateX(-100%);
}
</style>

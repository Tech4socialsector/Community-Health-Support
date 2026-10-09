<template>
  <!-- Bottom tab bar - the phone's main navigation. Same destinations as
  the desktop sidebar's top items (Worklist was dropped there, so here too);
  the active tab gets the brand navy plus a forest bar along its top edge. -->
  <nav
    class="fixed inset-x-0 bottom-0 z-30 flex items-stretch justify-around border-t border-gray-200 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur dark:border-gray-800 dark:bg-gray-900/95"
  >
    <router-link
      v-for="tab in tabs"
      :key="tab.name"
      :to="{ name: tab.name }"
      class="relative flex flex-1 flex-col items-center gap-0.5 pb-2 pt-2.5 text-[11px] font-medium"
      :class="isActive(tab) ? 'text-navy-900 dark:text-gray-100' : 'text-gray-500 dark:text-gray-400'"
    >
      <span
        v-if="isActive(tab)"
        class="absolute inset-x-6 top-0 h-0.5 rounded-full bg-forest-600"
      />
      <LucideIcon :name="tab.icon" class="h-5 w-5" />
      {{ tab.label }}
    </router-link>

    <button
      type="button"
      class="relative flex flex-1 flex-col items-center gap-0.5 pb-2 pt-2.5 text-[11px] font-medium text-gray-500 dark:text-gray-400"
      @click="toggleNotifications"
    >
      <span class="relative">
        <LucideIcon name="bell" class="h-5 w-5" />
        <span
          v-if="unreadCount > 0"
          class="absolute -right-1.5 -top-1 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-red-500 px-0.5 text-[9px] font-semibold text-white"
        >
          {{ unreadCount > 9 ? '9+' : unreadCount }}
        </span>
      </span>
      Alerts
    </button>

    <button
      type="button"
      class="relative flex flex-1 flex-col items-center gap-0.5 pb-2 pt-2.5 text-[11px] font-medium text-gray-500 dark:text-gray-400"
      @click="showMenu = true"
    >
      <LucideIcon name="menu" class="h-5 w-5" />
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
import { computed, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import AppSidebar from '@/components/AppSidebar.vue'
import LucideIcon from '@/components/LucideIcon.vue'
import { unreadCount, toggleNotifications } from '@/data/notifications'
import { userContextResource } from '@/data/userContext'

const route = useRoute()
const showMenu = ref(false)

// Overview is coordinator-only on the backend, same as in the sidebar.
// `match` also lights a tab up on pages reached from it (a record opened
// from the Overview drilldown, a form opened from Home).
const tabs = computed(() => [
  { name: 'Home', label: 'Home', icon: 'house', match: ['Home', 'DoctypeList', 'DoctypeNew', 'DoctypeForm'] },
  { name: 'WorkOrders', label: 'Work Orders', icon: 'clipboard-list', match: ['WorkOrders'] },
  ...(userContextResource.data?.is_privileged
    ? [{ name: 'Overview', label: 'Overview', icon: 'chart-bar-big', match: ['Overview', 'RecordView'] }]
    : []),
])

function isActive(tab) {
  return tab.match.includes(route.name)
}

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

<template>
  <div
    v-if="notificationsState.visible"
    ref="panelRef"
    class="fixed top-0 z-20 flex h-screen w-full flex-col border-l bg-white shadow-lg dark:border-gray-800 dark:bg-gray-900 sm:w-96"
    :style="{ insetInlineStart: isMobile ? '0' : sidebarWidth }"
  >
    <div class="flex items-center justify-between border-b px-4 py-3 dark:border-gray-800">
      <h2 class="text-sm font-semibold text-gray-900 dark:text-gray-100">Notifications</h2>
      <div class="flex items-center gap-1">
        <Tooltip v-if="unreadCount > 0" text="Mark all as read">
          <button
            class="flex h-7 w-7 items-center justify-center rounded text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800"
            @click="markAllRead"
          >
            <FeatherIcon name="check-circle" class="h-4 w-4" />
          </button>
        </Tooltip>
        <Tooltip text="Close">
          <button
            class="flex h-7 w-7 items-center justify-center rounded text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800"
            @click="notificationsState.visible = false"
          >
            <FeatherIcon name="x" class="h-4 w-4" />
          </button>
        </Tooltip>
      </div>
    </div>

    <Tabs :tabs="tabDefs" v-model="tabIndex" class="flex-1 overflow-hidden">
      <template #tab-item="{ tab, selected }">
        <button
          class="flex items-center gap-1.5 px-1 py-2.5 text-sm font-medium"
          :class="selected ? 'text-gray-900 dark:text-gray-100' : 'text-gray-500 dark:text-gray-400'"
        >
          {{ tab.label }}
          <span
            v-if="tab.label === 'Unread' && unreadCount > 0"
            class="flex h-4 min-w-4 items-center justify-center rounded-full bg-gray-100 px-1 text-[10px] font-medium text-gray-600 dark:bg-gray-800 dark:text-gray-300"
          >
            {{ unreadCount }}
          </span>
        </button>
      </template>
      <template #tab-panel>
        <div class="flex-1 overflow-y-auto">
          <div v-if="notificationsResource.loading && !notificationsResource.data" class="space-y-1 p-4">
            <div v-for="i in 4" :key="i" class="flex items-start gap-3 py-2">
              <Skeleton width="2rem" height="2rem" round />
              <div class="flex-1 space-y-1.5">
                <Skeleton width="70%" height="0.75rem" />
                <Skeleton width="40%" height="0.625rem" />
              </div>
            </div>
          </div>
          <div
            v-else-if="visibleLogs.length === 0"
            class="flex flex-col items-center gap-2 py-16 text-center text-gray-500 dark:text-gray-400"
          >
            <FeatherIcon name="bell" class="h-6 w-6" />
            <span class="text-sm">{{ tabIndex === 1 ? "You're all caught up!" : 'No notifications yet.' }}</span>
          </div>
          <button
            v-for="n in visibleLogs"
            :key="n.name"
            class="flex w-full items-start gap-3 border-b px-4 py-3 text-left hover:bg-gray-50 dark:border-gray-800 dark:hover:bg-gray-800"
            @click="open(n)"
          >
            <span
              class="mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full"
              :class="iconClasses(n)"
            >
              <FeatherIcon :name="iconName(n)" class="h-4 w-4" />
            </span>
            <span class="min-w-0 flex-1">
              <span class="flex items-start justify-between gap-2">
                <span
                  class="block text-sm font-medium text-gray-900 dark:text-gray-100"
                  v-html="n.title || n.subject || 'Notification'"
                />
                <span
                  v-if="!n.read"
                  class="mt-1.5 h-2 w-2 flex-shrink-0 rounded-full bg-blue-500"
                />
              </span>
              <span
                v-if="n.description"
                class="mt-0.5 line-clamp-2 block text-xs text-gray-500 dark:text-gray-400"
                v-html="n.description"
              />
              <span class="mt-1 block text-xs text-gray-400 dark:text-gray-500">
                {{ formatTime(n.creation) }}
              </span>
            </span>
          </button>
        </div>
      </template>
    </Tabs>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import { onClickOutside, onKeyStroke, useBreakpoints, breakpointsTailwind } from '@vueuse/core'
import { FeatherIcon, Tabs, Tooltip } from 'frappe-ui'
import Skeleton from '@/components/Skeleton.vue'
import {
  notificationsState,
  notificationsResource,
  notificationLogs,
  unreadCount,
  markAllRead,
  markRead,
} from '@/data/notifications'
import { findModuleByDoctype } from '@/data/modules'

const props = defineProps({
  sidebarWidth: { type: String, default: '15rem' },
  ignoreOutsideClick: { type: [Object, String], default: null },
})

const router = useRouter()
const panelRef = ref(null)
const tabIndex = ref(0)
const tabDefs = [{ label: 'All' }, { label: 'Unread' }]

const breakpoints = useBreakpoints(breakpointsTailwind)
const isMobile = breakpoints.smaller('sm')

const visibleLogs = computed(() =>
  tabIndex.value === 1 ? notificationLogs.value.filter((n) => !n.read) : notificationLogs.value,
)

onClickOutside(
  panelRef,
  () => {
    notificationsState.visible = false
  },
  { ignore: props.ignoreOutsideClick ? [props.ignoreOutsideClick] : [] },
)

onKeyStroke('Escape', () => {
  if (notificationsState.visible) notificationsState.visible = false
})

const TYPE_ICONS = {
  Mention: 'at-sign',
  Assignment: 'user-check',
  Share: 'share-2',
  Alert: 'alert-circle',
  'Energy Point': 'zap',
}

function iconName(n) {
  return TYPE_ICONS[n.type] || 'bell'
}

function iconClasses(n) {
  if (!n.read) return 'bg-blue-100 text-blue-600 dark:bg-blue-900/40 dark:text-blue-400'
  return 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400'
}

function formatTime(dateStr) {
  if (!dateStr) return ''
  const diffMs = Date.now() - new Date(dateStr).getTime()
  const diffMin = Math.round(diffMs / 60000)
  if (diffMin < 1) return 'just now'
  if (diffMin < 60) return `${diffMin}m ago`
  const diffHr = Math.round(diffMin / 60)
  if (diffHr < 24) return `${diffHr}h ago`
  return `${Math.round(diffHr / 24)}d ago`
}

function open(n) {
  if (!n.read) markRead(n.name)
  const mod = n.document_type ? findModuleByDoctype(n.document_type) : null
  if (mod && n.document_name) {
    router.push({
      name: 'DoctypeForm',
      params: { doctypeRoute: mod.route, name: n.document_name },
    })
    notificationsState.visible = false
  }
}
</script>

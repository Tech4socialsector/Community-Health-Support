<template>
  <div ref="sidebarRef" class="flex h-full flex-shrink-0">
    <Sidebar
      v-model:collapsed="collapsed"
      :header="header"
      :sections="sections"
      :disableCollapse="disableCollapse"
    >
      <template #sidebar-item="{ item }">
        <hr v-if="item.dividerBefore" class="my-2 border-gray-200 dark:border-gray-800" />
        <SidebarItem
          :label="item.label"
          :accessKey="item.accessKey"
          :icon="item.icon"
          :suffix="item.suffix"
          :to="item.to"
          :isActive="item.isActive"
          :onClick="item.onClick"
        />
      </template>
      <template #footer-items="{ isCollapsed }">
        <UserHoverCard>
          <div class="flex items-center gap-2 rounded px-2 py-1.5" :class="{ 'justify-center': isCollapsed }">
            <Avatar :image="session.user_image" :label="session.full_name || session.user" size="sm" shape="square" />
            <span v-if="!isCollapsed" class="min-w-0 flex-1">
              <span class="block truncate text-sm font-medium text-gray-700 dark:text-gray-300">
                {{ session.full_name || session.user }}
              </span>
              <span class="block truncate text-xs text-gray-500 dark:text-gray-400">
                {{ session.user }}
              </span>
            </span>
          </div>
        </UserHoverCard>
      </template>
    </Sidebar>
  </div>
  <template v-if="!embedded">
    <NotificationPanel :sidebar-width="collapsed ? '3rem' : '15rem'" :ignore-outside-click="sidebarRef" />
    <SettingsDialog v-model="showSettingsDialog" />
    <AiAssistant />
  </template>
</template>

<script setup>
import { computed, ref } from 'vue'
import { useRoute } from 'vue-router'
import { Sidebar, SidebarItem, Avatar } from 'frappe-ui'
import moduleIcon from '@/components/moduleIcon'
import NotificationPanel from '@/components/NotificationPanel.vue'
import UserHoverCard from '@/components/UserHoverCard.vue'
import SettingsDialog from '@/components/SettingsDialog.vue'
import AiAssistant from '@/components/AiAssistant.vue'
import { session, logoutResource } from '@/data/session'
import { clearSiteData } from '@/data/clearSiteData'
import { brandingResource } from '@/data/branding'
import { activeModule } from '@/data/activeModule'
import { notificationsResource, unreadCount, toggleNotifications } from '@/data/notifications'
import { showSettingsDialog, openSettingsDialog } from '@/data/settingsDialog'

const props = defineProps({
  // Forced open (never icon-collapsed) when rendered inside the mobile
  // drawer, where Sidebar's own `isMobile` breakpoint check would otherwise
  // collapse it to icon-only regardless of the drawer's own wider width.
  disableCollapse: { type: Boolean, default: false },
  // The mobile drawer's copy of this component shouldn't render its own
  // NotificationPanel/SettingsDialog - MobileShell already provides a
  // NotificationPanel, and both copies share the same showSettingsDialog
  // state, so rendering a second Dialog here would be a pointless duplicate.
  embedded: { type: Boolean, default: false },
})

const route = useRoute()
const appName = computed(() => brandingResource.data?.app_name || 'CHW')
const collapsed = ref(false)
const sidebarRef = ref(null)

notificationsResource.fetch()

const header = computed(() => ({
  title: appName.value,
  subtitle: session.full_name || session.user,
  logo: brandingResource.data?.app_logo || null,
  menuItems: [
    {
      label: 'Settings',
      icon: 'settings',
      onClick: openSettingsDialog,
    },
    {
      label: 'Help',
      icon: 'help-circle',
      onClick: () => window.open('https://frappeframework.com/docs', '_blank', 'noopener'),
    },
    {
      label: 'Clear site data',
      icon: 'refresh-cw',
      onClick: () => {
        if (window.confirm('This clears cached app data and reloads the page. Continue?')) {
          clearSiteData()
        }
      },
    },
    {
      label: 'Go to Desk',
      icon: 'grid',
      onClick: () => window.open('/app', '_self'),
    },
    {
      label: 'Logout',
      icon: 'log-out',
      onClick: () => logoutResource.submit(),
    },
  ],
}))

const sections = computed(() => {
  const sectionList = [
    {
      label: '',
      items: [
        {
          label: 'Notifications',
          icon: moduleIcon('bell'),
          suffix: unreadCount.value > 0 ? String(unreadCount.value > 9 ? '9+' : unreadCount.value) : undefined,
          onClick: toggleNotifications,
        },
        {
          label: 'Home',
          icon: moduleIcon('home'),
          to: { name: 'Home' },
          dividerBefore: true,
          isActive: route.name === 'Home',
        },
        {
          label: 'Worklist',
          icon: moduleIcon('check-square'),
          to: { name: 'Worklist' },
          isActive: route.name === 'Worklist',
        },
      ],
    },
  ]

  if (activeModule.value) {
    const mod = activeModule.value
    sectionList.push({
      label: mod.label,
      items: (mod.doctypes || []).map((item) => ({
        label: item.label || item.doctype_name,
        icon: moduleIcon(item.icon || mod.icon),
        to: { name: 'DoctypeList', params: { doctypeRoute: item.route } },
        isActive: route.params.doctypeRoute === item.route,
      })),
    })
  }

  return sectionList
})
</script>

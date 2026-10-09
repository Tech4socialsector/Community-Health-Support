<template>
  <div ref="sidebarRef" class="chw-sidebar flex h-full flex-shrink-0">
    <Sidebar
      v-model:collapsed="collapsed"
      :header="header"
      :sections="sections"
      :disableCollapse="disableCollapse"
    >
      <template #sidebar-item="{ item }">
        <hr v-if="item.dividerBefore" class="my-2 border-gray-200 dark:border-gray-800" />
        <!-- Nested connected forms are indented per level, with a guide
        line; no indent when icon-collapsed, where it would push icons off. -->
        <div
          :class="{ 'border-l border-gray-200 dark:border-gray-800': item.depth && !collapsed }"
          :style="item.depth && !collapsed ? { marginLeft: `${item.depth * 0.75}rem` } : null"
        >
          <SidebarItem
            :label="item.label"
            :accessKey="item.accessKey"
            :icon="item.icon"
            :suffix="item.suffix"
            :to="item.to"
            :isActive="item.isActive"
            :onClick="item.onClick"
            :class="{ 'chw-nav-active': item.isActive }"
          />
        </div>
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
import { brandingResource, appLogo } from '@/data/branding'
import { activeModule, sidebarTrail } from '@/data/activeModule'
import { childItemsOf } from '@/data/modules'
import { notificationsResource, unreadCount, toggleNotifications } from '@/data/notifications'
import { showSettingsDialog, openSettingsDialog } from '@/data/settingsDialog'
import { userContextResource } from '@/data/userContext'

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
  logo: appLogo.value,
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
      ],
    },
    {
      label: 'My work',
      items: [
        {
          label: 'Work Orders',
          icon: moduleIcon('clipboard-list'),
          to: { name: 'WorkOrders' },
          isActive: route.name === 'WorkOrders',
        },
      ],
    },
  ]

  // Overview mirrors the Desk chw-dashboard page, which is privileged-only
  // (Administrator/System Manager/Program Coordinator) on the backend -
  // hidden here rather than shown and then throwing a Permission Error once
  // opened. Its whole section goes with it, so CHWs see no empty heading.
  if (userContextResource.data?.is_privileged) {
    sectionList.push({
      label: 'Administration',
      items: [
        {
          label: 'Overview',
          icon: moduleIcon('bar-chart-2'),
          to: { name: 'Overview' },
          isActive: route.name === 'Overview',
        },
      ],
    })
  }

  // The module's forms tree only belongs on its own list/form pages - Work
  // Orders, Overview and Home hide it. activeModule / sidebarTrail are left
  // untouched, so the same branch reappears when a form is opened again.
  if (activeModule.value && route.params.doctypeRoute) {
    const mod = activeModule.value
    const doctypes = mod.doctypes || []

    // Top level = forms no other form in this module connects down to
    // (Household profile). Everything else nests under its parent and only
    // appears once that parent is on the open branch (sidebarTrail). A
    // module whose forms have no connections at all stays a flat list.
    const childRoutes = new Set(doctypes.flatMap((d) => childItemsOf(d).map((c) => c.route)))
    const roots = doctypes.filter((d) => !childRoutes.has(d.route))
    const trail = sidebarTrail.value
    const items = []

    // Matching trail[depth] (not just "is on the trail") keeps a form with
    // two parents from expanding in both places - only the copy at the
    // position the user actually walked down to opens.
    const addLevel = (nodes, depth) => {
      for (const node of nodes) {
        const onBranch = trail[depth] === node.route
        items.push({
          label: node.label || node.doctype_name,
          icon: moduleIcon(node.icon || mod.icon),
          to: { name: 'DoctypeList', params: { doctypeRoute: node.route } },
          depth,
          isActive: onBranch && depth === trail.length - 1 && route.params.doctypeRoute === node.route,
        })
        if (onBranch) addLevel(childItemsOf(node), depth + 1)
      }
    }
    addLevel(roots.length ? roots : doctypes, 0)

    sectionList.push({ label: mod.label, items })
  }

  return sectionList
})
</script>

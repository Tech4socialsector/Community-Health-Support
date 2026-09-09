<template>
  <div ref="sidebarRef" class="app-sidebar flex h-full flex-shrink-0">
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
        <Tooltip :text="`Ask ${assistantBotName}`" :disabled="!isCollapsed">
          <button
            v-if="assistantConfigResource.data?.enabled"
            class="assistant-card relative flex w-full items-center gap-2 overflow-hidden rounded-lg border border-gray-200 bg-gray-50 px-2 py-1.5 text-left hover:bg-gray-100 dark:border-gray-700 dark:bg-gray-800/60 dark:hover:bg-gray-800"
            :class="{ 'justify-center': isCollapsed }"
            @click="toggleAssistant"
          >
            <span class="assistant-badge flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-gray-900 text-white dark:bg-gray-100 dark:text-gray-900">
              <SparklesIcon class="h-3.5 w-3.5" />
            </span>
            <span v-if="!isCollapsed" class="min-w-0 flex-1">
              <span class="block truncate text-sm font-medium text-gray-700 dark:text-gray-300">
                {{ assistantBotName }}
              </span>
              <span class="block truncate text-xs text-gray-500 dark:text-gray-400">
                Assistant
              </span>
            </span>
          </button>
        </Tooltip>
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

<style>
/* frappe-ui's Dropdown (used for the account menu above) sets no z-index
of its own - it relies on portal/DOM paint order, which is fine standing
alone on desktop but loses to MobileNav.vue's mobile drawer overlay
(z-40): opening this menu from inside that drawer left it hit-testable
(clicks landed on the right item, confirmed via elementFromPoint) but
not actually visible, since the drawer's own backdrop painted over it.
.dropdown-content itself is position:static (a plain child div) - the
actual position:fixed element that needs the z-index is reka-ui's popper
wrapper one level up, identified by data-reka-popper-content-wrapper
(no class of its own). Not scoped to one dialog instance (unlike
AiAssistant's data-dialog hook) because this wrapper is shared by every
Dropdown/Popover in the app, and all of them should sit above that
drawer for the same reason.

!important because a plain z-index here didn't reliably win in testing -
setting the exact same property to the exact same value via inline style
(equivalent specificity-wise to a scoped attribute selector) did take
effect, so something about this rule's load timing/order relative to the
popper wrapper's own first paint made the plain version unreliable. */
[data-reka-popper-content-wrapper] {
  z-index: 50 !important;
}

/* frappe-ui's Sidebar hardcodes both its own width (w-60) and a single
overflow-y-auto on its root - header, every section, and the "Collapse"
footer item all share one scroll region. Neither is exposed as a prop, so
overridden here from the outside instead of forking the component.

Widened slightly (15rem -> 16.75rem) for a bit more breathing room per
the request. Root scroll is turned off and moved onto the module section
alone (see .app-sidebar :deep(nav):last-of-type below) so a long module
list scrolls in its own box instead of pushing Home/Worklist/the
Collapse footer off-screen. */
.app-sidebar > [class*='w-60'] {
  width: 16.75rem;
  overflow-y: hidden;
}
.app-sidebar > [class*='w-60'].w-12 {
  width: 3rem;
}

/* The module section is the second (and last) SidebarSection rendered
before the footer - a divider + independent scroll box only make sense
once that section actually exists, so this must not affect the base
Home/Worklist-only sidebar (e.g. on doctypes with no active module). */
.app-sidebar > [class*='w-60'] > div.flex-col.mt-2:nth-of-type(2) {
  margin-top: 0.5rem;
  border-top: 1px solid theme('colors.gray.200');
  padding-top: 0.5rem;
  min-height: 0;
  display: flex;
  flex-direction: column;
}
:global(.dark) .app-sidebar > [class*='w-60'] > div.flex-col.mt-2:nth-of-type(2) {
  border-top-color: theme('colors.gray.800');
}
.app-sidebar > [class*='w-60'] > div.flex-col.mt-2:nth-of-type(2) nav {
  overflow-y: auto;
  max-height: 40vh;
}
</style>

<style scoped>
/* The row itself now has a real card surface (border + fill, see the
template) rather than being a plain hover-only row like the other
sidebar items - a soft glow sweeps behind it on a loop via ::before
(z-indexed under the icon/text, which get position:relative + z-index
below) so the whole card reads as "alive," not just the small icon
badge. Kept independent of assistant-badge's own pulse rather than
merged into one animation - they're on different elements. */
.assistant-card {
  animation: assistant-card-glow 3.2s ease-in-out infinite;
}
.assistant-card::before {
  content: '';
  position: absolute;
  inset: -40% -10%;
  background: radial-gradient(circle, rgba(99, 102, 241, 0.35), transparent 70%);
  animation: assistant-card-sweep 3.2s ease-in-out infinite;
  pointer-events: none;
}
.assistant-card > * {
  position: relative;
  z-index: 1;
}

@keyframes assistant-card-glow {
  0%, 100% {
    box-shadow: 0 0 0 0 rgba(99, 102, 241, 0);
  }
  50% {
    box-shadow: 0 0 12px 1px rgba(99, 102, 241, 0.25);
  }
}

@keyframes assistant-card-sweep {
  0%, 100% {
    transform: translateX(-20%);
    opacity: 0.5;
  }
  50% {
    transform: translateX(20%);
    opacity: 1;
  }
}

@media (prefers-reduced-motion: reduce) {
  .assistant-card,
  .assistant-card::before {
    animation: none;
  }
}

/* Same "breathing glow, not a literal blink" reasoning as MobileNav.vue's
assistant-fab: a hard on/off blink reads as an alert/error state on
something that's just inviting a tap. Ring sized to this badge's own
24px (h-6 w-6), not copy-pasted from the larger floating button. */
.assistant-badge {
  position: relative;
  animation: assistant-badge-breathe 2.4s ease-in-out infinite;
}
.assistant-badge::after {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: 9999px;
  background: #111827;
  animation: assistant-badge-ping 2.4s ease-out infinite;
  pointer-events: none;
}
:global(.dark) .assistant-badge::after {
  background: #f3f4f6;
}

@keyframes assistant-badge-breathe {
  0%, 100% {
    transform: scale(1);
  }
  50% {
    transform: scale(1.08);
  }
}

@keyframes assistant-badge-ping {
  0% {
    opacity: 0.35;
    transform: scale(1);
  }
  100% {
    opacity: 0;
    transform: scale(1.7);
  }
}

@media (prefers-reduced-motion: reduce) {
  .assistant-badge,
  .assistant-badge::after {
    animation: none;
  }
}
</style>

<script setup>
import { computed, ref } from 'vue'
import { useRoute } from 'vue-router'
import { Sidebar, SidebarItem, Avatar, Tooltip } from 'frappe-ui'
import moduleIcon from '@/components/moduleIcon'
import NotificationPanel from '@/components/NotificationPanel.vue'
import UserHoverCard from '@/components/UserHoverCard.vue'
import SettingsDialog from '@/components/SettingsDialog.vue'
import AiAssistant from '@/components/AiAssistant.vue'
import SparklesIcon from '@/components/SparklesIcon.vue'
import { session, logoutResource } from '@/data/session'
import { clearSiteData } from '@/data/clearSiteData'
import { brandingResource } from '@/data/branding'
import { activeModule } from '@/data/activeModule'
import { notificationsResource, unreadCount, toggleNotifications } from '@/data/notifications'
import { showSettingsDialog, openSettingsDialog } from '@/data/settingsDialog'
import { assistantConfigResource, toggleAssistant } from '@/data/aiAssistant'

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
const assistantBotName = computed(() => assistantConfigResource.data?.bot_name || 'Assistant')
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

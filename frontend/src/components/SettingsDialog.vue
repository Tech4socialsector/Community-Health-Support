<template>
  <Dialog v-model="show" :options="{ size: '5xl' }">
    <template #body>
      <div class="flex h-[34rem] max-h-[80vh] flex-col">
        <div class="flex h-12 flex-shrink-0 items-center justify-between border-b px-4 dark:border-gray-800">
          <h1 class="text-base font-semibold text-gray-900 dark:text-gray-100">Settings</h1>
          <button
            class="flex h-7 w-7 items-center justify-center rounded text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800"
            @click="show = false"
          >
            <FeatherIcon name="x" class="h-4 w-4" />
          </button>
        </div>

        <div class="flex min-h-0 flex-1">
          <nav class="w-48 flex-shrink-0 overflow-y-auto border-r px-3 py-4 dark:border-gray-800 sm:w-56">
            <div v-for="group in groupedTabs" :key="group.label" class="mb-4">
              <div class="mb-1 px-2 text-xs font-medium uppercase tracking-wide text-gray-400 dark:text-gray-500">
                {{ group.label }}
              </div>
              <button
                v-for="tab in group.tabs"
                :key="tab.key"
                class="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm"
                :class="activeTab === tab.key
                  ? 'bg-gray-100 font-medium text-gray-900 dark:bg-gray-800 dark:text-gray-100'
                  : 'text-gray-600 hover:bg-gray-50 dark:text-gray-400 dark:hover:bg-gray-800'"
                @click="activeTab = tab.key"
              >
                <component :is="tab.icon" class="h-4 w-4 flex-shrink-0" />
                {{ tab.label }}
              </button>
            </div>
          </nav>

          <div class="min-w-0 flex-1 overflow-y-auto">
            <div class="px-6 py-6 sm:px-8">
              <ProfilePanel v-if="activeTab === 'profile'" />
              <NotificationSettingsPanel v-else-if="activeTab === 'notifications'" />

              <div v-else-if="activeTab === 'appearance'">
                <div class="mb-1.5 text-sm font-medium text-gray-700 dark:text-gray-300">Appearance</div>
                <TabButtons v-model="theme" :buttons="themeButtons" />
              </div>

              <div v-else-if="activeTab === 'language'">
                <p class="mb-4 text-sm text-gray-500 dark:text-gray-400">
                  Choose the language used for emails and other Frappe-side text.
                </p>
                <div v-if="languagesResource.loading && !languagesResource.data" class="space-y-1">
                  <Skeleton v-for="i in 6" :key="i" height="2.25rem" />
                </div>
                <div v-else class="flex flex-col gap-1">
                  <button
                    v-for="opt in languagesResource.data"
                    :key="opt.value"
                    class="flex items-center justify-between rounded px-3 py-2 text-left text-sm hover:bg-gray-100 dark:hover:bg-gray-800"
                    :class="{ 'bg-gray-100 dark:bg-gray-800': session.user_language === opt.value }"
                    @click="selectLanguage(opt.value)"
                  >
                    <span>{{ opt.label }}</span>
                    <FeatherIcon v-if="session.user_language === opt.value" name="check" class="h-4 w-4" />
                  </button>
                </div>
              </div>

              <SettingsDoctypePanel v-else-if="activeTab === 'app-setting'" doctype="App Setting" />
              <SettingsDoctypePanel v-else-if="activeTab === 'pnc-interval'" doctype="PNC Visit Interval Master" />
              <EmailSettingsPanel v-else-if="activeTab === 'email-settings'" @close="show = false" />
            </div>
          </div>
        </div>
      </div>
    </template>
  </Dialog>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import { Dialog, FeatherIcon, TabButtons } from 'frappe-ui'
import SettingsDoctypePanel from '@/components/SettingsDoctypePanel.vue'
import ProfilePanel from '@/components/ProfilePanel.vue'
import NotificationSettingsPanel from '@/components/NotificationSettingsPanel.vue'
import EmailSettingsPanel from '@/components/EmailSettingsPanel.vue'
import Skeleton from '@/components/Skeleton.vue'
import moduleIcon from '@/components/moduleIcon'
import { session } from '@/data/session'
import { languagesResource, setUserLanguage } from '@/data/language'
import { currentTheme } from '@/data/theme'
import { userContextResource } from '@/data/userContext'

const props = defineProps({
  modelValue: { type: Boolean, default: false },
})
const emit = defineEmits(['update:modelValue'])

const show = computed({
  get: () => props.modelValue,
  set: (v) => emit('update:modelValue', v),
})

const isPrivileged = computed(() => !!userContextResource.data?.is_privileged)
const isSystemAdmin = computed(() => !!userContextResource.data?.is_system_admin)

const activeTab = ref('profile')

// Reset to the first tab each time the panel is reopened, so a privileged
// user who last viewed an admin-only tab doesn't leave a non-privileged
// session on a blank pane if their role context changes between opens.
watch(show, (visible) => {
  if (visible) activeTab.value = 'profile'
})

const groupedTabs = computed(() => {
  const groups = [
    {
      label: 'Account',
      tabs: [
        { key: 'profile', label: 'Profile', icon: moduleIcon('user') },
        { key: 'notifications', label: 'Notifications', icon: moduleIcon('bell') },
        { key: 'appearance', label: 'Appearance', icon: moduleIcon('sun') },
        { key: 'language', label: 'Language', icon: moduleIcon('globe') },
      ],
    },
  ]
  if (isPrivileged.value) {
    groups.push({
      label: 'App Settings',
      tabs: [
        { key: 'app-setting', label: 'App Settings', icon: moduleIcon('sliders') },
        { key: 'pnc-interval', label: 'PNC Visit Interval', icon: moduleIcon('calendar') },
      ],
    })
  }
  if (isSystemAdmin.value) {
    groups.push({
      label: 'Email Settings',
      tabs: [{ key: 'email-settings', label: 'Email Settings', icon: moduleIcon('mail') }],
    })
  }
  return groups
})

const themeButtons = [
  { label: 'Light', value: 'light' },
  { label: 'Dark', value: 'dark' },
]

const theme = computed({
  get: () => currentTheme.value,
  set: (v) => (currentTheme.value = v),
})

function selectLanguage(value) {
  setUserLanguage(value)
}
</script>

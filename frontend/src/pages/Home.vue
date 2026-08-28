<template>
  <AppLayout>
    <PageHeader>
      <template #title>
        <h1 class="text-lg font-semibold text-gray-900 dark:text-gray-100">{{ greeting }}</h1>
      </template>
    </PageHeader>

    <div v-if="modulesResource.loading && !modulesResource.data" class="grid grid-cols-3 gap-3 sm:grid-cols-[repeat(auto-fill,minmax(7rem,max-content))] sm:gap-4">
      <div v-for="i in 6" :key="i" class="flex flex-col items-center gap-2 p-2">
        <Skeleton width="4rem" height="4rem" round />
        <Skeleton width="3.5rem" height="0.75rem" />
      </div>
    </div>
    <ErrorMessage v-else-if="modulesResource.error" :message="modulesResource.error" />
    <div
      v-else-if="!modulesResource.data || modulesResource.data.length === 0"
      class="py-10 text-center text-gray-500 dark:text-gray-400"
    >
      No modules are configured for your account yet. Ask a coordinator to
      enable modules in App Module Setting.
    </div>

    <div v-else class="grid grid-cols-3 gap-3 sm:grid-cols-[repeat(auto-fill,minmax(7rem,max-content))] sm:gap-4">
      <button
        v-for="mod in modulesResource.data"
        :key="mod.label"
        class="flex flex-col items-center gap-2 rounded-lg p-2 text-center hover:bg-gray-100 dark:hover:bg-gray-800"
        :class="{ 'bg-gray-100 dark:bg-gray-800': activeModule?.label === mod.label }"
        @click="toggleModule(mod)"
      >
        <span class="flex h-16 w-16 items-center justify-center rounded-2xl bg-white shadow-sm ring-1 ring-gray-200 dark:bg-gray-800 dark:ring-gray-700 sm:h-[4.5rem] sm:w-[4.5rem]">
          <LucideIcon :name="mod.icon" class="h-7 w-7 text-gray-600 dark:text-gray-300 sm:h-8 sm:w-8" />
        </span>
        <span class="line-clamp-2 text-xs font-medium leading-tight text-gray-900 dark:text-gray-100 sm:text-sm">
          {{ mod.label }}
        </span>
      </button>
    </div>

    <!-- Desktop already surfaces the active module's doctypes in the
    sidebar; on mobile there's no sidebar, so show them right here, inline,
    as soon as a module tile is tapped. -->
    <div
      v-if="activeModule"
      class="mt-4 rounded-xl border bg-white dark:border-gray-800 dark:bg-gray-900 sm:hidden"
    >
      <div class="flex items-center justify-between border-b px-3 py-2 dark:border-gray-800">
        <span class="text-xs font-medium uppercase tracking-wide text-gray-400 dark:text-gray-500">
          {{ activeModule.label }}
        </span>
        <button
          class="flex h-6 w-6 items-center justify-center rounded text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"
          @click="clearActiveModule"
        >
          <FeatherIcon name="x" class="h-4 w-4" />
        </button>
      </div>
      <router-link
        v-for="item in activeModule.doctypes || []"
        :key="item.route"
        :to="{ name: 'DoctypeList', params: { doctypeRoute: item.route } }"
        class="flex items-center gap-3 border-b px-3 py-2.5 text-sm text-gray-700 last:border-0 hover:bg-gray-50 dark:border-gray-800 dark:text-gray-300 dark:hover:bg-gray-800"
      >
        <LucideIcon :name="item.icon || activeModule.icon" class="h-4 w-4 flex-shrink-0 text-gray-400" />
        {{ item.label || item.doctype_name }}
      </router-link>
    </div>
  </AppLayout>
</template>

<script setup>
import { computed } from 'vue'
import { FeatherIcon, ErrorMessage } from 'frappe-ui'
import AppLayout from '@/layouts/AppLayout.vue'
import PageHeader from '@/components/PageHeader.vue'
import Skeleton from '@/components/Skeleton.vue'
import LucideIcon from '@/components/LucideIcon.vue'
import { modulesResource } from '@/data/modules'
import { activeModule, setActiveModule, clearActiveModule } from '@/data/activeModule'
import { setPageTitle } from '@/data/pageTitle'
import { session } from '@/data/session'

setPageTitle('Home')

const greeting = computed(() => {
  const hour = new Date().getHours()
  const timeGreeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'
  const firstName = (session.full_name || '').split(' ')[0] || session.user
  return firstName ? `${timeGreeting}, ${firstName}` : timeGreeting
})

function toggleModule(mod) {
  if (activeModule.value?.label === mod.label) {
    clearActiveModule()
  } else {
    setActiveModule(mod)
  }
}
</script>

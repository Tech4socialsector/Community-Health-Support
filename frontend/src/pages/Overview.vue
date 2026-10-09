<template>
  <AppLayout>
    <div :class="ui.PAGE">
      <PageHeader description="Program-wide records across every CHW form. Click a program to see its records.">
        <template #title>
          <h1 class="text-lg font-semibold text-navy-900 dark:text-gray-100">Program Overview</h1>
        </template>
        <template #actions>
          <router-link :to="{ name: 'WorkOrders' }" :class="ui.BTN_SECONDARY">
            <LucideIcon name="clipboard-list" class="h-4 w-4 text-forest-700 dark:text-forest-300" />
            Work Orders
          </router-link>
        </template>
      </PageHeader>

      <div v-if="userContextResource.loading && !userContextResource.data" class="space-y-3">
        <Skeleton height="3.5rem" />
        <Skeleton height="12rem" />
      </div>
      <div v-else-if="!isPrivileged" :class="ui.EMPTY_STATE">
        Program Overview is only available to coordinators.
      </div>
      <ProgramOverview v-else />
    </div>
  </AppLayout>
</template>

<script setup>
import { computed } from 'vue'
import AppLayout from '@/layouts/AppLayout.vue'
import PageHeader from '@/components/PageHeader.vue'
import Skeleton from '@/components/Skeleton.vue'
import LucideIcon from '@/components/LucideIcon.vue'
import ProgramOverview from '@/components/ProgramOverview.vue'
import { userContextResource } from '@/data/userContext'
import { setPageTitle } from '@/data/pageTitle'
import * as ui from '@/data/ui'

setPageTitle('Program Overview')

const isPrivileged = computed(() => !!userContextResource.data?.is_privileged)
</script>

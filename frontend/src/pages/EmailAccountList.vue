<template>
  <AppLayout>
    <PageHeader description="Manage your email accounts and configure incoming and outgoing settings.">
      <template #title>
        <h1 class="text-lg font-semibold text-gray-900 dark:text-gray-100">Email Accounts</h1>
      </template>
      <template #actions>
        <Button variant="solid" @click="router.push({ name: 'EmailAccountNew' })">
          <template #prefix>
            <FeatherIcon name="plus" class="h-4 w-4" />
          </template>
          New
        </Button>
      </template>
    </PageHeader>

    <div v-if="rows.loading && !rows.data" class="space-y-2">
      <Skeleton v-for="i in 4" :key="i" height="3.5rem" />
    </div>
    <ErrorMessage v-else-if="rows.error" :message="rows.error" />
    <div
      v-else-if="!rows.data || rows.data.length === 0"
      class="py-10 text-center text-gray-500 dark:text-gray-400"
    >
      No email accounts yet.
    </div>

    <div v-else class="divide-y rounded-lg border dark:divide-gray-800 dark:border-gray-800">
      <div
        v-for="row in rows.data"
        :key="row.name"
        class="flex cursor-pointer items-center gap-3 px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-800"
        @click="router.push({ name: 'EmailAccountForm', params: { name: row.name } })"
      >
        <span class="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-gray-100 dark:bg-gray-800">
          <FeatherIcon name="mail" class="h-4 w-4 text-gray-500 dark:text-gray-400" />
        </span>
        <div class="min-w-0 flex-1">
          <div class="truncate text-sm font-medium text-gray-900 dark:text-gray-100">
            {{ row.email_account_name || row.email_id }}
          </div>
          <div class="truncate text-sm text-gray-500 dark:text-gray-400">
            {{ row.email_id }}
          </div>
        </div>
        <div class="flex flex-shrink-0 items-center gap-1.5">
          <span
            v-if="row.default_outgoing"
            class="rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-600 dark:bg-blue-950 dark:text-blue-400"
          >
            Default Sending
          </span>
          <span
            v-if="row.default_incoming"
            class="rounded-full bg-green-50 px-2 py-0.5 text-xs font-medium text-green-600 dark:bg-green-950 dark:text-green-400"
          >
            Default Incoming
          </span>
        </div>
      </div>
    </div>

    <div class="mt-4 flex justify-end gap-2">
      <Button :disabled="!rows.hasPreviousPage" @click="rows.previous()">
        Previous
      </Button>
      <Button :disabled="!rows.hasNextPage" @click="rows.next()">
        Next
      </Button>
    </div>
  </AppLayout>
</template>

<script setup>
import { useRouter } from 'vue-router'
import { useList, Button, ErrorMessage, FeatherIcon } from 'frappe-ui'
import AppLayout from '@/layouts/AppLayout.vue'
import PageHeader from '@/components/PageHeader.vue'
import Skeleton from '@/components/Skeleton.vue'
import { setPageTitle } from '@/data/pageTitle'

const router = useRouter()
setPageTitle('Email Accounts')

const rows = useList({
  doctype: 'Email Account',
  fields: ['name', 'email_account_name', 'email_id', 'default_incoming', 'default_outgoing'],
  orderBy: 'email_account_name asc',
  limit: 20,
})
</script>

<template>
  <Popover trigger="hover" :hover-delay="0.15" placement="right-end" class="w-full">
    <template #target>
      <slot />
    </template>
    <template #body-main>
      <div class="flex items-center gap-3 p-3">
        <Avatar :image="session.user_image" :label="session.full_name || session.user" size="lg" shape="square" />
        <div class="min-w-0">
          <div class="truncate text-sm font-medium text-gray-900 dark:text-gray-100">
            {{ session.full_name || session.user }}
          </div>
          <div class="truncate text-xs text-gray-500 dark:text-gray-400">
            {{ session.user }}
          </div>
        </div>
      </div>
    </template>
  </Popover>
</template>

<script setup>
import { Popover, Avatar } from 'frappe-ui'
import { session } from '@/data/session'
</script>

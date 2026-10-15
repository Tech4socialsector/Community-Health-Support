<template>
  <Popover trigger="hover" :hover-delay="0.2" placement="bottom-start">
    <template #target>
      <slot />
    </template>
    <template #body-main>
      <div class="flex items-center gap-3 p-3">
        <template v-if="userResource.loading && !userResource.data">
          <Skeleton width="2.5rem" height="2.5rem" round />
          <div class="flex-1 space-y-1.5">
            <Skeleton width="70%" height="0.75rem" />
            <Skeleton width="90%" height="0.625rem" />
          </div>
        </template>
        <template v-else>
          <Avatar :image="userResource.data?.user_image" :label="userResource.data?.full_name || user" size="lg" shape="square" />
          <div class="min-w-0">
            <div class="truncate text-sm font-medium text-gray-900 dark:text-gray-100">
              {{ userResource.data?.full_name || user }}
            </div>
            <div class="truncate text-xs text-gray-500 dark:text-gray-400">{{ user }}</div>
          </div>
        </template>
      </div>
    </template>
  </Popover>
</template>

<script setup>
import { useCall } from 'frappe-ui'
import Skeleton from '@/components/Skeleton.vue'

const props = defineProps({
  user: { type: String, required: true },
})

const userResource = useCall({
  url: '/api/v2/method/frappe.client.get_value',
  method: 'GET',
  params: () => ({
    doctype: 'User',
    filters: props.user,
    fieldname: ['full_name', 'user_image'],
  }),
})
</script>

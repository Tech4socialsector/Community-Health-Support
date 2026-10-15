<template>
  <div class="flex flex-col gap-4">
    <p class="text-sm text-gray-500 dark:text-gray-400">
      Configure the outgoing and incoming mail servers used by this app
      (e.g. sending visit reminders, notifications).
    </p>
    <div>
      <Button variant="outline" @click="openEmailAccounts">
        <template #prefix>
          <FeatherIcon name="mail" class="h-4 w-4" />
        </template>
        Manage Email Accounts
      </Button>
    </div>
  </div>
</template>

<script setup>
import { useRouter } from 'vue-router'
import { Button, FeatherIcon } from 'frappe-ui'

const emit = defineEmits(['close'])
const router = useRouter()

function openEmailAccounts() {
  emit('close')
  router.push({ name: 'EmailAccountList' })
}
</script>

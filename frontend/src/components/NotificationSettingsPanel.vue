<template>
  <div class="flex flex-col gap-5">
    <div v-if="loading" class="space-y-4">
      <Skeleton v-for="i in 4" :key="i" height="1.5rem" />
    </div>
    <template v-else>
      <Switch
        v-model="settings.thread_notify"
        label="Email Threads"
        description="Send notifications for email threads on documents you're involved in."
        @update:model-value="save('thread_notify', $event)"
      />
      <Switch
        v-model="settings.document_follow_notify"
        label="Followed Documents"
        description="Send notifications for documents you follow."
        @update:model-value="save('document_follow_notify', $event)"
      />
      <Switch
        v-model="settings.send_me_a_copy"
        label="Copy of Outgoing Emails"
        description="Send me a copy of emails I send out."
        @update:model-value="save('send_me_a_copy', $event)"
      />
      <Switch
        v-model="settings.mute_sounds"
        label="Mute Sounds"
        description="Mute notification sounds in the app."
        @update:model-value="save('mute_sounds', $event)"
      />
    </template>
  </div>
</template>

<script setup>
import { reactive, ref } from 'vue'
import { Switch, call, toast } from 'frappe-ui'
import Skeleton from '@/components/Skeleton.vue'
import { session } from '@/data/session'

const FIELDS = ['thread_notify', 'document_follow_notify', 'send_me_a_copy', 'mute_sounds']

const settings = reactive({
  thread_notify: false,
  document_follow_notify: false,
  send_me_a_copy: false,
  mute_sounds: false,
})
const loading = ref(true)

call('frappe.client.get_value', {
  doctype: 'User',
  filters: session.user,
  fieldname: FIELDS,
})
  .then((data) => {
    FIELDS.forEach((f) => {
      settings[f] = !!data?.[f]
    })
  })
  .finally(() => {
    loading.value = false
  })

async function save(fieldname, value) {
  try {
    await call('frappe.client.set_value', {
      doctype: 'User',
      name: session.user,
      fieldname,
      value: value ? 1 : 0,
    })
  } catch (e) {
    toast.error('Could not save')
    settings[fieldname] = !value
  }
}
</script>

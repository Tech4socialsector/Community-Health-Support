<template>
  <AppLayout>
    <PageHeader>
      <template #title>
        <Button variant="ghost" @click="router.push({ name: 'EmailAccountList' })">
          <template #prefix>
            <FeatherIcon name="arrow-left" class="h-4 w-4" />
          </template>
          Back
        </Button>
      </template>
    </PageHeader>

    <div v-if="!isNew && existingDoc.loading && !existingDoc.doc" class="max-w-xl space-y-4">
      <Skeleton v-for="i in 5" :key="i" height="2.25rem" />
    </div>

    <form v-else class="max-w-xl" @submit.prevent="save">
      <div class="mb-6 flex items-center gap-3">
        <span class="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-gray-100 dark:bg-gray-800">
          <FeatherIcon name="mail" class="h-5 w-5 text-gray-500 dark:text-gray-400" />
        </span>
        <div>
          <div class="text-base font-semibold text-gray-900 dark:text-gray-100">
            {{ isNew ? 'New Email' : 'Edit Email' }}
          </div>
          <div class="text-sm text-gray-500 dark:text-gray-400">
            {{ values.service || 'Configure your email account' }}
          </div>
        </div>
      </div>

      <div class="mb-6 flex items-start gap-2 rounded-lg border bg-gray-50 p-3 text-sm text-gray-600 dark:border-gray-800 dark:bg-gray-800 dark:text-gray-300">
        <FeatherIcon name="info" class="mt-0.5 h-4 w-4 flex-shrink-0 text-gray-400" />
        <span>
          To know more about setting up email accounts,
          <a
            href="https://frappeframework.com/docs/user/en/email"
            target="_blank"
            rel="noopener"
            class="underline"
          >click here</a>.
          <a
            v-if="!isNew"
            :href="`/app/email-account/${name}`"
            target="_blank"
            rel="noopener"
            class="ml-1 underline"
          >
            Open in Desk
          </a>
        </span>
      </div>

      <div class="flex flex-col gap-4">
        <FormControl type="text" label="Account name" v-model="values.email_account_name" required />
        <FormControl type="text" label="Email ID" v-model="values.email_id" required />
        <FormControl type="password" label="Password" v-model="values.password" autocomplete="new-password" />

        <div class="grid grid-cols-2 gap-4">
          <div>
            <FormControl type="checkbox" label="Enable Incoming" v-model="incomingEnabled" />
            <p class="mt-1 text-xs text-gray-500 dark:text-gray-400">
              If enabled, tickets can be created from the incoming emails on this account.
            </p>
          </div>
          <div>
            <FormControl type="checkbox" label="Enable Outgoing" v-model="outgoingEnabled" />
            <p class="mt-1 text-xs text-gray-500 dark:text-gray-400">
              If enabled, outgoing emails can be sent from this account.
            </p>
          </div>
        </div>

        <div class="grid grid-cols-2 gap-4">
          <div>
            <FormControl
              type="checkbox"
              label="Default Incoming"
              v-model="defaultIncoming"
              :disabled="!incomingEnabled"
            />
            <p class="mt-1 text-xs text-gray-500 dark:text-gray-400">
              If enabled, all replies will come to this account. Only one account can be default incoming.
            </p>
          </div>
          <div>
            <FormControl
              type="checkbox"
              label="Default Outgoing"
              v-model="defaultOutgoing"
              :disabled="!outgoingEnabled"
            />
            <p class="mt-1 text-xs text-gray-500 dark:text-gray-400">
              If enabled, all outgoing emails will be sent from this account. Only one account can be default outgoing.
            </p>
          </div>
        </div>
      </div>

      <ErrorMessage class="mt-4" :message="saveError" />

      <div class="mt-6 flex justify-between gap-2">
        <Button variant="outline" @click="router.push({ name: 'EmailAccountList' })">
          Back
        </Button>
        <Button variant="solid" :loading="saving" type="submit">
          {{ isNew ? 'Create Account' : 'Update Account' }}
        </Button>
      </div>
    </form>
  </AppLayout>
</template>

<script setup>
import { computed, reactive, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useDoc, useNewDoc, FormControl, Button, ErrorMessage, FeatherIcon, toast } from 'frappe-ui'
import AppLayout from '@/layouts/AppLayout.vue'
import PageHeader from '@/components/PageHeader.vue'
import Skeleton from '@/components/Skeleton.vue'
import { setPageTitle } from '@/data/pageTitle'

const { isNew, name } = defineProps({
  isNew: { type: Boolean, default: false },
  name: { type: String, default: null },
})

const router = useRouter()

setPageTitle(isNew ? 'New Email Account' : name)

const newDoc = isNew ? useNewDoc('Email Account') : null
const existingDoc = isNew ? null : useDoc({ doctype: 'Email Account', name })

const values = reactive({
  email_account_name: '',
  email_id: '',
  password: '',
  enable_incoming: 0,
  enable_outgoing: 0,
  default_incoming: 0,
  default_outgoing: 0,
})

watch(
  () => (isNew ? newDoc?.doc : existingDoc?.doc),
  (doc) => {
    if (!doc) return
    Object.keys(values).forEach((k) => {
      if (doc[k] !== undefined) values[k] = doc[k]
    })
  },
  { immediate: true, deep: true },
)

const incomingEnabled = computed({
  get: () => !!values.enable_incoming,
  set: (v) => {
    values.enable_incoming = v ? 1 : 0
    if (!v) values.default_incoming = 0
  },
})
const outgoingEnabled = computed({
  get: () => !!values.enable_outgoing,
  set: (v) => {
    values.enable_outgoing = v ? 1 : 0
    if (!v) values.default_outgoing = 0
  },
})
const defaultIncoming = computed({
  get: () => !!values.default_incoming,
  set: (v) => (values.default_incoming = v ? 1 : 0),
})
const defaultOutgoing = computed({
  get: () => !!values.default_outgoing,
  set: (v) => (values.default_outgoing = v ? 1 : 0),
})

const saving = ref(false)
const saveError = ref(null)

async function save() {
  saving.value = true
  saveError.value = null
  try {
    if (isNew) {
      Object.assign(newDoc.doc, values)
      const created = await newDoc.submit()
      toast.success('Created')
      router.replace({ name: 'EmailAccountForm', params: { name: created.name } })
    } else {
      const payload = { ...values }
      if (!payload.password) delete payload.password
      await existingDoc.setValue.submit(payload)
      toast.success('Saved')
    }
  } catch (e) {
    saveError.value = e
  } finally {
    saving.value = false
  }
}
</script>

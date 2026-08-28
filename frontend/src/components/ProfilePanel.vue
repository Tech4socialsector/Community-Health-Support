<template>
  <div class="flex flex-col gap-5">
    <div class="flex items-center gap-4">
      <Avatar :image="fullName ? userImage : null" :label="fullName || session.user" size="2xl" shape="square" />
      <div>
        <FileUploader
          file-types="image/*"
          :upload-args="{ doctype: 'User', docname: session.user, private: false }"
          @success="onImageUpload"
        >
          <template #default="{ uploading, progress, openFileSelector }">
            <Button variant="outline" :loading="uploading" @click="openFileSelector">
              {{ uploading ? `Uploading ${progress}%` : 'Change Photo' }}
            </Button>
          </template>
        </FileUploader>
      </div>
    </div>

    <FormControl type="text" label="Full Name" v-model="fullName" />
    <FormControl type="text" label="Email" :model-value="session.user" disabled />

    <div>
      <div class="mb-1.5 text-sm text-gray-700 dark:text-gray-300">Password</div>
      <Button variant="outline" @click="showPasswordDialog = true">
        Change Password
      </Button>
    </div>

    <ErrorMessage :message="saveError" />
    <div class="flex justify-end">
      <Button variant="solid" :loading="saving" @click="save">
        Save
      </Button>
    </div>

    <Dialog v-model="showPasswordDialog" :options="{ title: 'Change Password' }">
      <template #body-content>
        <div class="flex flex-col gap-4">
          <FormControl
            type="password"
            label="Current Password"
            v-model="oldPassword"
            autocomplete="current-password"
          />
          <FormControl
            type="password"
            label="New Password"
            v-model="newPassword"
            autocomplete="new-password"
          />
          <ErrorMessage :message="passwordError" />
        </div>
      </template>
      <template #actions>
        <Button variant="solid" class="w-full" :loading="changingPassword" @click="changePassword">
          Update Password
        </Button>
      </template>
    </Dialog>
  </div>
</template>

<script setup>
import { ref, watch } from 'vue'
import { Avatar, FormControl, Button, FileUploader, Dialog, ErrorMessage, call, toast } from 'frappe-ui'
import { session } from '@/data/session'

const fullName = ref(session.full_name || '')
const userImage = ref(session.user_image || '')

watch(
  () => session.full_name,
  (v) => (fullName.value = v || ''),
)
watch(
  () => session.user_image,
  (v) => (userImage.value = v || ''),
)

const saving = ref(false)
const saveError = ref(null)

async function onImageUpload(file) {
  try {
    await call('frappe.client.set_value', {
      doctype: 'User',
      name: session.user,
      fieldname: 'user_image',
      value: file.file_url,
    })
    userImage.value = file.file_url
    session.user_image = file.file_url
    toast.success('Photo updated')
  } catch (e) {
    toast.error('Could not update photo')
  }
}

async function save() {
  saving.value = true
  saveError.value = null
  try {
    await call('frappe.client.set_value', {
      doctype: 'User',
      name: session.user,
      fieldname: 'full_name',
      value: fullName.value,
    })
    session.full_name = fullName.value
    toast.success('Saved')
  } catch (e) {
    saveError.value = e
  } finally {
    saving.value = false
  }
}

const showPasswordDialog = ref(false)
const oldPassword = ref('')
const newPassword = ref('')
const passwordError = ref(null)
const changingPassword = ref(false)

async function changePassword() {
  changingPassword.value = true
  passwordError.value = null
  try {
    await call('frappe.core.doctype.user.user.update_password', {
      old_password: oldPassword.value,
      new_password: newPassword.value,
    })
    toast.success('Password updated')
    oldPassword.value = ''
    newPassword.value = ''
    showPasswordDialog.value = false
  } catch (e) {
    passwordError.value = e
  } finally {
    changingPassword.value = false
  }
}
</script>

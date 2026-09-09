<template>
  <div class="flex h-screen flex-col bg-white dark:bg-gray-900 lg:flex-row">
    <div class="relative flex flex-shrink-0 flex-col justify-between overflow-hidden bg-gradient-to-br from-gray-900 to-gray-700 p-6 text-white sm:p-8 lg:w-1/2 lg:justify-between lg:p-12">
      <div class="flex items-center gap-3">
        <span class="flex h-20 w-20 items-center justify-center rounded-2xl bg-white/10 backdrop-blur">
          <img v-if="brandingResource.data?.app_logo" :src="brandingResource.data.app_logo" class="h-14 w-14 rounded-xl object-cover" />
          <FeatherIcon v-else name="activity" class="h-11 w-11" />
        </span>
        <span class="text-xl font-semibold">{{ brandingResource.data?.app_name || 'CHW' }}</span>
      </div>

      <div class="mt-6 max-w-sm lg:mt-0">
        <h2 class="text-xl font-semibold leading-tight sm:text-2xl lg:text-3xl">
          {{ brandingResource.data?.login_headline || 'Care coordination for every household you serve.' }}
        </h2>
        <p class="mt-2 hidden text-sm text-white/70 sm:block lg:mt-4">
          {{ brandingResource.data?.login_description || 'Track visits, follow-ups, and growth monitoring in one place — built for community health workers on the ground.' }}
        </p>
      </div>

      <p class="mt-6 hidden text-xs text-white/40 lg:mt-0 lg:block">
        &copy; {{ new Date().getFullYear() }} {{ brandingResource.data?.app_name || 'CHW' }}
      </p>

      <div class="pointer-events-none absolute -right-20 -top-20 h-56 w-56 rounded-full bg-white/5 lg:-right-24 lg:-top-24 lg:h-72 lg:w-72" />
      <div class="pointer-events-none absolute -bottom-24 -left-12 h-64 w-64 rounded-full bg-white/5 lg:-bottom-32 lg:-left-16 lg:h-80 lg:w-80" />
    </div>

    <div class="flex flex-1 items-center justify-center overflow-y-auto bg-gray-50 px-6 py-8 dark:bg-gray-950 sm:px-8">
      <div class="w-full max-w-sm">
        <h1 class="text-xl font-semibold text-gray-900 dark:text-gray-100 sm:text-2xl">Welcome back</h1>
        <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">Log in to continue to your dashboard.</p>

        <form
          class="mt-6 flex flex-col gap-5 rounded-2xl border border-gray-200 bg-white p-6 shadow-lg shadow-gray-200/60 dark:border-gray-800 dark:bg-gray-900 dark:shadow-none sm:mt-8 sm:p-7"
          @submit.prevent="submit"
        >
          <FormControl
            type="text"
            label="Email"
            v-model="email"
            autocomplete="username"
            required
          />
          <div>
            <FormControl
              :type="showPassword ? 'text' : 'password'"
              label="Password"
              v-model="password"
              autocomplete="current-password"
              required
            >
              <template #suffix>
                <button
                  type="button"
                  tabindex="-1"
                  class="flex h-full items-center text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                  @click="showPassword = !showPassword"
                >
                  <FeatherIcon :name="showPassword ? 'eye-off' : 'eye'" class="h-4 w-4" />
                </button>
              </template>
            </FormControl>
            <button
              type="button"
              class="mt-1.5 text-xs text-gray-500 hover:text-gray-700 hover:underline dark:text-gray-400 dark:hover:text-gray-200"
              @click="openForgotPassword"
            >
              Forgot password?
            </button>
          </div>
          <ErrorMessage :message="loginResource.error" />
          <Button variant="solid" :loading="loginResource.loading" type="submit" size="lg">
            Log in
          </Button>
        </form>
      </div>
    </div>

    <Dialog v-model="showForgotPassword" :options="{ title: 'Reset Password' }">
      <template #body-content>
        <p class="mb-4 text-sm text-gray-500 dark:text-gray-400">
          Enter your email and we'll send you a link to reset your password.
        </p>
        <FormControl
          type="text"
          label="Email"
          v-model="resetEmail"
          autocomplete="username"
          required
        />
        <ErrorMessage class="mt-3" :message="resetError" />
        <p v-if="resetSent" class="mt-3 text-sm text-green-600 dark:text-green-400">
          If that email is registered with us, a reset link is on its way. Please check your inbox.
        </p>
      </template>
      <template #actions>
        <Button variant="solid" :loading="resetLoading" class="w-full" @click="submitForgotPassword">
          Send reset link
        </Button>
      </template>
    </Dialog>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { FormControl, Button, ErrorMessage, Dialog, FeatherIcon, call } from 'frappe-ui'
import { loginResource } from '@/data/session'
import { brandingResource } from '@/data/branding'

const email = ref('')
const password = ref('')
const showPassword = ref(false)

// Trimmed only at submit time, not on every keystroke via v-model - a
// pasted credential often carries a stray leading/trailing space (copied
// from an email, a chat message, a password manager's clipboard entry),
// which Frappe's login compares byte-for-byte and silently rejects as
// wrong. Trimming while typing would be actively wrong instead: it'd fight
// a user who legitimately types a trailing space mid-edit. Only the outer
// whitespace is stripped either way - a real space in the middle of an
// email local-part or password stays intact.
function submit() {
  loginResource.submit({ email: email.value.trim(), password: password.value.trim() })
}

const showForgotPassword = ref(false)
const resetEmail = ref('')
const resetError = ref(null)
const resetSent = ref(false)
const resetLoading = ref(false)

function openForgotPassword() {
  resetEmail.value = email.value
  resetError.value = null
  resetSent.value = false
  showForgotPassword.value = true
}

async function submitForgotPassword() {
  const user = resetEmail.value.trim()
  if (!user) return
  resetLoading.value = true
  resetError.value = null
  resetSent.value = false
  try {
    await call('frappe.core.doctype.user.user.reset_password', { user })
    resetSent.value = true
  } catch (e) {
    resetError.value = e
  } finally {
    resetLoading.value = false
  }
}
</script>

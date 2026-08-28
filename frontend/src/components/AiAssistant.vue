<template>
  <button
    v-if="assistantConfigResource.data?.enabled"
    class="fixed bottom-20 right-4 z-20 flex h-12 w-12 items-center justify-center rounded-full bg-gray-900 text-white shadow-lg hover:bg-gray-800 dark:bg-gray-100 dark:text-gray-900 dark:hover:bg-white sm:bottom-6"
    @click="toggleAssistant"
  >
    <SparklesIcon class="h-5 w-5" />
  </button>

  <Dialog v-model="show" :options="{ size: '5xl' }">
    <template #body>
      <div class="flex h-[46rem] max-h-[88vh] flex-col">
        <div class="flex items-center justify-between border-b px-5 py-3 dark:border-gray-800">
          <div class="flex items-center gap-2">
            <span class="flex h-8 w-8 items-center justify-center rounded-full bg-gray-100 dark:bg-gray-800">
              <SparklesIcon class="h-4 w-4 text-gray-600 dark:text-gray-300" />
            </span>
            <h2 class="text-base font-semibold text-gray-900 dark:text-gray-100">{{ botName }}</h2>
          </div>
          <div class="flex items-center gap-1">
            <Tooltip v-if="conversation.length" text="Clear conversation">
              <button
                class="flex h-7 w-7 items-center justify-center rounded text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800"
                @click="clearConversation"
              >
                <FeatherIcon name="trash-2" class="h-4 w-4" />
              </button>
            </Tooltip>
            <Tooltip text="Close">
              <button
                class="flex h-7 w-7 items-center justify-center rounded text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800"
                @click="show = false"
              >
                <FeatherIcon name="x" class="h-4 w-4" />
              </button>
            </Tooltip>
          </div>
        </div>

        <div ref="messagesRef" class="flex-1 space-y-3 overflow-y-auto p-5">
          <div
            v-if="conversation.length === 0"
            class="flex flex-col items-center gap-2 py-16 text-center text-gray-500 dark:text-gray-400"
          >
            <SparklesIcon class="h-7 w-7" />
            <span class="text-sm">
              Hi, I'm {{ botName }}. Ask me to look something up, create a record, or take you somewhere in the app.
            </span>
          </div>

          <div
            v-for="(m, idx) in conversation"
            :key="idx"
            class="flex"
            :class="m.role === 'user' ? 'justify-end' : 'justify-start'"
          >
            <div
              class="max-w-[75%] whitespace-pre-wrap rounded-2xl px-3.5 py-2 text-sm"
              :class="m.role === 'user'
                ? 'bg-gray-900 text-white dark:bg-gray-100 dark:text-gray-900'
                : 'bg-gray-100 text-gray-900 dark:bg-gray-800 dark:text-gray-100'"
            >{{ m.content }}</div>
          </div>

          <div v-if="sending.loading" class="flex justify-start">
            <div class="flex items-center gap-1 rounded-2xl bg-gray-100 px-3 py-2.5 dark:bg-gray-800">
              <span class="h-1.5 w-1.5 animate-bounce rounded-full bg-gray-400 [animation-delay:-0.3s]" />
              <span class="h-1.5 w-1.5 animate-bounce rounded-full bg-gray-400 [animation-delay:-0.15s]" />
              <span class="h-1.5 w-1.5 animate-bounce rounded-full bg-gray-400" />
            </div>
          </div>
        </div>

        <ErrorMessage class="mx-5 mb-2" :message="sendError" />

        <div class="border-t p-4 dark:border-gray-800">
          <div class="flex items-end gap-2">
            <textarea
              v-model="draft"
              rows="1"
              placeholder="Type a message..."
              class="flex-1 resize-none rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-gray-300 focus:outline-none focus:ring-1 focus:ring-gray-300 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 dark:placeholder:text-gray-500"
              @keydown.enter.exact.prevent="submit"
            />
            <Tooltip v-if="voiceSupported" :text="listening ? 'Stop listening' : 'Speak'">
              <button
                type="button"
                class="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg"
                :class="listening
                  ? 'bg-red-100 text-red-600 dark:bg-red-950 dark:text-red-400'
                  : 'text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800'"
                @click="toggleVoice"
              >
                <FeatherIcon :name="listening ? 'mic-off' : 'mic'" class="h-4 w-4" />
              </button>
            </Tooltip>
            <Button variant="solid" :loading="sending.loading" :disabled="!draft.trim()" @click="submit">
              <template #icon>
                <FeatherIcon name="send" class="h-4 w-4" />
              </template>
            </Button>
          </div>
        </div>
      </div>
    </template>
  </Dialog>
</template>

<script setup>
import { computed, nextTick, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { Button, Dialog, ErrorMessage, FeatherIcon, Tooltip } from 'frappe-ui'
import SparklesIcon from '@/components/SparklesIcon.vue'
import {
  assistantState,
  assistantConfigResource,
  conversation,
  sendAssistantMessage,
  sending,
  toggleAssistant,
} from '@/data/aiAssistant'
import { findModuleByDoctype } from '@/data/modules'

const router = useRouter()
const messagesRef = ref(null)
const draft = ref('')
const sendError = ref(null)

const botName = computed(() => assistantConfigResource.data?.bot_name || 'Assistant')

const show = computed({
  get: () => assistantState.visible,
  set: (v) => (assistantState.visible = v),
})

watch(
  () => assistantState.visible,
  (visible) => {
    if (visible) assistantConfigResource.reload()
  },
)

watch(
  () => conversation.value.length,
  () => nextTick(() => {
    if (messagesRef.value) messagesRef.value.scrollTop = messagesRef.value.scrollHeight
  }),
)

function clearConversation() {
  conversation.value = []
  sendError.value = null
}

async function submit() {
  const message = draft.value.trim()
  if (!message || sending.loading) return
  draft.value = ''
  sendError.value = null
  try {
    const result = await sendAssistantMessage(message)
    if (result.action?.type === 'navigate' && result.action.doctype) {
      const mod = findModuleByDoctype(result.action.doctype)
      if (mod) {
        router.push({
          name: result.action.name ? 'DoctypeForm' : 'DoctypeList',
          params: { doctypeRoute: mod.route, name: result.action.name },
        })
        assistantState.visible = false
      }
    }
  } catch (e) {
    sendError.value = e
    draft.value = message
  }
}

// --- Voice input (Web Speech API) -------------------------------------
// Fully client-side, no audio ever leaves the browser, no extra cost.
// Not supported on iOS Safari - voiceSupported gates the mic button so it
// simply doesn't appear there rather than failing silently on click.
const SpeechRecognitionImpl = window.SpeechRecognition || window.webkitSpeechRecognition
const voiceSupported = !!SpeechRecognitionImpl
const listening = ref(false)
let recognizer = null

function toggleVoice() {
  if (listening.value) {
    recognizer?.stop()
    return
  }
  recognizer = new SpeechRecognitionImpl()
  recognizer.continuous = false
  recognizer.interimResults = true
  recognizer.onresult = (event) => {
    let transcript = ''
    for (let i = 0; i < event.results.length; i++) {
      transcript += event.results[i][0].transcript
    }
    draft.value = transcript
  }
  recognizer.onerror = () => {
    listening.value = false
  }
  recognizer.onend = () => {
    listening.value = false
  }
  listening.value = true
  recognizer.start()
}
</script>

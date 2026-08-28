import { reactive, ref } from 'vue'
import { useCall } from 'frappe-ui'

export const assistantState = reactive({
  visible: false,
})

export function toggleAssistant() {
  assistantState.visible = !assistantState.visible
}

// Cheap, safe-for-every-user check: is the assistant on, and what's it
// called. Never includes the base URL, model, or key - see
// chw.ai.assistant.get_assistant_config.
export const assistantConfigResource = useCall({
  url: '/api/v2/method/chw.ai.assistant.get_assistant_config',
  method: 'GET',
  cacheKey: 'chw-ai-assistant-config',
})

// Conversation lives here (not local to the panel component) so closing and
// reopening the panel within a session doesn't lose context - mirrors
// notificationsState living outside NotificationPanel.vue.
export const conversation = ref([])

const sendMessageCall = useCall({
  url: '/api/v2/method/chw.ai.assistant.send_message',
  method: 'POST',
  immediate: false,
})

export async function sendAssistantMessage(message) {
  const result = await sendMessageCall.submit({
    messages: conversation.value,
    message,
  })
  conversation.value = result.messages
  return result
}

export const sending = sendMessageCall

import { computed, reactive } from 'vue'
import { useCall } from 'frappe-ui'

export const notificationsState = reactive({
  visible: false,
})

export function toggleNotifications() {
  notificationsState.visible = !notificationsState.visible
}

export const notificationsResource = useCall({
  url: '/api/v2/method/frappe.desk.doctype.notification_log.notification_log.get_notification_logs',
  method: 'GET',
  params: { limit: 20 },
  immediate: false,
  cacheKey: 'chw-notifications',
})

export const notificationLogs = computed(() => notificationsResource.data?.notification_logs || [])
export const unreadCount = computed(() => notificationLogs.value.filter((n) => !n.read).length)

const markAllReadCall = useCall({
  url: '/api/v2/method/frappe.desk.doctype.notification_log.notification_log.mark_all_as_read',
  method: 'POST',
  immediate: false,
})

export function markAllRead() {
  markAllReadCall.submit().then(() => notificationsResource.reload())
}

const markReadCall = useCall({
  url: '/api/v2/method/frappe.desk.doctype.notification_log.notification_log.mark_as_read',
  method: 'POST',
  immediate: false,
})

export function markRead(docname) {
  return markReadCall.submit({ docname }).then(() => notificationsResource.reload())
}

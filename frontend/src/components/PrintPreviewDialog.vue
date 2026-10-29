<template>
  <Dialog v-model="open" :options="{ title: title || t('Print Preview'), size: '3xl' }">
    <template #body-content>
      <div v-if="loading" class="flex items-center justify-center py-16 text-sm text-gray-500 dark:text-gray-400">
        <LucideIcon name="loader-circle" class="mr-2 h-4 w-4 animate-spin" />
        {{ t('Loading…') }}
      </div>
      <ErrorMessage v-else-if="error" :message="error" />
      <!-- The server already escapes/renders every field through Jinja - this
      is the same HTML Desk's own print dialog shows, not arbitrary input. -->
      <div v-else class="max-h-[70vh] overflow-y-auto rounded-lg bg-white" v-html="html" />
    </template>
    <template #actions="{ close }">
      <div class="flex justify-end gap-2">
        <button type="button" :class="ui.BTN_SECONDARY" @click="close">{{ t('Close') }}</button>
        <button type="button" :class="ui.BTN_PRIMARY" :disabled="loading || !!error" @click="printNow">
          <LucideIcon name="printer" class="h-4 w-4" />
          {{ t('Print') }}
        </button>
      </div>
    </template>
  </Dialog>
</template>

<script setup>
// Shared by every CHW doctype's "Print" button (see data/printFormats.js for
// which doctype maps to which Print Format) - the Vue counterpart of Desk's
// own print_preview.bundle.js (chw.print_preview.show), same backend method,
// same dialog-with-print-button UX, same print-only popup window mechanics.
import { ref, watch, computed } from 'vue'
import { Dialog, ErrorMessage, call } from 'frappe-ui'
import LucideIcon from '@/components/LucideIcon.vue'
import * as ui from '@/data/ui'
import { t } from '@/data/i18n'

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  doctype: { type: String, required: true },
  docname: { type: String, required: true },
  printFormat: { type: String, required: true },
  title: { type: String, default: null },
})
const emit = defineEmits(['update:modelValue'])

const open = computed({
  get: () => props.modelValue,
  set: (value) => emit('update:modelValue', value),
})

const html = ref('')
const loading = ref(false)
const error = ref(null)

watch(
  () => props.modelValue,
  async (isOpen) => {
    if (!isOpen) return
    loading.value = true
    error.value = null
    html.value = ''
    try {
      html.value = await call('chw.print_utils.get_print_format_html', {
        doctype: props.doctype,
        docname: props.docname,
        print_format: props.printFormat,
      })
    } catch (e) {
      error.value = e?.messages?.join(', ') || e?.message || t('Could not load the print preview.')
    } finally {
      loading.value = false
    }
  },
)

function printNow() {
  // A blank print-only window keeps the browser's print dialog scoped to
  // just the document, not the whole app page behind it - same mechanism
  // Desk's own print_preview.bundle.js uses.
  const printWindow = window.open('', '_blank')
  if (!printWindow) return
  printWindow.document.write(`<html><head><title>${props.docname}</title></head><body>${html.value}</body></html>`)
  printWindow.document.close()
  printWindow.focus()
  printWindow.print()
}
</script>

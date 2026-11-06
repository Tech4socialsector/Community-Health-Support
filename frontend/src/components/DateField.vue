<template>
  <!-- A date box that opens CalendarPanel (the "Auto" locale calendar). The
  box shows the site's own date format (System Settings, picked up
  automatically); the value stays Frappe's YYYY-MM-DD (Datetime:
  YYYY-MM-DD HH:mm:ss), so nothing else changes.
  A date can also be typed (dd-mm-yyyy, as shown) - kept when the box is
  left or Enter is pressed; something that isn't a real date is put back.
  Date and time boxes stay pick-only. -->
  <div class="space-y-1.5">
    <FormLabel v-if="label" :label="label" :required="required" size="sm" />
    <Popover placement="bottom-start" class="w-full">
      <template #target="{ togglePopover, open, close, isOpen }">
        <TextInput
          :model-value="typing ? text : display"
          :readonly="withTime"
          variant="subtle"
          class="w-full"
          :class="withTime ? 'cursor-pointer' : ''"
          :placeholder="withTime ? t('Select date and time') : t('Type or select date ({0})', [siteDateFormat])"
          :disabled="disabled"
          @update:model-value="onType"
          @focus="onFocus(open)"
          @click="!disabled && (withTime ? togglePopover() : !isOpen && open())"
          @keydown.enter.prevent="withTime ? !disabled && togglePopover() : commit(close)"
          @keydown.escape="cancel(close)"
          @blur="commit()"
        >
          <template #prefix>
            <LucideIcon
              :name="withTime ? 'calendar-clock' : 'calendar-days'"
              class="h-4 w-4 flex-shrink-0 text-forest-700 dark:text-forest-300"
              aria-hidden="true"
            />
          </template>
        </TextInput>
      </template>
      <template #body="{ togglePopover }">
        <CalendarPanel
          class="mt-1"
          :model-value="modelValue"
          :with-time="withTime"
          @update:model-value="pick"
          @done="togglePopover()"
        />
      </template>
    </Popover>
    <p v-if="description" class="text-p-xs text-ink-gray-5">{{ description }}</p>
  </div>
</template>

<script setup>
import { computed, ref } from 'vue'
import { FormLabel, Popover, TextInput, toast } from 'frappe-ui'
import CalendarPanel from '@/components/CalendarPanel.vue'
import LucideIcon from '@/components/LucideIcon.vue'
import { t } from '@/data/i18n'
import { formatDate, parseTypedDate, siteDateFormat } from '@/doctype-hooks/utils'

const props = defineProps({
  modelValue: { type: String, default: null },
  label: { type: String, default: '' },
  required: { type: Boolean, default: false },
  description: { type: String, default: '' },
  disabled: { type: Boolean, default: false },
  withTime: { type: Boolean, default: false },
})
const emit = defineEmits(['update:modelValue'])

const display = computed(() => {
  if (!props.modelValue) return ''
  const time = props.withTime ? props.modelValue.slice(11, 16) : ''
  return time ? `${formatDate(props.modelValue)} ${time}` : formatDate(props.modelValue)
})

// What's being typed - shown instead of the saved value until it's kept.
const text = ref('')
const typing = ref(false)

function onFocus(open) {
  if (props.withTime || props.disabled) return
  text.value = display.value
  typing.value = true
  open()
}
function onType(value) {
  if (props.withTime) return
  text.value = value
  typing.value = true
}

function commit(close) {
  if (props.withTime || !typing.value) return
  const raw = text.value.trim()
  typing.value = false
  close?.()
  if (raw === display.value) return
  if (!raw) {
    emit('update:modelValue', null)
    return
  }
  const value = parseTypedDate(raw)
  if (value) emit('update:modelValue', value)
  else toast.warning(t('"{0}" isn\'t a date. Type it as {1}, e.g. {2}.', [raw, siteDateFormat.value, formatDate('2026-01-31')]))
}
function cancel(close) {
  typing.value = false
  close?.()
}

// Picked on the calendar: wins over anything half-typed.
function pick(value) {
  typing.value = false
  emit('update:modelValue', value || null)
}
</script>

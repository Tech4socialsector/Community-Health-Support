<template>
  <!-- A date box that opens CalendarPanel (the "Auto" locale calendar). The
  box shows the site's own date format (System Settings, picked up
  automatically); the value stays Frappe's YYYY-MM-DD (Datetime:
  YYYY-MM-DD HH:mm:ss), so nothing else changes. -->
  <div class="space-y-1.5">
    <FormLabel v-if="label" :label="label" :required="required" size="sm" />
    <Popover placement="bottom-start" class="w-full">
      <template #target="{ togglePopover }">
        <TextInput
          :model-value="display"
          readonly
          variant="subtle"
          class="w-full cursor-pointer"
          :placeholder="withTime ? t('Select date and time') : t('Select date')"
          :disabled="disabled"
          @click="!disabled && togglePopover()"
          @keydown.enter.prevent="!disabled && togglePopover()"
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
          @update:model-value="$emit('update:modelValue', $event || null)"
          @done="togglePopover()"
        />
      </template>
    </Popover>
    <p v-if="description" class="text-p-xs text-ink-gray-5">{{ description }}</p>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { FormLabel, Popover, TextInput } from 'frappe-ui'
import CalendarPanel from '@/components/CalendarPanel.vue'
import LucideIcon from '@/components/LucideIcon.vue'
import { t } from '@/data/i18n'
import { formatDate } from '@/doctype-hooks/utils'

const props = defineProps({
  modelValue: { type: String, default: null },
  label: { type: String, default: '' },
  required: { type: Boolean, default: false },
  description: { type: String, default: '' },
  disabled: { type: Boolean, default: false },
  withTime: { type: Boolean, default: false },
})
defineEmits(['update:modelValue'])

const display = computed(() => {
  if (!props.modelValue) return ''
  const time = props.withTime ? props.modelValue.slice(11, 16) : ''
  return time ? `${formatDate(props.modelValue)} ${time}` : formatDate(props.modelValue)
})
</script>

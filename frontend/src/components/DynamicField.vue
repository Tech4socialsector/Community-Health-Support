<template>
  <GeoLocationField
    v-if="controlType === 'geolocation'"
    :field="field"
    :model-value="modelValue"
    @update:model-value="$emit('update:modelValue', $event)"
  />

  <TableMultiSelectField
    v-else-if="controlType === 'table-multiselect'"
    :field="field"
    :model-value="modelValue"
    @update:model-value="$emit('update:modelValue', $event)"
  />

  <div v-else-if="controlType === 'attach'">
    <label class="mb-1.5 block text-sm text-gray-700 dark:text-gray-300">{{ field.label }}</label>
    <div v-if="modelValue" class="flex items-center gap-3 rounded-lg border p-2 dark:border-gray-800">
      <img
        v-if="isImageField"
        :src="modelValue"
        class="h-12 w-12 flex-shrink-0 rounded object-cover"
      />
      <FeatherIcon v-else name="paperclip" class="h-5 w-5 flex-shrink-0 text-gray-400" />
      <a
        :href="modelValue"
        target="_blank"
        rel="noopener"
        class="min-w-0 flex-1 truncate text-sm text-gray-700 hover:underline dark:text-gray-300"
      >
        {{ fileName }}
      </a>
      <Tooltip text="Remove file">
        <button
          type="button"
          class="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded text-gray-400 hover:bg-gray-100 hover:text-red-500 dark:hover:bg-gray-800"
          @click="$emit('update:modelValue', null)"
        >
          <FeatherIcon name="x" class="h-4 w-4" />
        </button>
      </Tooltip>
    </div>
    <FileUploader
      v-else
      :file-types="isImageField ? 'image/*' : undefined"
      :upload-args="{ doctype, docname, private: false }"
      @success="(file) => $emit('update:modelValue', file.file_url)"
    >
      <template #default="{ uploading, progress, openFileSelector }">
        <Button variant="outline" :loading="uploading" @click="openFileSelector">
          {{ uploading ? `Uploading ${progress}%` : `Attach ${isImageField ? 'Image' : 'File'}` }}
        </Button>
      </template>
    </FileUploader>
  </div>

  <FormControl
    v-else-if="controlType === 'select'"
    type="select"
    class="[&_[data-slot=trigger]]:w-full"
    :label="field.label"
    :required="!!field.reqd"
    :options="selectOptions"
    :model-value="modelValue"
    @update:model-value="$emit('update:modelValue', $event)"
  />
  <FormControl
    v-else-if="controlType === 'checkbox'"
    type="checkbox"
    :label="field.label"
    :model-value="!!modelValue"
    @update:model-value="$emit('update:modelValue', $event ? 1 : 0)"
  />
  <FormControl
    v-else-if="controlType === 'textarea'"
    type="textarea"
    :label="field.label"
    :required="!!field.reqd"
    :model-value="modelValue"
    @update:model-value="$emit('update:modelValue', $event)"
  />
  <div v-else-if="isUserLink">
    <FormControl
      type="text"
      :label="field.label"
      :required="!!field.reqd"
      :description="linkDescription"
      :model-value="modelValue"
      @update:model-value="$emit('update:modelValue', $event)"
    >
      <template v-if="modelValue" #suffix>
        <UserLinkHoverCard :user="modelValue">
          <FeatherIcon name="user" class="h-4 w-4 text-gray-400" />
        </UserLinkHoverCard>
      </template>
    </FormControl>
  </div>
  <FormControl
    v-else
    :type="controlType"
    :label="field.label"
    :required="!!field.reqd"
    :description="linkDescription"
    :model-value="modelValue"
    @update:model-value="$emit('update:modelValue', $event)"
  />
</template>

<script setup>
import { computed } from 'vue'
import { FormControl, FileUploader, Button, FeatherIcon, Tooltip } from 'frappe-ui'
import UserLinkHoverCard from '@/components/UserLinkHoverCard.vue'
import GeoLocationField from '@/components/GeoLocationField.vue'
import TableMultiSelectField from '@/components/TableMultiSelectField.vue'

const props = defineProps({
  field: { type: Object, required: true },
  modelValue: { default: null },
  doctype: { type: String, default: null },
  docname: { type: String, default: null },
})
defineEmits(['update:modelValue'])

const controlType = computed(() => {
  switch (props.field.fieldtype) {
    case 'Select':
      return 'select'
    case 'Check':
      return 'checkbox'
    case 'Text':
    case 'Small Text':
    case 'Long Text':
    case 'Text Editor':
    case 'Code':
      return 'textarea'
    case 'Int':
    case 'Float':
    case 'Currency':
    case 'Percent':
      return 'number'
    case 'Date':
      return 'date'
    case 'Datetime':
      return 'datetime-local'
    case 'Password':
      return 'password'
    case 'Attach':
    case 'Attach Image':
      return 'attach'
    case 'Geolocation':
      return 'geolocation'
    case 'Table MultiSelect':
      return 'table-multiselect'
    default:
      return 'text'
  }
})

const isImageField = computed(() => props.field.fieldtype === 'Attach Image')
const isUserLink = computed(() => props.field.fieldtype === 'Link' && props.field.options === 'User')

const fileName = computed(() => {
  if (!props.modelValue) return ''
  try {
    return decodeURIComponent(props.modelValue.split('/').pop())
  } catch {
    return props.modelValue.split('/').pop()
  }
})

const selectOptions = computed(() => {
  const raw = props.field.options || ''
  return raw
    .split('\n')
    .map((v) => v.trim())
    .filter(Boolean)
    .map((v) => ({ label: v, value: v }))
})

// Link fields don't have a dedicated autocomplete widget in this build - a
// plain text input, with the linked doctype named in the description, is
// the fallback so the generic form still works for every fieldtype without
// hardcoding per-doctype pickers.
const linkDescription = computed(() => {
  if (props.field.fieldtype === 'Link' && props.field.options) {
    return `Links to ${props.field.options}`
  }
  return props.field.description || undefined
})
</script>

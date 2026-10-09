<template>
  <!-- Desk's quick entry, opened from a Link field's "+ Create a new ...":
  the new record's name (when it's typed by the user, as for most masters -
  Village, Sub Centre, Occupation ...), its required fields and any marked
  "In Quick Entry". Saved with frappe.client.insert, then picked into the
  Link that asked for it. -->
  <Dialog v-model="open" :options="{ title: `New ${doctype}`, size: 'lg' }">
    <template #body-content>
      <div v-if="metaResource.loading && !metaResource.data" class="py-6 text-center text-sm text-gray-400">Loading…</div>
      <div v-else class="space-y-4">
        <FormControl
          v-if="askName"
          type="text"
          :label="`${doctype} Name`"
          :required="true"
          v-model="newName"
          autofocus
        />
        <DynamicField
          v-for="field in quickFields"
          :key="field.fieldname"
          :field="field"
          :doctype="doctype"
          :doc="values"
          v-model="values[field.fieldname]"
        />
        <p v-if="!askName && !quickFields.length" class="text-sm text-gray-500 dark:text-gray-400">
          A new {{ doctype }} will be created with its next number.
        </p>
        <ErrorMessage v-if="error" :message="error" />
      </div>
    </template>
    <template #actions>
      <div class="flex justify-end gap-2">
        <button type="button" :class="ui.BTN_SECONDARY" :disabled="saving" @click="open = false">Cancel</button>
        <button type="button" :class="ui.BTN_PRIMARY" :disabled="saving || (askName && !newName.trim())" @click="create">
          <LucideIcon :name="saving ? 'loader-circle' : 'check'" class="h-4 w-4" :class="{ 'animate-spin': saving }" />
          Save
        </button>
      </div>
    </template>
  </Dialog>
</template>

<script setup>
import { computed, reactive, ref, watch } from 'vue'
import { Dialog, ErrorMessage, FormControl, call, toast } from 'frappe-ui'
import DynamicField from '@/components/DynamicField.vue'
import LucideIcon from '@/components/LucideIcon.vue'
import { useMeta } from '@/data/useMeta'
import { applyDefaults } from '@/data/defaults'
import * as ui from '@/data/ui'

const props = defineProps({
  doctype: { type: String, required: true },
  // What was typed in the Link box - becomes the new record's name.
  initialName: { type: String, default: '' },
})
const emit = defineEmits(['created'])
const open = defineModel({ type: Boolean, default: false })

const metaResource = useMeta(props.doctype)
const values = reactive({})
const newName = ref(props.initialName || '')
const saving = ref(false)
const error = ref(null)

// Named by the user ("Set by user" / autoname prompt), as most masters are.
const askName = computed(() => {
  const meta = metaResource.data
  if (!meta) return false
  return (meta.autoname || '').toLowerCase() === 'prompt' || meta.naming_rule === 'Set by user'
})

const SKIP = new Set(['Section Break', 'Column Break', 'Tab Break', 'HTML', 'Heading', 'Button', 'Table', 'Table MultiSelect'])
const quickFields = computed(() =>
  (metaResource.data?.fields || []).filter(
    (f) => !SKIP.has(f.fieldtype) && !f.hidden && !f.read_only && (f.reqd || f.allow_in_quick_entry),
  ),
)

watch(
  () => metaResource.data,
  (meta) => {
    if (meta) applyDefaults(meta.fields, values)
  },
  { immediate: true },
)
watch(open, (isOpen) => {
  if (isOpen) {
    newName.value = props.initialName || ''
    error.value = null
  }
})

function errorText(e) {
  const messages = e?.messages?.length ? e.messages : [e?.message || String(e || '')]
  return messages.map((m) => String(m).replace(/<[^>]*>/g, '')).join(' ').trim() || 'Could not create the record.'
}

async function create() {
  saving.value = true
  error.value = null
  try {
    const doc = { doctype: props.doctype, ...values }
    if (askName.value) doc.__newname = newName.value.trim()
    const created = await call('frappe.client.insert', { doc })
    toast.success(`Created ${props.doctype}: ${created.name}`)
    emit('created', created.name)
    open.value = false
  } catch (e) {
    error.value = errorText(e)
  } finally {
    saving.value = false
  }
}
</script>

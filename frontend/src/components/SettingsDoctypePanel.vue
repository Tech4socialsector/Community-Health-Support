<template>
  <div>
    <div v-if="metaResource.loading && !metaResource.data" class="grid grid-cols-1 gap-4">
      <div v-for="i in 4" :key="i" class="space-y-1.5">
        <Skeleton width="30%" height="0.75rem" />
        <Skeleton height="2.25rem" />
      </div>
    </div>
    <div v-else-if="doc.loading && !doc.doc" class="grid grid-cols-1 gap-4">
      <div v-for="i in 4" :key="i" class="space-y-1.5">
        <Skeleton width="30%" height="0.75rem" />
        <Skeleton height="2.25rem" />
      </div>
    </div>

    <form v-else @submit.prevent="save">
      <div class="grid grid-cols-1 gap-4">
        <DynamicField
          v-for="field in fields"
          :key="field.fieldname"
          :field="field"
          :doctype="doctype"
          :docname="doctype"
          v-model="values[field.fieldname]"
        />
      </div>
      <ErrorMessage class="mt-4" :message="saveError" />
      <div class="mt-6 flex justify-end">
        <Button variant="solid" :loading="saving" @click="save">
          Save
        </Button>
      </div>
    </form>
  </div>
</template>

<script setup>
import { reactive, ref, watch } from 'vue'
import { useDoc, Button, ErrorMessage, toast } from 'frappe-ui'
import DynamicField from '@/components/DynamicField.vue'
import Skeleton from '@/components/Skeleton.vue'
import { useMeta, useFormFields } from '@/data/useMeta'

const props = defineProps({
  doctype: { type: String, required: true },
})

const metaResource = useMeta(props.doctype)
const fields = useFormFields(metaResource)
const doc = useDoc({ doctype: props.doctype, name: props.doctype })

const values = reactive({})

watch(
  () => doc.doc,
  (d) => {
    if (!d) return
    Object.keys(d).forEach((k) => {
      values[k] = d[k]
    })
  },
  { immediate: true, deep: true },
)

const saving = ref(false)
const saveError = ref(null)

async function save() {
  saving.value = true
  saveError.value = null
  try {
    await doc.setValue.submit(values)
    toast.success('Saved')
  } catch (e) {
    saveError.value = e
  } finally {
    saving.value = false
  }
}
</script>

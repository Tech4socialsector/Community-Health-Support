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
          {{ t('Save') }}
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
import { t } from '@/data/i18n'

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

// App Setting's programme switches (enable_mch, enable_cancer ...) decide
// which modules the home page, sidebar and routes offer - all loaded once
// at start-up. Turning one on or off reloads the page after saving, so the
// modules appear (or go) straight away.
const programmeSwitches = (d) =>
  JSON.stringify(Object.keys(d || {}).filter((k) => k.startsWith('enable_')).sort().map((k) => [k, !!d[k]]))

async function save() {
  saving.value = true
  saveError.value = null
  const switchesChanged = props.doctype === 'App Setting' && programmeSwitches(values) !== programmeSwitches(doc.doc)
  try {
    await doc.setValue.submit(values)
    if (switchesChanged) {
      toast.success(t('Saved. Reloading to update the modules…'))
      setTimeout(() => window.location.reload(), 800)
      return
    }
    toast.success(t('Saved'))
  } catch (e) {
    saveError.value = e
  } finally {
    saving.value = false
  }
}
</script>

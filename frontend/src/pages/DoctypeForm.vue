<template>
  <AppLayout>
    <PageHeader>
      <template #title>
        <Button variant="ghost" @click="goBack">
          <template #prefix>
            <FeatherIcon name="arrow-left" class="h-4 w-4" />
          </template>
          Back
        </Button>
      </template>
    </PageHeader>

    <div v-if="metaResource.loading && !metaResource.data" class="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2">
      <div v-for="i in 6" :key="i" class="space-y-1.5">
        <Skeleton width="30%" height="0.75rem" />
        <Skeleton height="2.25rem" />
      </div>
    </div>
    <ErrorMessage v-else-if="metaResource.error" :message="metaResource.error" />

    <div v-else-if="!isNew && existingDoc.loading && !existingDoc.doc" class="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2">
      <div v-for="i in 6" :key="i" class="space-y-1.5">
        <Skeleton width="30%" height="0.75rem" />
        <Skeleton height="2.25rem" />
      </div>
    </div>

    <form v-else @submit.prevent="save">
      <div class="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2">
        <div
          v-for="field in fields"
          :key="field.fieldname"
          :class="{ 'sm:col-span-2': isWideField(field) }"
        >
          <DynamicField
            :field="field"
            :doctype="doctype"
            :docname="isNew ? null : name"
            v-model="values[field.fieldname]"
          />
        </div>
      </div>

      <div v-if="tableFields.length" class="mt-6 space-y-6">
        <ChildTable
          v-for="field in tableFields"
          :key="field.fieldname"
          :field="field"
          v-model="values[field.fieldname]"
        />
      </div>

      <ErrorMessage class="mt-4" :message="saveError" />

      <div class="mt-6 flex justify-end gap-2">
        <Button variant="solid" :loading="saving" @click="save">
          Save
        </Button>
      </div>
    </form>
  </AppLayout>
</template>

<script setup>
import { reactive, ref, watch, watchEffect } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { onKeyStroke } from '@vueuse/core'
import { useDoc, useNewDoc, call, Button, ErrorMessage, FeatherIcon, toast } from 'frappe-ui'
import AppLayout from '@/layouts/AppLayout.vue'
import PageHeader from '@/components/PageHeader.vue'
import Skeleton from '@/components/Skeleton.vue'
import DynamicField from '@/components/DynamicField.vue'
import ChildTable from '@/components/ChildTable.vue'
import { useMeta, useFormFields, useTableFields } from '@/data/useMeta'
import { getDoctypeHooks } from '@/doctype-hooks'
import { setPageTitle } from '@/data/pageTitle'

const { doctype, isNew, name } = defineProps({
  doctype: { type: String, required: true },
  isNew: { type: Boolean, default: false },
  name: { type: String, default: null },
})

const route = useRoute()
const router = useRouter()

// Mirrors DoctypeList.vue's routing: generic /:doctypeRoute doctypes use the
// shared DoctypeList route name, dedicated doctypes (e.g. Email Account)
// have their own List route name derived the same way.
const isGenericRoute = route.name === 'DoctypeNew' || route.name === 'DoctypeForm'

function goBack() {
  if (isGenericRoute) {
    router.push({ name: 'DoctypeList', params: { doctypeRoute: route.params.doctypeRoute } })
  } else {
    router.push({ name: route.name.replace('New', 'List').replace('Form', 'List') })
  }
}

const metaResource = useMeta(doctype)
const fields = useFormFields(metaResource)
const tableFields = useTableFields(metaResource)
const hooks = getDoctypeHooks(doctype)

const WIDE_FIELDTYPES = new Set([
  'Small Text',
  'Long Text',
  'Text Editor',
  'Code',
  'Geolocation',
  'Table MultiSelect',
  'Attach',
  'Attach Image',
])
function isWideField(field) {
  return WIDE_FIELDTYPES.has(field.fieldtype)
}

watchEffect(() => {
  setPageTitle(isNew ? `New ${metaResource.data?.name || doctype}` : name)
})

const newDoc = isNew ? useNewDoc(doctype) : null
const existingDoc = isNew ? null : useDoc({ doctype, name })

// `values` is the single source of truth the form binds to - a plain
// reactive object kept in sync with newDoc.doc / existingDoc.doc below,
// rather than binding the form directly to either, so both code paths
// (new vs. existing) look identical to DynamicField/ChildTable and to the
// doctype-hooks diffing below.
const values = reactive({})

function scalarSnapshot() {
  const snap = {}
  for (const f of fields.value) snap[f.fieldname] = values[f.fieldname]
  return snap
}

function childRowsSnapshot() {
  const snap = {}
  for (const f of tableFields.value) {
    snap[f.fieldname] = (values[f.fieldname] || []).map((row) => ({ ...row }))
  }
  return snap
}

function hookCtx() {
  return { isNew, call }
}

// --- Hook wiring state -----------------------------------------------
// doctype-hooks reimplements frappe.ui.form.on(...) client scripts, which
// don't exist in this Vue app. There's no field-level @change event to hook
// into generically (DynamicField/ChildTable are metadata-driven, not aware
// of business logic) - so instead this diffs `values` against its last-seen
// snapshot on every reactive tick, and calls the matching hook for whatever
// changed. A fixed-point loop re-diffs after each hook call (up to 20
// iterations) so a hook-triggered change (e.g. setting date_of_birth) can
// itself cascade into another hook (age, in turn, from date_of_birth).
let lastScalarSnapshot = null
let lastChildSnapshot = null
let applyingHookChange = false

function initSnapshots() {
  lastScalarSnapshot = scalarSnapshot()
  lastChildSnapshot = childRowsSnapshot()
}

function runScalarDiffLoop() {
  if (!hooks?.onFieldChange || applyingHookChange) return
  applyingHookChange = true
  try {
    for (let i = 0; i < 20; i++) {
      const current = scalarSnapshot()
      const changedField = Object.keys(current).find((k) => current[k] !== lastScalarSnapshot[k])
      if (!changedField) break
      lastScalarSnapshot = current
      hooks.onFieldChange(changedField, values, hookCtx())
    }
    lastScalarSnapshot = scalarSnapshot()
  } finally {
    applyingHookChange = false
  }
}

function runChildDiff() {
  if (!hooks?.onChildFieldChange || applyingHookChange) return
  const current = childRowsSnapshot()
  for (const tableField of tableFields.value) {
    const fieldname = tableField.fieldname
    const currentRows = current[fieldname] || []
    const lastRows = lastChildSnapshot[fieldname] || []
    currentRows.forEach((row, idx) => {
      const lastRow = lastRows[idx]
      if (!lastRow) return
      const changedKey = Object.keys(row).find((k) => row[k] !== lastRow[k])
      if (changedKey) {
        hooks.onChildFieldChange(fieldname, changedKey, row, values)
      }
    })
  }
  lastChildSnapshot = current
}

watch(
  () => [scalarSnapshot(), childRowsSnapshot()],
  () => {
    if (applyingHookChange || !lastScalarSnapshot) return
    runScalarDiffLoop()
    runChildDiff()
  },
  { deep: true },
)

// --- Load doc into `values` -------------------------------------------
watch(
  () => (isNew ? newDoc?.doc : existingDoc?.doc),
  (doc) => {
    if (!doc) return
    Object.keys(doc).forEach((k) => {
      values[k] = doc[k]
    })
    initSnapshots()
    if (isNew && hooks?.onLoad) {
      applyingHookChange = true
      hooks.onLoad(values, hookCtx())
      applyingHookChange = false
      initSnapshots()
    }
  },
  { immediate: true, deep: true },
)

const saving = ref(false)
const saveError = ref(null)

async function save() {
  saving.value = true
  saveError.value = null
  try {
    if (isNew) {
      Object.assign(newDoc.doc, values)
      const created = await newDoc.submit()
      toast.success('Created')
      if (isGenericRoute) {
        router.replace({
          name: 'DoctypeForm',
          params: { doctypeRoute: route.params.doctypeRoute, name: created.name },
        })
      } else {
        router.replace({ name: route.name.replace('New', 'Form'), params: { name: created.name } })
      }
    } else {
      await existingDoc.setValue.submit(values)
      toast.success('Saved')
    }
  } catch (e) {
    saveError.value = e
  } finally {
    saving.value = false
  }
}

onKeyStroke((e) => (e.key === 's' || e.key === 'S') && (e.metaKey || e.ctrlKey), (e) => {
  e.preventDefault()
  if (!saving.value) save()
})
</script>

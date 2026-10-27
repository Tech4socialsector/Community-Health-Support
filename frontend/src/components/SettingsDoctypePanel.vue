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
      <div class="space-y-6">
        <section v-for="(sec, i) in shownSections" :key="sec.key">
          <!-- Desk's Section Break headings ("Programmes", "MCH Forms",
          "Login Page" ...), so the settings read in groups as in Desk. -->
          <div v-if="sec.label" class="mb-3" :class="{ 'border-t border-gray-200 pt-5 dark:border-gray-800': i > 0 }">
            <h3 class="text-sm font-semibold text-ink-gray-9">{{ t(sec.label) }}</h3>
            <p v-if="sec.description" class="mt-0.5 text-p-xs text-ink-gray-5">{{ t(sec.description) }}</p>
          </div>
          <!-- A section of tick boxes only (programme switches, a programme's
          forms) goes in two columns. -->
          <div class="grid grid-cols-1 gap-4" :class="{ 'gap-y-2 sm:grid-cols-2': sec.allChecks }">
            <DynamicField
              v-for="field in sec.fields"
              :key="field.fieldname"
              :field="field"
              :doctype="doctype"
              :docname="doctype"
              :doc="values"
              v-model="values[field.fieldname]"
            />
          </div>
        </section>
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
import { computed, reactive, ref, watch } from 'vue'
import { useDoc, Button, ErrorMessage, toast } from 'frappe-ui'
import DynamicField from '@/components/DynamicField.vue'
import Skeleton from '@/components/Skeleton.vue'
import { useMeta, useFormFields } from '@/data/useMeta'
import { t } from '@/data/i18n'
import { evaluateDependsOn } from '@/data/dependsOn'

const props = defineProps({
  doctype: { type: String, required: true },
})

const metaResource = useMeta(props.doctype)
const fields = useFormFields(metaResource)
const doc = useDoc({ doctype: props.doctype, name: props.doctype })

const values = reactive({})

// The fields grouped under their Section Breaks, with Desk's depends_on on
// both - e.g. App Setting's "MCH Forms" section shows only while MCH is
// ticked.
const shown = (f) => !f.depends_on || evaluateDependsOn(f.depends_on, values, values)
const shownSections = computed(() => {
  const keep = new Set(fields.value.map((f) => f.fieldname))
  const sections = [{ key: 'top', label: '', description: '', depends_on: null, fields: [] }]
  for (const f of metaResource.data?.fields || []) {
    if (f.fieldtype === 'Section Break' || f.fieldtype === 'Tab Break') {
      sections.push({ key: f.fieldname, label: f.label, description: f.description, depends_on: f.depends_on, fields: [] })
    } else if (keep.has(f.fieldname)) {
      sections[sections.length - 1].fields.push(f)
    }
  }
  return sections
    .filter((sec) => shown(sec))
    .map((sec) => {
      const visible = sec.fields.filter(shown)
      return { ...sec, fields: visible, allChecks: visible.length > 1 && visible.every((f) => f.fieldtype === 'Check') }
    })
    .filter((sec) => sec.fields.length)
})

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

// App Setting's programme switches (enable_mch ...) and form tick boxes
// (use_pnc ...) decide which modules and forms the home page, sidebar and
// routes offer - all loaded once at start-up. Changing one reloads the page
// after saving, so they appear (or go) straight away.
const programmeSwitches = (d) =>
  JSON.stringify(
    Object.keys(d || {})
      .filter((k) => k.startsWith('enable_') || k.startsWith('use_'))
      .sort()
      .map((k) => [k, !!d[k]]),
  )

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

<template>
  <!-- Programme setup: the programmes this organisation runs, which of
  their forms it uses, and which questions on each form
  (chw.field_settings get_setup / get_form_fields / save_setup). Two
  screens - a programme with its forms, and one form's questions. Nothing
  changes until "Save changes" (top right); App Setting's own save then
  applies it. Locked questions are needed by the app and always shown. -->
  <AppLayout>
    <div class="-m-4 flex min-h-full flex-col bg-gray-50 dark:bg-gray-950 sm:-m-6">
      <!-- Header: where you are, totals, Save / Discard -->
      <header class="flex flex-wrap items-center justify-between gap-3 border-b border-gray-200 bg-white px-4 py-3.5 dark:border-gray-800 dark:bg-gray-900 sm:px-6">
        <div class="min-w-0">
          <nav class="flex flex-wrap items-center gap-1.5 text-[13px] text-gray-500 dark:text-gray-400" :aria-label="t('Breadcrumb')">
            <span>{{ t('Administration') }}</span>
            <span aria-hidden="true">/</span>
            <button type="button" class="hover:text-forest-700" :class="{ 'text-forest-700 dark:text-forest-300': view === 'form' }" @click="view = 'programme'">
              {{ t('Programme setup') }}
            </button>
            <template v-if="view === 'form'">
              <span aria-hidden="true">/</span>
              <span>{{ prog.label }}</span>
              <span aria-hidden="true">/</span>
              <span class="font-medium text-gray-900 dark:text-gray-100">{{ form.label }}</span>
            </template>
          </nav>
          <h1 class="text-xl font-semibold tracking-tight text-gray-900 dark:text-gray-100">
            {{ view === 'form' ? t('Configure questions') : t('Programme setup') }}
          </h1>
        </div>
        <div class="flex flex-wrap items-center justify-end gap-4">
          <div v-if="programmes.length" class="hidden flex-wrap items-center gap-3.5 text-[13px] text-gray-500 dark:text-gray-400 lg:flex">
            <span><strong class="text-gray-900 dark:text-gray-100">{{ programmesOn }}</strong> {{ t('of {0} programmes on', [programmes.length]) }}</span>
            <span class="h-4 w-px bg-gray-200 dark:bg-gray-700" aria-hidden="true" />
            <span><strong class="text-gray-900 dark:text-gray-100">{{ formsInUse }}</strong> {{ t('forms in use') }}</span>
            <span class="h-4 w-px bg-gray-200 dark:bg-gray-700" aria-hidden="true" />
            <span><strong class="text-gray-900 dark:text-gray-100">{{ hiddenTotal }}</strong> {{ t('questions hidden') }}</span>
          </div>
          <div class="flex items-center gap-2 lg:border-l lg:border-gray-200 lg:pl-4 dark:lg:border-gray-700">
            <span v-if="changes" class="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-800 dark:bg-amber-900/40 dark:text-amber-200">
              {{ changes === 1 ? t('1 unsaved change') : t('{0} unsaved changes', [changes]) }}
            </span>
            <button type="button" :class="ui.BTN_SECONDARY" :disabled="!changes || saving" @click="discard">{{ t('Discard') }}</button>
            <button type="button" :class="ui.BTN_PRIMARY" :disabled="!changes || saving" @click="save">
              <LucideIcon v-if="saving" name="loader-circle" class="h-4 w-4 animate-spin" />
              {{ t('Save changes') }}
            </button>
          </div>
        </div>
      </header>

      <div v-if="!isPrivileged && !userContextResource.loading" class="p-6">
        <div :class="ui.EMPTY_STATE">{{ t('Only a System Manager or Program Coordinator can change the programme setup.') }}</div>
      </div>
      <div v-else-if="error" class="p-6"><ErrorMessage :message="error" /></div>
      <div v-else-if="!programmes.length" class="grid gap-4 p-6 md:grid-cols-[16rem_1fr]">
        <Skeleton height="20rem" />
        <Skeleton height="20rem" />
      </div>

      <div v-else class="flex flex-1 flex-col md:flex-row">
        <!-- Programmes -->
        <aside class="flex-shrink-0 border-b border-gray-200 bg-white p-3 dark:border-gray-800 dark:bg-gray-900 md:w-64 md:border-b-0 md:border-r" :aria-label="t('Programmes')">
          <p class="px-2.5 pb-2 pt-1 text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">{{ t('Programmes') }}</p>
          <button
            v-for="p in programmes"
            :key="p.key"
            type="button"
            class="flex w-full items-center gap-2.5 rounded-lg p-2.5 text-left transition"
            :class="p.key === selectedProg ? 'bg-forest-50 dark:bg-forest-900/30' : 'hover:bg-gray-50 dark:hover:bg-gray-800'"
            :aria-current="p.key === selectedProg ? 'page' : undefined"
            @click="selectProgramme(p.key)"
          >
            <span class="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg text-white" :style="{ background: look(p).color }">
              <LucideIcon :name="look(p).icon" class="h-[18px] w-[18px]" />
            </span>
            <span class="flex min-w-0 flex-1 flex-col">
              <span class="truncate text-sm font-medium text-gray-900 dark:text-gray-100">{{ p.label }}</span>
              <span class="text-xs text-gray-500 dark:text-gray-400">
                {{ isOn(p.field) ? t('{0} of {1} forms in use', [p.forms.filter((f) => formOn(f)).length, p.forms.length]) : t('Not in use') }}
              </span>
            </span>
            <span
              class="rounded-full px-2 py-0.5 text-[11px] font-semibold"
              :class="isOn(p.field) ? 'bg-forest-100 text-forest-800 dark:bg-forest-900/50 dark:text-forest-200' : 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400'"
            >
              {{ isOn(p.field) ? t('On') : t('Off') }}
            </span>
          </button>
        </aside>

        <main class="min-w-0 flex-1 space-y-5 p-4 sm:p-6">
          <!-- Screen 1: the programme and its forms -->
          <template v-if="view === 'programme'">
            <section :class="[CARD, 'flex flex-wrap items-center justify-between gap-4 px-5 py-5']">
              <div class="flex min-w-0 items-center gap-3.5">
                <span class="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl text-white" :style="{ background: look(prog).color }">
                  <LucideIcon :name="look(prog).icon" class="h-6 w-6" />
                </span>
                <div class="min-w-0">
                  <h2 class="text-lg font-semibold text-gray-900 dark:text-gray-100">{{ prog.label }}</h2>
                  <p class="text-[13px] text-gray-500 dark:text-gray-400">{{ t(look(prog).description) }}</p>
                </div>
              </div>
              <div class="flex items-center gap-3">
                <div class="text-right">
                  <p class="text-sm font-medium text-gray-900 dark:text-gray-100">{{ t('Programme enabled') }}</p>
                  <p class="text-xs text-gray-500 dark:text-gray-400">{{ isOn(prog.field) ? t('Its forms appear in the app') : t('Hidden from the app') }}</p>
                </div>
                <OnOffSwitch :on="isOn(prog.field)" :label="t('Programme enabled')" big @toggle="flip(prog.field)" />
              </div>
            </section>

            <section :class="[CARD, 'overflow-hidden']">
              <div class="flex flex-wrap items-baseline justify-between gap-2 border-b border-gray-100 px-5 py-4 dark:border-gray-800">
                <div>
                  <h2 class="text-[15px] font-semibold text-gray-900 dark:text-gray-100">{{ t('Forms') }}</h2>
                  <p class="text-[13px] text-gray-500 dark:text-gray-400">{{ t('Choose the forms this organisation uses, then configure their questions.') }}</p>
                </div>
                <span class="text-[13px] text-gray-500 dark:text-gray-400">{{ t('{0} of {1} in use', [prog.forms.filter((f) => formOn(f)).length, prog.forms.length]) }}</span>
              </div>
              <p v-if="!isOn(prog.field)" class="px-5 py-10 text-center text-sm text-gray-500 dark:text-gray-400">
                {{ t('This programme is disabled. Enable it to choose its forms.') }}
              </p>
              <div v-else class="overflow-x-auto">
                <table class="w-full min-w-[40rem] text-left text-sm">
                  <thead class="bg-gray-50 text-xs text-gray-500 dark:bg-gray-800/60 dark:text-gray-400">
                    <tr>
                      <th class="px-5 py-2.5 font-medium">{{ t('Form') }}</th>
                      <th class="px-3 py-2.5 font-medium">{{ t('Questions') }}</th>
                      <th class="px-3 py-2.5 font-medium">{{ t('In use') }}</th>
                      <th class="px-5 py-2.5 text-right font-medium">{{ t('Questions setup') }}</th>
                    </tr>
                  </thead>
                  <tbody class="divide-y divide-gray-100 dark:divide-gray-800">
                    <tr v-for="f in prog.forms" :key="f.doctype" class="hover:bg-gray-50/70 dark:hover:bg-gray-800/40">
                      <td class="px-5 py-3.5 font-medium text-gray-900 dark:text-gray-100">{{ f.label }}</td>
                      <td class="px-3 py-3.5">
                        <div class="flex max-w-[13rem] flex-col gap-1.5">
                          <span class="text-[13px] text-gray-600 dark:text-gray-300">
                            {{ formOn(f) ? t('{0} of {1} shown', [counts(f).shown, counts(f).total]) : t('Not in use') }}
                          </span>
                          <span class="block h-1.5 overflow-hidden rounded bg-gray-100 dark:bg-gray-800" aria-hidden="true">
                            <span class="block h-1.5 rounded bg-forest-700" :style="{ width: formOn(f) && counts(f).total ? `${(counts(f).shown / counts(f).total) * 100}%` : '0%' }" />
                          </span>
                        </div>
                      </td>
                      <td class="px-3 py-3.5">
                        <OnOffSwitch v-if="f.field" :on="formOn(f)" :label="t('Use {0}', [f.label])" @toggle="toggleForm(f)" />
                        <span v-else class="text-xs text-gray-500 dark:text-gray-400">{{ t('With the programme') }}</span>
                      </td>
                      <td class="px-5 py-2.5 text-right">
                        <button
                          type="button"
                          class="h-9 rounded-lg px-3.5 text-[13px] font-medium ring-1 transition disabled:cursor-not-allowed"
                          :class="formOn(f) ? 'bg-white text-forest-700 ring-forest-700 hover:bg-forest-50 dark:bg-gray-900 dark:text-forest-300 dark:ring-forest-500' : 'bg-gray-50 text-gray-400 ring-gray-200 dark:bg-gray-800 dark:ring-gray-700'"
                          :disabled="!formOn(f)"
                          @click="openForm(f)"
                        >
                          {{ t('Configure questions') }}
                        </button>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </section>
          </template>

          <!-- Screen 2: one form's questions -->
          <template v-else>
            <section :class="[CARD, 'flex flex-wrap items-center justify-between gap-3 px-5 py-4']">
              <div class="flex min-w-0 items-start gap-3">
                <button
                  type="button"
                  class="mt-0.5 inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-2.5 text-[13px] font-medium text-gray-700 hover:border-forest-300 hover:bg-forest-50 hover:text-forest-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-forest-500 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-forest-900/30"
                  :title="t('Back to {0}', [prog.label])"
                  @click="view = 'programme'"
                >
                  <LucideIcon name="arrow-left" class="h-4 w-4" />
                  {{ t('Back') }}
                </button>
                <div class="min-w-0">
                <h2 class="text-[17px] font-semibold text-gray-900 dark:text-gray-100">{{ form.label }}</h2>
                <p class="text-[13px] text-gray-500 dark:text-gray-400">
                  {{ t("Questions this organisation doesn't use are hidden in the app and Desk. They never block saving, and keep their data if shown again.") }}
                </p>
                </div>
              </div>
              <div class="flex gap-2.5">
                <div class="rounded-lg bg-forest-50 px-3.5 py-2 text-center dark:bg-forest-900/30">
                  <div class="text-lg font-semibold text-forest-700 dark:text-forest-300">{{ counts(form).shown }}</div>
                  <div class="text-[11px] text-gray-500">{{ t('Shown') }}</div>
                </div>
                <div class="rounded-lg bg-gray-100 px-3.5 py-2 text-center dark:bg-gray-800">
                  <div class="text-lg font-semibold text-gray-900 dark:text-gray-100">{{ counts(form).total - counts(form).shown }}</div>
                  <div class="text-[11px] text-gray-500">{{ t('Hidden') }}</div>
                </div>
                <div class="rounded-lg bg-gray-100 px-3.5 py-2 text-center dark:bg-gray-800">
                  <div class="text-lg font-semibold text-gray-900 dark:text-gray-100">{{ counts(form).locked }}</div>
                  <div class="text-[11px] text-gray-500">{{ t('Required by app') }}</div>
                </div>
              </div>
            </section>

            <div v-if="!sectionsFor(form.doctype)" class="grid gap-4 md:grid-cols-[15rem_1fr]">
              <Skeleton height="16rem" />
              <Skeleton height="16rem" />
            </div>
            <div v-else class="flex flex-col gap-4 lg:flex-row lg:items-start">
              <nav :class="[CARD, 'flex-shrink-0 p-2 lg:w-60']" :aria-label="t('Sections')">
                <button
                  v-for="(s, i) in sectionsFor(form.doctype)"
                  :key="s.label + i"
                  type="button"
                  class="flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2.5 text-left text-sm transition"
                  :class="i === sectionIndex ? 'bg-forest-50 font-semibold text-gray-900 dark:bg-forest-900/30 dark:text-gray-100' : 'text-gray-700 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-gray-800'"
                  :aria-current="i === sectionIndex ? 'true' : undefined"
                  @click="selectSection(i)"
                >
                  <span class="min-w-0">{{ s.label }}</span>
                  <span class="text-xs font-normal tabular-nums text-gray-500">{{ shownIn(s) }}/{{ s.fields.length }}</span>
                </button>
              </nav>

              <section :class="[CARD, 'min-w-0 flex-1 overflow-hidden']">
                <div class="flex flex-wrap items-center gap-2.5 border-b border-gray-100 px-4 py-3 dark:border-gray-800">
                  <h3 class="mr-auto text-[15px] font-semibold text-gray-900 dark:text-gray-100">
                    {{ search.trim() ? t('Search results') : section.label }}
                  </h3>
                  <div class="relative">
                    <LucideIcon name="search" class="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                    <input
                      v-model="search"
                      type="search"
                      :placeholder="t('Search questions')"
                      class="h-9 w-56 rounded-lg border-0 bg-white pl-8 pr-3 text-[13px] ring-1 ring-gray-200 focus:ring-2 focus:ring-forest-400 dark:bg-gray-900 dark:text-gray-100 dark:ring-gray-700"
                    />
                  </div>
                  <div class="inline-flex gap-0.5 rounded-lg bg-gray-100 p-0.5 dark:bg-gray-800" role="group" :aria-label="t('Filter')">
                    <button
                      v-for="fl in FILTERS"
                      :key="fl.key"
                      type="button"
                      class="h-8 rounded-md px-2.5 text-xs"
                      :class="filter === fl.key ? 'bg-white font-medium text-gray-900 shadow-sm dark:bg-gray-700 dark:text-gray-100' : 'text-gray-600 dark:text-gray-300'"
                      :aria-pressed="filter === fl.key"
                      @click="filter = fl.key"
                    >
                      {{ t(fl.label) }}
                    </button>
                  </div>
                </div>
                <div class="flex flex-wrap items-center justify-between gap-2 border-b border-gray-100 bg-gray-50 px-4 py-2 text-xs text-gray-600 dark:border-gray-800 dark:bg-gray-800/50 dark:text-gray-300">
                  <span>
                    {{ t('{0} of {1} questions shown', [shownIn(section), section.fields.length]) }} ·
                    {{ t('{0} required by the app', [section.fields.filter((f) => f.locked).length]) }}
                  </span>
                  <span class="flex gap-1.5">
                    <button type="button" class="h-7 rounded-md bg-white px-2.5 ring-1 ring-gray-200 hover:bg-gray-50 dark:bg-gray-900 dark:ring-gray-700" @click="setSection(false)">{{ t('Show all') }}</button>
                    <button type="button" class="h-7 rounded-md bg-white px-2.5 ring-1 ring-gray-200 hover:bg-gray-50 dark:bg-gray-900 dark:ring-gray-700" @click="setSection(true)">{{ t('Hide all optional') }}</button>
                  </span>
                </div>
                <div class="overflow-x-auto">
                  <table class="w-full min-w-[34rem] text-left text-sm">
                    <thead class="text-xs text-gray-500 dark:text-gray-400">
                      <tr>
                        <th class="px-4 py-2.5 font-medium">{{ t('Question') }}</th>
                        <th class="px-3 py-2.5 font-medium">{{ t('Answer type') }}</th>
                        <th class="px-3 py-2.5 font-medium">{{ t('Rule') }}</th>
                        <th class="px-4 py-2.5 text-right font-medium">{{ t('Shown') }}</th>
                      </tr>
                    </thead>
                    <tbody class="divide-y divide-gray-100 dark:divide-gray-800">
                      <tr v-for="q in rows" :key="q.fieldname" class="hover:bg-gray-50/70 dark:hover:bg-gray-800/40">
                        <td class="px-4 py-2.5 font-medium" :class="isShown(q) ? 'text-gray-900 dark:text-gray-100' : 'text-gray-400'">{{ q.label }}</td>
                        <td class="px-3 py-2.5 text-gray-500 dark:text-gray-400">{{ q.type }}</td>
                        <td class="px-3 py-2.5">
                          <span
                            v-if="q.locked"
                            class="inline-flex items-center gap-1.5 rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-medium text-blue-800 dark:bg-blue-900/30 dark:text-blue-200"
                            :title="t('Needed by the app: always shown')"
                          >
                            <LucideIcon name="lock" class="h-3 w-3" />{{ q.reason }}
                          </span>
                          <span v-else class="text-xs text-gray-500">{{ t('Optional') }}</span>
                        </td>
                        <td class="px-4 py-2 text-right">
                          <OnOffSwitch :on="isShown(q)" :label="t('Show {0}', [q.label])" :locked="q.locked" @toggle="toggleField(q)" />
                        </td>
                      </tr>
                    </tbody>
                  </table>
                  <p v-if="!rows.length" class="px-4 py-8 text-center text-sm text-gray-500">{{ t('No questions match.') }}</p>
                </div>
              </section>
            </div>
          </template>
        </main>
      </div>
    </div>
  </AppLayout>
</template>

<script setup>
import { computed, defineComponent, h, onBeforeUnmount, reactive, ref, watch } from 'vue'
import { ErrorMessage, call, toast } from 'frappe-ui'
import AppLayout from '@/layouts/AppLayout.vue'
import Skeleton from '@/components/Skeleton.vue'
import LucideIcon from '@/components/LucideIcon.vue'
import { userContextResource } from '@/data/userContext'
import { setPageTitle } from '@/data/pageTitle'
import { t } from '@/data/i18n'
import * as ui from '@/data/ui'

setPageTitle('Programme setup')

const CARD = 'rounded-xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900'
const LOOKS = {
  mch: { icon: 'baby', color: '#2b6cb0', description: 'Pregnancy, birth and the first year of life.' },
  palliative: { icon: 'heart-handshake', color: '#6d4bc4', description: 'Patients cared for at home.' },
  mental_health: { icon: 'brain', color: '#0f766e', description: 'Registration and follow-up of patients.' },
  ncd: { icon: 'activity', color: '#a0560f', description: 'Hypertension, diabetes and other long-term illness.' },
  cancer: { icon: 'ribbon', color: '#9f1f4f', description: 'Eligibility, oral, breast and cervical screening, and clinical evaluation.' },
}
const look = (p) => LOOKS[p.key] || { icon: 'file-text', color: '#5b6560', description: '' }
const FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'shown', label: 'Shown' },
  { key: 'hidden', label: 'Hidden' },
  { key: 'locked', label: 'Required' },
]

// A small on/off switch (role="switch"); locked = on and can't change.
const OnOffSwitch = defineComponent({
  props: { on: Boolean, label: String, locked: Boolean, big: Boolean },
  emits: ['toggle'],
  setup(props, { emit }) {
    return () =>
      h(
        'button',
        {
          type: 'button',
          role: 'switch',
          'aria-checked': props.on ? 'true' : 'false',
          'aria-label': props.label,
          disabled: props.locked,
          title: props.locked ? t('Needed by the app: always shown') : undefined,
          class: [
            'inline-flex flex-shrink-0 rounded-full p-[3px] transition focus:outline-none focus-visible:ring-2 focus-visible:ring-forest-400',
            props.big ? 'h-[26px] w-[46px]' : 'h-[22px] w-10',
            props.locked
              ? 'cursor-not-allowed justify-end bg-forest-300 dark:bg-forest-800'
              : props.on
                ? 'justify-end bg-forest-700 dark:bg-forest-500'
                : 'justify-start bg-gray-300 dark:bg-gray-600',
          ],
          onClick: () => !props.locked && emit('toggle'),
        },
        [h('span', { class: ['rounded-full bg-white shadow', props.big ? 'h-5 w-5' : 'h-4 w-4'] })],
      )
  },
})

const isPrivileged = computed(() => !!userContextResource.data?.is_privileged)

// ---- Saved state and the unsaved draft ----
const programmes = ref([])
const saved = reactive({ switches: {}, hidden: {} })
const draft = reactive({ switches: {}, hidden: {} })
const error = ref(null)
const saving = ref(false)

function parseHidden(value) {
  try {
    const data = JSON.parse(value || '{}')
    return data && typeof data === 'object' ? data : {}
  } catch {
    return {}
  }
}
const copy = (x) => JSON.parse(JSON.stringify(x))

function setFrom(data) {
  programmes.value = data.programmes || []
  const switches = {}
  for (const p of programmes.value) {
    switches[p.field] = !!p.on
    for (const f of p.forms) if (f.field) switches[f.field] = !!f.on
  }
  const hidden = parseHidden(data.hidden_form_fields)
  saved.switches = { ...switches }
  saved.hidden = copy(hidden)
  draft.switches = { ...switches }
  draft.hidden = copy(hidden)
}

async function load() {
  error.value = null
  try {
    setFrom(await call('chw.field_settings.get_setup'))
  } catch (e) {
    error.value = e?.messages?.join(', ') || e?.message || t('Could not load the programme setup.')
  }
}
watch(isPrivileged, (yes) => yes && !programmes.value.length && load(), { immediate: true })

const isOn = (field) => !!draft.switches[field]
const formOn = (f) => !f.field || isOn(f.field)
function flip(field) {
  draft.switches[field] = !draft.switches[field]
}

// Each change counts once: a switch, or a question shown/hidden.
const hiddenSet = (doctype) => new Set(draft.hidden[doctype] || [])
const changes = computed(() => {
  let n = 0
  for (const k of Object.keys(draft.switches)) if (draft.switches[k] !== saved.switches[k]) n++
  for (const name of new Set([...Object.keys(draft.hidden), ...Object.keys(saved.hidden)])) {
    const a = new Set(draft.hidden[name] || [])
    const b = new Set(saved.hidden[name] || [])
    for (const x of a) if (!b.has(x)) n++
    for (const x of b) if (!a.has(x)) n++
  }
  return n
})

function discard() {
  draft.switches = { ...saved.switches }
  draft.hidden = copy(saved.hidden)
}

async function save() {
  saving.value = true
  try {
    const hidden = {}
    for (const [name, names] of Object.entries(draft.hidden)) if (names?.length) hidden[name] = names.slice().sort()
    await call('chw.field_settings.save_setup', {
      switches: JSON.stringify(draft.switches),
      hidden_form_fields: Object.keys(hidden).length ? JSON.stringify(hidden) : '',
    })
    // Modules, menus and form layouts are loaded once at start-up.
    toast.success(t('All changes saved. Reloading to apply them…'))
    setTimeout(() => window.location.reload(), 900)
  } catch (e) {
    toast.error(e?.messages?.join(', ') || e?.message || t('Could not save the programme setup.'))
    saving.value = false
  }
}

// Closing or reloading the tab with unsaved changes asks first.
function warnUnsaved(e) {
  if (changes.value && !saving.value) e.preventDefault()
}
window.addEventListener('beforeunload', warnUnsaved)
onBeforeUnmount(() => window.removeEventListener('beforeunload', warnUnsaved))

// ---- Selection ----
const view = ref('programme')
const selectedProg = ref('cancer')
const selectedForm = ref('')
const EMPTY_PROG = { key: '', label: '', field: '', forms: [] }
const EMPTY_FORM = { doctype: '', label: '', field: null, total: 0, shown: 0 }
const prog = computed(() => programmes.value.find((p) => p.key === selectedProg.value) || programmes.value[0] || EMPTY_PROG)
const form = computed(() => prog.value.forms.find((f) => f.doctype === selectedForm.value) || prog.value.forms[0] || EMPTY_FORM)
const programmesOn = computed(() => programmes.value.filter((p) => isOn(p.field)).length)
const formsInUse = computed(() => programmes.value.reduce((n, p) => n + (isOn(p.field) ? p.forms.filter((f) => formOn(f)).length : 0), 0))
const hiddenTotal = computed(() => Object.values(draft.hidden).reduce((n, names) => n + (names?.length || 0), 0))

// ---- Questions of the open form ----
const sectionsCache = reactive({})
const sectionIndex = ref(0)
const search = ref('')
const filter = ref('all')

function selectProgramme(key) {
  selectedProg.value = key
  view.value = 'programme'
}
async function loadSections(doctype) {
  if (sectionsCache[doctype]) return
  try {
    sectionsCache[doctype] = (await call('chw.field_settings.get_form_fields', { form: doctype })) || []
  } catch (e) {
    error.value = e?.messages?.join(', ') || e?.message || t('Could not load the questions.')
  }
}
function openForm(f) {
  selectedForm.value = f.doctype
  sectionIndex.value = 0
  search.value = ''
  filter.value = 'all'
  view.value = 'form'
  loadSections(f.doctype)
}
// Switching a form on opens its questions straight away.
function toggleForm(f) {
  const turningOn = !formOn(f)
  flip(f.field)
  if (turningOn) openForm(f)
}

const sectionsFor = (doctype) => sectionsCache[doctype]
const section = computed(() => (sectionsFor(form.value.doctype) || [])[sectionIndex.value] || { label: '', fields: [] })
function selectSection(i) {
  sectionIndex.value = i
  search.value = ''
}

const isShown = (q) => q.locked || !hiddenSet(form.value.doctype).has(q.fieldname)
const shownIn = (s) => s.fields.filter((q) => isShown(q)).length
function toggleField(q) {
  if (q.locked) return
  const set = hiddenSet(form.value.doctype)
  if (set.has(q.fieldname)) set.delete(q.fieldname)
  else set.add(q.fieldname)
  draft.hidden[form.value.doctype] = [...set]
}
function setSection(hide) {
  const set = hiddenSet(form.value.doctype)
  for (const q of section.value.fields) {
    if (q.locked) continue
    if (hide) set.add(q.fieldname)
    else set.delete(q.fieldname)
  }
  draft.hidden[form.value.doctype] = [...set]
}

// Search looks across every section of the form; filters narrow the rows.
const rows = computed(() => {
  const q = search.value.trim().toLowerCase()
  const pool = q ? (sectionsFor(form.value.doctype) || []).flatMap((s) => s.fields) : section.value.fields
  return pool.filter((x) => {
    if (q && !x.label.toLowerCase().includes(q)) return false
    if (filter.value === 'shown') return !x.locked && isShown(x)
    if (filter.value === 'hidden') return !isShown(x)
    if (filter.value === 'locked') return x.locked
    return true
  })
})

// Shown / total / locked for a form: from its loaded questions and the
// draft, else the counts the server sent.
function counts(f) {
  const sections = sectionsCache[f.doctype]
  if (!sections) return { shown: f.shown ?? 0, total: f.total ?? 0, locked: 0 }
  const hidden = hiddenSet(f.doctype)
  let total = 0
  let shown = 0
  let locked = 0
  for (const s of sections)
    for (const x of s.fields) {
      total++
      if (x.locked) locked++
      if (x.locked || !hidden.has(x.fieldname)) shown++
    }
  return { shown, total, locked }
}
</script>

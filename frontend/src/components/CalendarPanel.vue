<template>
  <!-- The calendar inside DateField's popup, in the "Auto" locale style:
  « ‹ Month Year › » across the top, Mo-Su week rows, today in red, days
  of the next / previous month greyed. Month and year names come from the
  app language (browser's own when English), via Intl - nothing to
  translate. Clicking the month or year jumps to a month / year grid, so a
  date of birth 40 years back is three clicks, not 480. -->
  <div
    class="chw-calendar w-[19rem] select-none rounded-lg border border-forest-300 bg-white p-2 text-base text-ink-gray-8 shadow-xl dark:border-forest-700 dark:bg-gray-900"
  >
    <div class="flex items-center gap-0.5 border-b border-gray-200 pb-2 dark:border-gray-800">
      <button type="button" :class="NAV" :aria-label="t('Previous year')" @click="step(-12)">
        <LucideIcon name="chevrons-left" class="h-4 w-4" />
      </button>
      <button type="button" :class="NAV" :aria-label="t('Previous month')" @click="step(-1)">
        <LucideIcon name="chevron-left" class="h-4 w-4" />
      </button>
      <div class="flex flex-1 items-center justify-center gap-1 text-sm font-semibold text-ink-gray-9">
        <button type="button" :class="TITLE" @click="view = view === 'month' ? 'date' : 'month'">
          {{ monthNames[month] }}
        </button>
        <button type="button" :class="TITLE" @click="view = view === 'year' ? 'date' : 'year'">
          {{ year }}
        </button>
      </div>
      <button type="button" :class="NAV" :aria-label="t('Next month')" @click="step(1)">
        <LucideIcon name="chevron-right" class="h-4 w-4" />
      </button>
      <button type="button" :class="NAV" :aria-label="t('Next year')" @click="step(12)">
        <LucideIcon name="chevrons-right" class="h-4 w-4" />
      </button>
    </div>

    <div v-if="view === 'date'" class="pt-1" role="grid">
      <div class="grid grid-cols-7" role="row">
        <div
          v-for="d in weekdayNames"
          :key="d"
          class="flex h-9 items-center justify-center text-sm font-semibold text-ink-gray-6"
          role="columnheader"
        >
          {{ d }}
        </div>
      </div>
      <div v-for="(week, w) in weeks" :key="w" class="grid grid-cols-7" role="row">
        <button
          v-for="day in week"
          :key="day.iso"
          type="button"
          role="gridcell"
          :aria-selected="day.iso === selected"
          :class="dayClass(day)"
          @click="pick(day)"
        >
          {{ day.date.getDate() }}
        </button>
      </div>
    </div>

    <div v-else-if="view === 'month'" class="grid grid-cols-3 gap-1 pt-2">
      <button
        v-for="(m, i) in shortMonthNames"
        :key="m"
        type="button"
        :class="[CELL, i === month ? CELL_ON : '']"
        @click="month = i; view = 'date'"
      >
        {{ m }}
      </button>
    </div>

    <div v-else class="pt-2">
      <div class="mb-1 flex items-center justify-between">
        <button type="button" :class="NAV" @click="yearStart -= 12">
          <LucideIcon name="chevron-left" class="h-4 w-4" />
        </button>
        <span class="text-sm font-medium text-ink-gray-7">{{ yearStart }} – {{ yearStart + 11 }}</span>
        <button type="button" :class="NAV" @click="yearStart += 12">
          <LucideIcon name="chevron-right" class="h-4 w-4" />
        </button>
      </div>
      <div class="grid grid-cols-3 gap-1">
        <button
          v-for="y in 12"
          :key="y"
          type="button"
          :class="[CELL, yearStart + y - 1 === year ? CELL_ON : '']"
          @click="year = yearStart + y - 1; view = 'month'"
        >
          {{ yearStart + y - 1 }}
        </button>
      </div>
    </div>

    <div
      v-if="withTime || modelValue"
      class="mt-1 flex items-center gap-2 border-t border-gray-200 pt-2 dark:border-gray-800"
    >
      <input
        v-if="withTime"
        type="time"
        :value="time"
        class="h-8 rounded-md border border-gray-300 bg-white px-2 text-sm focus:border-forest-500 focus:ring-forest-500 dark:border-gray-700 dark:bg-gray-800"
        :aria-label="t('Time')"
        @change="setTime($event.target.value)"
      />
      <button
        v-if="modelValue"
        type="button"
        class="ml-auto rounded-md px-2 py-1 text-sm text-ink-gray-6 hover:bg-gray-100 hover:text-ink-gray-9 dark:hover:bg-gray-800"
        @click="$emit('update:modelValue', null); $emit('done')"
      >
        {{ t('Clear') }}
      </button>
    </div>
  </div>
</template>

<script setup>
import { computed, ref } from 'vue'
import LucideIcon from '@/components/LucideIcon.vue'
import { dateLocale, t } from '@/data/i18n'
import { parseDate, toDateStr, today } from '@/doctype-hooks/utils'

const props = defineProps({
  // Frappe's value: 'YYYY-MM-DD', or 'YYYY-MM-DD HH:mm:ss' with withTime.
  modelValue: { type: String, default: null },
  withTime: { type: Boolean, default: false },
})
const emit = defineEmits(['update:modelValue', 'done'])

const NAV =
  'flex h-8 w-8 items-center justify-center rounded-md text-ink-gray-5 hover:bg-gray-100 hover:text-ink-gray-9 dark:hover:bg-gray-800'
const TITLE = 'rounded-md px-1.5 py-1 hover:bg-gray-100 dark:hover:bg-gray-800'
const CELL = 'h-10 rounded-md text-sm text-ink-gray-8 hover:bg-forest-50 dark:hover:bg-forest-900/40'
const CELL_ON = '!bg-forest-700 font-semibold !text-white'

const selected = computed(() => (props.modelValue ? props.modelValue.slice(0, 10) : null))
const time = computed(() => (props.modelValue || '').slice(11, 16) || '09:00')
const todayIso = today()

const start = parseDate(props.modelValue) || new Date()
const month = ref(start.getMonth())
const year = ref(start.getFullYear())
const yearStart = ref(year.value - 6)
const view = ref('date')

// "Auto": names from the app language, or the browser's when English.
const monthNames = computed(() => names({ month: 'long' }, 12, (i) => new Date(2026, i, 1)))
const shortMonthNames = computed(() => names({ month: 'short' }, 12, (i) => new Date(2026, i, 1)))
// 2026-01-05 is a Monday, so the week starts on Monday.
const weekdayNames = computed(() =>
  names({ weekday: 'short' }, 7, (i) => new Date(2026, 0, 5 + i)).map((d) => d.replace(/\.$/, '').slice(0, 2))
)
function names(opts, n, dateAt) {
  const fmt = new Intl.DateTimeFormat(dateLocale(), opts)
  return Array.from({ length: n }, (_, i) => fmt.format(dateAt(i)))
}

// Six Monday-first weeks, padded with the neighbouring months' days.
const weeks = computed(() => {
  const first = new Date(year.value, month.value, 1)
  const offset = (first.getDay() + 6) % 7
  return Array.from({ length: 6 }, (_, w) =>
    Array.from({ length: 7 }, (_, d) => {
      const date = new Date(year.value, month.value, 1 - offset + w * 7 + d)
      return { date, iso: toDateStr(date), inMonth: date.getMonth() === month.value }
    })
  )
})

function dayClass(day) {
  const base = 'm-0.5 flex h-9 items-center justify-center rounded-md text-sm transition'
  if (day.iso === selected.value) return `${base} bg-forest-700 font-semibold text-white`
  const tone = !day.inMonth
    ? 'text-ink-gray-4'
    : day.iso === todayIso
      ? 'font-semibold text-red-600 dark:text-red-400'
      : 'text-ink-gray-8'
  return `${base} ${tone} hover:bg-forest-50 dark:hover:bg-forest-900/40`
}

function step(months) {
  const d = new Date(year.value, month.value + months, 1)
  month.value = d.getMonth()
  year.value = d.getFullYear()
  yearStart.value = year.value - 6
}

function pick(day) {
  if (!day.inMonth) {
    month.value = day.date.getMonth()
    year.value = day.date.getFullYear()
  }
  if (props.withTime) {
    emit('update:modelValue', `${day.iso} ${time.value}:00`)
  } else {
    emit('update:modelValue', day.iso)
    emit('done')
  }
}

function setTime(hhmm) {
  if (!hhmm) return
  emit('update:modelValue', `${selected.value || todayIso} ${hhmm}:00`)
}
</script>

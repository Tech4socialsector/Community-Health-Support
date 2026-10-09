<template>
  <!-- A list-toolbar button with its own panel (Filters, Sort, Columns).
  From sm up the panel drops down under the button; on a phone it's a
  bottom sheet over a dimmed backdrop - always fully on screen, thumb-
  reachable, and drawn by the page itself (a native <select> popup is
  placed by the browser, and landed off-screen in the installed app). -->
  <div ref="root" class="relative">
    <button
      type="button"
      :class="[ui.BTN_SECONDARY, '!h-8', { '!ring-forest-400': open, '!h-9 !w-9 !px-0': iconOnly }]"
      :aria-expanded="open"
      :aria-label="iconOnlyOnPhone || iconOnly ? label : undefined"
      :title="iconOnly ? label : undefined"
      @click="open = !open"
    >
      <LucideIcon :name="icon" class="h-4 w-4" />
      <!-- Long labels (a sort field like "Total Family Members in the
      Family") are clipped on a phone so the toolbar stays one row. -->
      <span v-if="!iconOnly" class="max-w-[7rem] truncate sm:max-w-[12rem]" :class="{ 'hidden sm:inline': iconOnlyOnPhone }">{{ label }}</span>
      <span v-if="badge" :class="{ 'hidden sm:inline-flex': iconOnlyOnPhone }"><span :class="ui.COUNT_BADGE">{{ badge }}</span></span>
    </button>
    <!-- Icon-only on a phone: the count rides on the corner instead, so the
    button keeps its size and the search box beside it isn't squeezed. -->
    <span
      v-if="badge && iconOnlyOnPhone"
      class="pointer-events-none absolute -right-1 -top-1 flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-forest-700 px-1 text-[10px] font-semibold leading-none text-white ring-2 ring-white dark:ring-gray-900 sm:hidden"
    >
      {{ badge }}
    </span>

    <!-- On a phone the sheet is moved to <body>: inside a parent with a
    backdrop blur (the form's sticky header) "fixed" is measured from that
    parent, not the screen, so the bottom sheet was squeezed in under the
    header instead of rising from the bottom. -->
    <Teleport to="body" :disabled="!isPhone">
    <template v-if="open">
      <!-- Phone backdrop: tap outside the sheet to close. -->
      <div class="fixed inset-0 z-40 bg-black/30 sm:hidden" @click="open = false" />
      <div
        ref="panel"
        class="fixed inset-x-0 bottom-0 z-50 max-h-[75vh] overflow-y-auto rounded-t-2xl bg-white p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] shadow-2xl dark:bg-gray-900 sm:absolute sm:inset-x-auto sm:bottom-auto sm:top-full sm:mt-2 sm:max-h-96 sm:rounded-xl sm:p-2 sm:pb-2 sm:shadow-xl sm:ring-1 sm:ring-gray-200 dark:sm:ring-gray-700"
        :class="[align === 'right' ? 'sm:right-0' : 'sm:left-0', width]"
        role="dialog"
        :aria-label="label"
      >
        <div class="mb-3 flex items-center justify-between sm:hidden">
          <span class="h-1 w-10 rounded-full bg-gray-200 dark:bg-gray-700" aria-hidden="true" />
        </div>
        <div class="mb-2 flex items-center justify-between sm:hidden">
          <span class="text-base font-semibold text-navy-900 dark:text-gray-100">{{ label }}</span>
          <button type="button" class="text-sm font-semibold text-forest-700 dark:text-forest-300" @click="open = false">Done</button>
        </div>
        <slot :close="() => (open = false)" />
      </div>
    </template>
    </Teleport>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { breakpointsTailwind, onClickOutside, onKeyStroke, useBreakpoints } from '@vueuse/core'
import LucideIcon from '@/components/LucideIcon.vue'
import * as ui from '@/data/ui'

defineProps({
  label: { type: String, required: true },
  icon: { type: String, required: true },
  badge: { type: [Number, String], default: null },
  // Which edge the desktop dropdown lines up with.
  align: { type: String, default: 'left' },
  // Desktop dropdown width (the phone sheet is always full width).
  width: { type: String, default: 'sm:w-64' },
  // Phone toolbars are tight: show just the icon there.
  iconOnlyOnPhone: { type: Boolean, default: false },
  // Just the icon at every width (a form header's "..." menu) - the label
  // is still its accessible name and tooltip.
  iconOnly: { type: Boolean, default: false },
})

const open = ref(false)
const root = ref(null)
const panel = ref(null)
const isPhone = useBreakpoints(breakpointsTailwind).smaller('sm')

// Desktop: a click anywhere else closes it. (On a phone the backdrop
// handles its own close.) The panel itself is ignored too - on a phone it
// sits on <body>, outside `root`, and a tap in it would otherwise close it
// before the tapped button acted. Dropdown lists opened from inside the
// panel (the Filter rows' field / condition pickers) render in a layer on
// <body> as well - a pick there isn't a click "outside" either.
onClickOutside(root, () => (open.value = false), {
  ignore: [panel, '[data-slot="content"]', '[data-reka-popper-content-wrapper]', '[role="listbox"]'],
})
onKeyStroke('Escape', () => (open.value = false))
</script>

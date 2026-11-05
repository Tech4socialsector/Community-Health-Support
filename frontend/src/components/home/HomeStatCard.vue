<template>
  <!-- Household profile / Family members on Home: icon, big count, "View
  records" and its own New button. A div, not a link, as it holds two
  actions; the stretched ::after on the title link makes the whole card
  open the list, and New sits above it (z-10). -->
  <div :class="[ui.HOME_CARD, 'relative flex items-center gap-4 p-5 sm:gap-5 sm:px-6']">
    <span
      class="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl text-white sm:h-11 sm:w-11"
      :class="tone.tile"
      aria-hidden="true"
    >
      <LucideIcon :name="icon" class="h-5 w-5" />
    </span>
    <div class="min-w-0 flex-1">
      <router-link
        :to="{ name: 'DoctypeList', params: { doctypeRoute: item.route } }"
        class="block truncate text-sm font-medium text-gray-600 after:absolute after:inset-0 after:rounded-2xl focus:outline-none dark:text-gray-300"
      >
        {{ t(item.label) }}
      </router-link>
      <Skeleton v-if="loading" width="2.5rem" height="1.75rem" class="mt-1" />
      <span v-else class="mt-0.5 block text-2xl font-bold leading-tight tracking-tight tabular-nums text-gray-900 dark:text-gray-50">
        {{ count ?? '—' }}
      </span>
      <span class="mt-0.5 inline-flex items-center gap-1 text-[13px] font-medium" :class="tone.text">
        {{ t('View records') }}
        <LucideIcon name="arrow-right" class="h-3.5 w-3.5" />
      </span>
    </div>
    <router-link
      :to="{ name: 'DoctypeNew', params: { doctypeRoute: item.route } }"
      :aria-label="t('New {0}', [t(item.label)])"
      class="relative z-10 inline-flex h-8 flex-shrink-0 items-center gap-1 rounded-lg px-2.5 text-xs font-semibold text-white transition sm:px-3"
      :class="tone.button"
    >
      <LucideIcon name="plus" class="h-3.5 w-3.5" />
      <span class="hidden sm:inline">{{ t('New') }}</span>
    </router-link>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import LucideIcon from '@/components/LucideIcon.vue'
import Skeleton from '@/components/Skeleton.vue'
import * as ui from '@/data/ui'
import { t } from '@/data/i18n'

const props = defineProps({
  // { doctype_name, label, route } from chw.api.get_home_layout
  item: { type: Object, required: true },
  icon: { type: String, default: 'file-text' },
  toneKey: { type: String, default: 'mch' },
  count: { type: Number, default: null },
  loading: { type: Boolean, default: false },
})

const tone = computed(() => ui.programmeTone(props.toneKey))
</script>

<template>
  <!-- Home / Household profile / HH-00027 / Family members - every part
  but the last is a link back up. Scrolls sideways on a narrow phone rather
  than wrapping into several lines. -->
  <nav aria-label="Breadcrumb" class="-mx-1 overflow-x-auto px-1">
    <ol class="flex min-w-max items-center gap-1.5 text-sm text-gray-500 dark:text-gray-400">
      <li v-for="(crumb, index) in crumbs" :key="index" class="flex items-center gap-1.5">
        <LucideIcon v-if="index > 0" name="chevron-right" class="h-3.5 w-3.5 flex-shrink-0 text-gray-300 dark:text-gray-600" />
        <router-link
          v-if="crumb.to && index < crumbs.length - 1"
          :to="crumb.to"
          class="flex items-center gap-1 whitespace-nowrap rounded hover:text-forest-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-forest-400 dark:hover:text-forest-300"
          :aria-label="crumb.home ? 'Home' : undefined"
        >
          <LucideIcon v-if="crumb.home" name="house" class="h-4 w-4" />
          <template v-else>{{ crumb.label }}</template>
        </router-link>
        <span v-else class="whitespace-nowrap font-medium text-navy-900 dark:text-gray-100" aria-current="page">
          {{ crumb.label }}
        </span>
      </li>
    </ol>
  </nav>
</template>

<script setup>
import LucideIcon from '@/components/LucideIcon.vue'

defineProps({
  // [{ label, to?, home? }] - see data/breadcrumbs.js.
  crumbs: { type: Array, required: true },
})
</script>

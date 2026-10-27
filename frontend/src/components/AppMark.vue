<template>
  <!-- The app's mark in the sidebar / phone header: a community health
  worker's "caring hand" icon on a green tile, in place of the logo image. -->
  <span
    class="flex h-full w-full items-center justify-center rounded-lg bg-forest-700 text-white dark:bg-forest-600"
    aria-hidden="true"
  >
    <LucideIcon name="hand-heart" class="h-[60%] w-[60%]" />
  </span>
</template>

<script setup>
import LucideIcon from '@/components/LucideIcon.vue'
</script>

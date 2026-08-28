<template>
  <FrappeUIProvider>
    <router-view />
  </FrappeUIProvider>
</template>

<script setup>
import { FrappeUIProvider } from 'frappe-ui'
import '@/data/session'
import '@/data/theme'
</script>

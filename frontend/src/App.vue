<template>
  <FrappeUIProvider>
    <router-view v-slot="{ Component, route }">
      <!-- DoctypeList/DoctypeForm/EmailAccountForm reuse the same component
      instance when only a route param changes (different doctypeRoute or
      name, same route record) - Vue Router's default behavior. Their data
      loading (useMeta/useDoc/useNewDoc) runs once at setup and isn't wired
      to react to those params changing, so without a fresh mount per
      param value, navigating from one doctype/record to another via the
      sidebar silently kept showing the previous one until a hard refresh
      forced a real remount. Keying only these routes (not every route)
      keeps Home/Dashboard/Worklist - which have no such params - from
      remounting their shell on every navigation for no reason. -->
      <component
        :is="Component"
        :key="route.meta.remountOnParamChange ? route.fullPath : route.name"
      />
    </router-view>
    <PwaUpdatePrompt />
  </FrappeUIProvider>
</template>

<script setup>
import { watch } from 'vue'
import { FrappeUIProvider } from 'frappe-ui'
import '@/data/session'
import '@/data/theme'
import { brandingResource } from '@/data/branding'
import PwaUpdatePrompt from '@/components/PwaUpdatePrompt.vue'

// The browser tab icon should match whatever logo is actually configured
// in App Settings (app_logo, editable by an admin at any time) rather than
// a static file baked in at build time. index.html ships a default
// favicon.png as a fallback for the moment before this resolves (and for
// sites that haven't set a logo at all).
watch(
  () => brandingResource.data?.app_logo,
  (logo) => {
    if (!logo) return
    const link = document.getElementById('app-favicon')
    if (link) link.href = logo
  },
  { immediate: true },
)
</script>

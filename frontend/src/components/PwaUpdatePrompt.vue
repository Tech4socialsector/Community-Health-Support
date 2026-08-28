<template>
  <!-- No template - this only registers the service worker and surfaces
  update/offline-ready state via toast. Kept as a component (mounted once
  in App.vue) rather than a bare side-effect module so it participates in
  Vue's lifecycle the same way the rest of this app's singletons do. -->
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { toast } from 'frappe-ui'

// virtual:pwa-register bakes its service-worker URL as `buildBase + filename`
// (vite-plugin-pwa always couples the two - there's no option to separate
// them), which resolves to /assets/chw/frontend/sw.js. A service worker can
// only control paths at-or-below wherever it's served from, so registering
// it there would cap its scope to /assets/chw/frontend/ - useless for an app
// that lives at /chw/. chw.website.sw_renderer.ServiceWorkerRenderer serves
// the same built file at /chw/sw.js instead, so Workbox is driven directly
// here (bypassing virtual:pwa-register) with that URL hardcoded.
const needRefresh = ref(false)
const updateServiceWorker = ref(() => {})

onMounted(async () => {
  if (!('serviceWorker' in navigator)) return

  const { Workbox } = await import('workbox-window')
  const wb = new Workbox('/chw/sw.js', { scope: '/chw/' })

  let refreshPromptShown = false
  const showRefreshPrompt = () => {
    refreshPromptShown = true
    wb.addEventListener('controlling', () => window.location.reload())
    toast.info('A new version of the app is available.', {
      duration: 0,
      action: {
        label: 'Refresh',
        onClick: () => updateServiceWorker.value(),
      },
    })
  }

  wb.addEventListener('installed', (event) => {
    if (event.isUpdate || event.isExternal) {
      showRefreshPrompt()
    } else {
      toast.success('The app is ready to work offline.')
    }
  })
  wb.addEventListener('waiting', () => {
    if (!refreshPromptShown) showRefreshPrompt()
  })

  updateServiceWorker.value = () => wb.messageSkipWaiting()

  wb.register().catch((error) => {
    // Non-fatal - the app still works online exactly as before, it just
    // won't be installable/offline-capable until the SW registers
    // successfully on a later visit. Not worth alarming the user over.
    console.error('Service worker registration failed', error)
  })
})
</script>

import path from 'path'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import frappeui from 'frappe-ui/vite'
import Components from 'unplugin-vue-components/vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    frappeui({
      frontendRoute: '/chw',
    }),
    vue(),
    Components({
      dirs: ['src/components', 'src/pages'],
      dts: false,
    }),
    VitePWA({
      // No `base` override here - the built sw.js/manifest/icons physically
      // live wherever Vite's own build.base resolves to (set dynamically by
      // frappeui() above to /assets/chw/frontend/, matching every other
      // built asset - see chw.html), and the plugin needs to match that to
      // serve its own files correctly. `scope`/`start_url` below are a
      // separate concern - that's the actual app route the service worker
      // is allowed to control, which is /chw/ regardless of where its files
      // are physically hosted.
      scope: '/chw/',
      // "prompt" (not "autoUpdate") so a CHW mid-form-entry never has the
      // app silently swapped out from under them - PwaUpdatePrompt.vue
      // below asks first, via the same confirm-before-reload pattern the
      // rest of this app uses for destructive actions.
      registerType: 'prompt',
      // Registered explicitly from PwaUpdatePrompt.vue via
      // virtual:pwa-register/vue instead, so "a new version is available"
      // can show an actual in-app prompt rather than injectRegister's bare
      // navigator.serviceWorker.register() with no UI hook.
      injectRegister: false,
      includeAssets: ['favicon.png', 'apple-touch-icon-180x180.png'],
      manifest: {
        id: '/chw/',
        name: 'CHW',
        short_name: 'CHW',
        description: 'Community health worker data capture and follow-up tracking.',
        start_url: '/chw/',
        scope: '/chw/',
        display: 'standalone',
        background_color: '#ffffff',
        theme_color: '#111827',
        icons: [
          { src: 'pwa-64x64.png', sizes: '64x64', type: 'image/png' },
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          {
            src: 'maskable-icon-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        // Only the app shell (JS/CSS/HTML/icons Vite actually built) is
        // precached - API responses are deliberately never cached here, so
        // a CHW never sees stale patient/visit data while offline; they'll
        // just get a clear network-error state from the app itself instead.
        globPatterns: ['**/*.{js,css,png,svg,ico}'],
        // navigateFallback: null, not just omitted - vite-plugin-pwa
        // defaults this to 'index.html' when unset, and Workbox's
        // navigateFallback only works against an entry that's actually in
        // the precache manifest (createHandlerBoundToURL throws
        // "non-precached-url" otherwise, immediately on SW activation - not
        // lazily on first use). Neither 'index.html' nor '/chw' can ever be
        // glob-precached: Frappe serves a Jinja-templated chw.html (with a
        // per-request CSRF token) for every /chw/* route, not a static
        // build file. The runtimeCaching rule below is the actual
        // offline-shell mechanism instead: it caches /chw the first time
        // it's visited online, and serves that cached copy on later
        // requests if the network fails - no precache entry required.
        // (workbox-build's schema only accepts null or a string here -
        // false fails validation even though the SW template's own check
        // would have treated it the same as null.)
        navigateFallback: null,
        runtimeCaching: [
          {
            urlPattern: ({ url, request }) =>
              request.mode === 'navigate' && url.pathname.startsWith('/chw'),
            handler: 'NetworkFirst',
            options: {
              cacheName: 'chw-app-shell',
              networkTimeoutSeconds: 5,
              expiration: { maxEntries: 5 },
            },
          },
        ],
      },
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
})

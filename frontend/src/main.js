// First, before anything can make a request - see the file.
import './data/offline/install'
import './index.css'
import { createApp } from 'vue'
import App from './App.vue'
import router from './router'
import { installServerMessages } from './data/serverMessages'
import { t, initLanguage } from './data/i18n'

// Show the last-used language from the phone at once (also offline), before
// the user's details arrive from the server.
initLanguage(null)

// Server msgprint()s after saves / calls, as Desk shows them.
installServerMessages()

// A browser can restore this page from bfcache on Back/Forward instead of
// re-running the app - that would show whatever was in memory (including a
// logged-in view) without re-checking the server session at all. Forcing a
// real reload on a bfcache restore makes the router guard re-run against
// the server's actual (possibly now logged-out) session.
window.addEventListener('pageshow', (event) => {
  if (event.persisted) {
    window.location.reload()
  }
})

let app = createApp(App)

// t() in every template without importing it: {{ t('Save') }}. Reactive -
// switching language re-renders the screens.
app.config.globalProperties.t = t

app.use(router)
app.mount('#app')

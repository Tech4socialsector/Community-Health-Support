import { createRouter, createWebHistory, START_LOCATION } from 'vue-router'
import { session, initialUserCheck, userResource } from '@/data/session'
import { modulesResource, findModuleByRoute } from '@/data/modules'
import { setActiveModule } from '@/data/activeModule'

const routes = [
  {
    path: '/login',
    name: 'Login',
    component: () => import('@/pages/Login.vue'),
  },
  {
    path: '/',
    redirect: '/home',
  },
  {
    path: '/home',
    name: 'Home',
    component: () => import('@/pages/Home.vue'),
  },
  {
    path: '/dashboard',
    name: 'Dashboard',
    component: () => import('@/pages/Dashboard.vue'),
  },
  {
    path: '/worklist',
    name: 'Worklist',
    component: () => import('@/pages/Worklist.vue'),
  },
  {
    path: '/email-accounts',
    name: 'EmailAccountList',
    component: () => import('@/pages/EmailAccountList.vue'),
  },
  {
    path: '/email-accounts/new',
    name: 'EmailAccountNew',
    component: () => import('@/pages/EmailAccountForm.vue'),
    props: { isNew: true },
  },
  {
    path: '/email-accounts/:name',
    name: 'EmailAccountForm',
    component: () => import('@/pages/EmailAccountForm.vue'),
    props: (route) => ({ name: route.params.name }),
    meta: { remountOnParamChange: true },
  },
  {
    path: '/:doctypeRoute',
    name: 'DoctypeList',
    component: () => import('@/pages/DoctypeList.vue'),
    props: (route) => ({ doctype: route.meta.resolvedDoctype }),
    meta: { remountOnParamChange: true },
  },
  {
    path: '/:doctypeRoute/new',
    name: 'DoctypeNew',
    component: () => import('@/pages/DoctypeForm.vue'),
    props: (route) => ({ doctype: route.meta.resolvedDoctype, isNew: true }),
    meta: { remountOnParamChange: true },
  },
  {
    path: '/:doctypeRoute/:name',
    name: 'DoctypeForm',
    component: () => import('@/pages/DoctypeForm.vue'),
    props: (route) => ({ doctype: route.meta.resolvedDoctype, name: route.params.name }),
    meta: { remountOnParamChange: true },
  },
]

let router = createRouter({
  history: createWebHistory('/chw'),
  routes,
})

// Browser Back/Forward (and other in-SPA navigations) never re-check the
// server session on their own - Vue Router just swaps the client-side
// route from cached history state. If the session died server-side (logged
// out in another tab, expired, revoked) while session.user is still
// stale-truthy in memory, beforeEach's own !session.user check below would
// wave the navigation through onto fully-authenticated-looking UI with a
// dead session underneath it.
//
// Awaiting a fresh frappe.auth.get_logged_user call before every single
// in-app navigation (as an earlier version of this did) makes each round
// trip's latency part of every click's critical path - fine on localhost,
// but a real network hop away (e.g. Frappe Cloud) that's enough to make the
// sidebar feel broken, since nothing renders until it resolves. Instead,
// re-validate only when it can actually have changed: when the tab regains
// focus after being hidden (the moment a session could have died
// elsewhere) or after being idle a while, and do it in the background
// rather than blocking the navigation that triggered it - a session that
// really did die gets caught on the very next guard check a moment later,
// without taxing the common case.
const REVALIDATE_INTERVAL_MS = 60_000
let lastCheckedAt = 0

async function recheckAuthIfStale() {
  const now = Date.now()
  if (now - lastCheckedAt < REVALIDATE_INTERVAL_MS) return
  lastCheckedAt = now
  await userResource.fetch().catch(() => {})
}

if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      lastCheckedAt = 0
      userResource.fetch().catch(() => {})
    }
  })
}

// modulesResource requires an authenticated session (it 403s as Guest), and
// this router module loads before login happens - so it must not fetch until
// we know session.user is set, and must actually fetch (not just wait on a
// promise from some earlier, possibly pre-login, call).
let modulesFetch = null
async function ensureModulesLoaded() {
  if (modulesResource.data) return
  if (!modulesFetch) {
    modulesFetch = modulesResource.fetch()
  }
  await modulesFetch.catch(() => {})
}

router.beforeEach(async (to, from, next) => {
  if (from === START_LOCATION) {
    // On the app's very first navigation, session.user isn't known yet -
    // it's only set once the initial frappe.auth.get_logged_user call
    // resolves. Awaiting that here (a no-op after it's settled) avoids
    // treating "not checked yet" as "logged out" and bouncing a real
    // session to /login.
    await initialUserCheck.catch(() => {})
  } else {
    await recheckAuthIfStale()
  }

  if (to.name !== 'Login' && !session.user) {
    next({ name: 'Login', query: { redirect: to.fullPath } })
    return
  }
  if (to.name === 'Login' && session.user) {
    next({ name: 'Home' })
    return
  }

  if (session.user) {
    await ensureModulesLoaded()
  }

  if (to.params.doctypeRoute) {
    const item = findModuleByRoute(to.params.doctypeRoute)
    if (!item) {
      next({ name: 'Home' })
      return
    }
    to.meta.resolvedDoctype = item.doctype_name
    // Keep the sidebar's module section in sync while browsing that
    // module's list/form pages, so it persists across navigation there.
    setActiveModule(item.module)
  }

  next()
})

export default router

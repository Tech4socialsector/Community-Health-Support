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
  },
  {
    path: '/:doctypeRoute',
    name: 'DoctypeList',
    component: () => import('@/pages/DoctypeList.vue'),
    props: (route) => ({ doctype: route.meta.resolvedDoctype }),
  },
  {
    path: '/:doctypeRoute/new',
    name: 'DoctypeNew',
    component: () => import('@/pages/DoctypeForm.vue'),
    props: (route) => ({ doctype: route.meta.resolvedDoctype, isNew: true }),
  },
  {
    path: '/:doctypeRoute/:name',
    name: 'DoctypeForm',
    component: () => import('@/pages/DoctypeForm.vue'),
    props: (route) => ({ doctype: route.meta.resolvedDoctype, name: route.params.name }),
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
// dead session underneath it. frappe.auth.get_logged_user is a cheap,
// single whitelisted call, so re-validating on every navigation (rather
// than trying to detect "this one is a Back/Forward" or throttling by time,
// both of which leave a real logged-out-elsewhere window unguarded) is the
// only version of this check that's actually reliable.
async function recheckAuth() {
  await userResource.fetch().catch(() => {})
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
    // session to /login. Every subsequent navigation re-checks fresh
    // instead (see recheckAuth) - re-fetching here too would just be the
    // same request fired twice back to back.
    await initialUserCheck.catch(() => {})
  } else {
    await recheckAuth()
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

import { ref } from 'vue'

// The current page's title, shown in the top navbar. Pages set this
// themselves (static pages set it once; DoctypeList/DoctypeForm update it
// once their resolved doctype/record data is known).
export const pageTitle = ref('')

export function setPageTitle(title) {
  pageTitle.value = title
}

// A page's breadcrumb trail (Home / Household profile / HH-00027 / Family
// members), shown in the top navbar in place of the plain title - one
// header row instead of a navbar title plus a second crumb row under it.
// Tagged with the route path that set it, so the navbar ignores a trail
// left behind by the previous page whatever order pages mount/unmount in.
export const pageCrumbs = ref({ path: null, crumbs: null })

export function setPageCrumbs(path, crumbs) {
  pageCrumbs.value = { path, crumbs }
}

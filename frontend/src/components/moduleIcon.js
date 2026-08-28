import { h } from 'vue'
import LucideIcon from '@/components/LucideIcon.vue'

/**
 * Sidebar/SidebarHeader render `icon` via <component :is="icon" class="..." />
 * with no other props passed through - so an icon *name* (a runtime string
 * from the App Module Setting doctype, picked via Frappe's native Lucide
 * icon picker - see chw_master doctype JSONs) can't be used directly as
 * `icon`. This returns a bound component instance per name; Vue's default
 * attrs inheritance (this component doesn't opt out of it) already applies
 * whatever class the Sidebar passes onto LucideIcon's rendered root `<svg>`
 * on its own - passing it through explicitly here too just duplicated it.
 */
export default function moduleIcon(name) {
  return {
    render() {
      return h(LucideIcon, { name })
    },
  }
}

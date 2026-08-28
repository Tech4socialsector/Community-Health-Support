import { h } from 'vue'
import { FeatherIcon } from 'frappe-ui'

/**
 * Sidebar/SidebarHeader render `icon` via <component :is="icon" class="..." />
 * with no other props passed through - so a feather-icon *name* (a runtime
 * string from the App Module Setting doctype) can't be used directly as `icon`.
 * This returns a bound component instance per name, forwarding whatever
 * class the Sidebar applies onto the underlying FeatherIcon.
 */
export default function moduleIcon(name) {
  return {
    render(ctx) {
      return h(FeatherIcon, { name, class: ctx.$attrs.class })
    },
  }
}

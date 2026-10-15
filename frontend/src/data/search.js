import { ref } from 'vue'
import { useCall } from 'frappe-ui'

// Cross-DocType search over every DocType configured in the app's modules
// (chw.api.global_search). `query` drives the request params reactively, so
// updating it and calling fetch() re-runs the search against the new text.
export const searchQuery = ref('')

export const searchResource = useCall({
  url: '/api/v2/method/chw.api.global_search',
  method: 'GET',
  params: () => ({ txt: searchQuery.value }),
  immediate: false,
})

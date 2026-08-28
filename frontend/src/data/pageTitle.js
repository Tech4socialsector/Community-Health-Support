import { ref } from 'vue'

// The current page's title, shown in the top navbar. Pages set this
// themselves (static pages set it once; DoctypeList/DoctypeForm update it
// once their resolved doctype/record data is known).
export const pageTitle = ref('')

export function setPageTitle(title) {
  pageTitle.value = title
}

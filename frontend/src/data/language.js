import { createResource } from 'frappe-ui'
import { session } from '@/data/session'

export const languagesResource = createResource({
  url: 'frappe.client.get_list',
  params: {
    doctype: 'Language',
    filters: { enabled: 1 },
    fields: ['name', 'language_name'],
    order_by: 'language_name asc',
    limit_page_length: 0,
  },
  auto: true,
  transform: (data) => data.map((l) => ({ label: l.language_name, value: l.name })),
})

const setLanguageResource = createResource({
  url: 'frappe.client.set_value',
  makeParams: (language) => ({
    doctype: 'User',
    name: session.user,
    fieldname: 'language',
    value: language,
  }),
  onSuccess() {
    window.location.reload()
  },
})

export function setUserLanguage(language) {
  return setLanguageResource.submit(language)
}

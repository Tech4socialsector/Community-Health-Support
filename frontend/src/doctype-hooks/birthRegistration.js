// Ports chw/mch/doctype/birth_registration/birth_registration.js (the Desk
// form script) into the Vue app's hook contract - see doctype-hooks/index.js
// and DoctypeForm.vue. The health worker default is handled for every form
// by DoctypeForm itself.

import { warnIfNotDigits } from './utils'

export default {
  onFieldChange(fieldname, values) {
    if (fieldname === 'phone_number') warnIfNotDigits(values.phone_number)
  },
}

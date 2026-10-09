// Ports chw/common/doctype/household_profile/household_profile.js (the Desk
// form script) into the Vue app's hook contract - see doctype-hooks/index.js
// and DoctypeForm.vue.
// Desk's geo_location handler is not ported: the doctype has no such field.

import { warnIfNotDigits } from './utils'

export default {
  onFieldChange(fieldname, values) {
    if (fieldname === 'phone_no') warnIfNotDigits(values.phone_no)
  },
}

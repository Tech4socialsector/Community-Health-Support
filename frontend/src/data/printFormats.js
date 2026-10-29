// Maps a CHW doctype to the Print Format record its "Print" button (see
// PrintPreviewDialog.vue, wired in from DoctypeForm.vue) should render.
// A doctype not listed here simply gets no Print button - not every form
// has had its print format built yet.
export const PRINT_FORMATS = {
  'Household profile': 'Household Profile Print',
  'ANC Follow-up': 'ANC Follow-up Print',
  'Birth Registration': 'Birth Registration Print',
  'Child 6w to 1 Year Reg and Followup': 'Child 6w-1y Print',
  'Child Growth Monitoring': 'Child Growth Monitoring Print',
  'Family members': 'Family Members Print',
  'MCH Volunteer Intake Form Postpartum': 'MCH Postpartum Intake Print',
  'Mental Health': 'Mental Health Print',
  'NCD': 'NCD Print',
  'Palliative care followup': 'Palliative Care Followup Print',
  'Palliative Care Initial Assessment Form': 'Palliative Care Initial Assessment Print',
  'PNC': 'PNC Print',
  'Postpartum Reg and Followup': 'Postpartum Print',
  'Preconception Reg and Followup': 'Preconception Print',
  'Pregnancy Registration': 'Pregnancy Registration Print',
}

export function printFormatFor(doctype) {
  return PRINT_FORMATS[doctype] || null
}

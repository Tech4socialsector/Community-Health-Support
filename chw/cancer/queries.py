"""Link-field search queries for the Cancer forms (Desk set_query and the
Vue app's getLinkQuery both point here)."""

import frappe
from frappe.desk.reportview import get_match_cond

from chw.cancer.doctype.main_screening_form.main_screening_form import referred_condition


@frappe.whitelist()
@frappe.validate_and_sanitize_search_inputs
def referred_screenings(doctype, txt, searchfield, start, page_len, filters):
	"""Clinical Evaluation's Main Screening Form: only people referred - at
	least one screening (Oral, Breast or Cervical) finished with Referral =
	Yes. Searches the ID, name and mobile number; the user's own read
	permissions apply (get_match_cond)."""
	return frappe.db.sql(
		f"""select name, name1, mobile_number
		from `tabMain Screening Form`
		where {referred_condition()}
			and (name like %(txt)s or name1 like %(txt)s or mobile_number like %(txt)s)
			{get_match_cond("Main Screening Form")}
		order by modified desc
		limit %(page_len)s offset %(start)s""",
		{"txt": f"%{txt}%", "start": start, "page_len": page_len},
	)

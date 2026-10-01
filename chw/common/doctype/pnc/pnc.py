# Copyright (c) 2026, tech4socialsector@azimpremjifoundation.org and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import add_days, getdate
from chw.api import sync_next_visit_todo, validate_phone_number

# Last-resort fallback only, used if the PNC Visit Interval Master hasn't
# been configured yet - the real policy always comes from that master's
# Visit Schedule rows. (window_opens_day, window_closes_day) per visit,
# 1-indexed by position - visit 1 opens at delivery, visit 2 is the last
# week of a 6-week (42-day) postnatal period.
DEFAULT_VISIT_SCHEDULE = [(0, 7), (35, 42)]
DEFAULT_RISK_ALERT_DAYS = 1

# Safe margin past the default ~6-week (42-day) postnatal period, used only
# by the exit-women-pnc report cutoff (chw.api.pnc_fully_completed_names) to
# decide a record's postnatal window has fully elapsed.
PNC_SCHEDULE_DURATION_MONTHS = 2


@frappe.whitelist()
def get_visit_schedule():
	"""The master's Visit Schedule rows, for pnc.js's live preview. A child
	table (PNC Visit Schedule Row) has no permission rules of its own -
	only the parent Single does - so the client can't reliably list it
	directly via frappe.db.get_list; fetching through the parent doc here
	goes through normal, already-granted permission checks instead."""
	master = frappe.get_single("PNC Visit Interval Master")
	return [
		{
			"window_opens_day": row.window_opens_day,
			"window_closes_day": row.window_closes_day,
			"risk_alert_within_days": row.risk_alert_within_days,
		}
		for row in master.visit_schedule
	]


class PNC(Document):
	def validate(self):
		validate_phone_number(self.phone_number)
		self.validate_gender()
		self.sync_patient_condition_to_high_risk()
		self.insert_urgent_followups_for_risk_rows()
		self.insert_urgent_followups_for_baby_risk_rows()
		self.set_next_pnc_visit_date()

	def on_update(self):
		sync_next_visit_todo(
			self,
			"next_pnc_visit_date",
			f"PNC follow-up visit due for {self.first_name} (Baby: {self.name_of_child})",
		)

	def validate_gender(self):
		if not self.birth_registration_id:
			return

		family_member_id = frappe.db.get_value(
			"Birth Registration", self.birth_registration_id, "family_member_id"
		)
		gender = family_member_id and frappe.db.get_value("Family members", family_member_id, "gender")
		if gender and gender != "Female":
			frappe.throw(_("PNC can only be created for a female family member."))

	def sync_patient_condition_to_high_risk(self):
		# The only way high_risk ever gets set - there's no manual entry
		# point on the main form. Either the mother's own Patient Condition
		# OR the baby's own Baby Condition can independently push this to
		# Yes - a household visit can find either one at risk. A later
		# "Normal" reading on either table never downgrades it back on its
		# own.
		mother_risk = self._latest_condition(self.mother, "patient_condition") == "Risk"
		baby_risk = self._latest_condition(self.baby, "baby_condition") == "Risk"
		if mother_risk or baby_risk:
			self.high_risk = "Yes"

	@staticmethod
	def _latest_condition(table, fieldname):
		rows_with_condition = [row for row in table if row.get(fieldname)]
		if not rows_with_condition:
			return None
		return rows_with_condition[-1].get(fieldname)

	def insert_urgent_followups_for_risk_rows(self):
		self._insert_urgent_followups("mother", "patient_condition")

	def insert_urgent_followups_for_baby_risk_rows(self):
		self._insert_urgent_followups("baby", "baby_condition")

	def _insert_urgent_followups(self, table_field, condition_field):
		# Whenever a visit is Completed with its condition field = Risk, an
		# earlier follow-up than the normal schedule is needed - insert it
		# right after that row (not appended at the end), dated from that
		# visit's own actual date + *that visit's own* Urgent Visit Within
		# Days (not a fixed number, not a chain - each schedule row sets its
		# own duration, found by counting how many visits are completed up
		# to and including this one). Skipped if the next row already
		# sitting there is close enough that a separate visit wouldn't add
		# anything, and never inserted twice for the same trigger. Mother
		# and baby run through this independently - a risk finding on one
		# table only ever inserts into that same table.
		table = self.get(table_field)
		i = 0
		while i < len(table):
			row = table[i]
			if row.status == "Completed" and row.get(condition_field) == "Risk":
				next_row = table[i + 1] if i + 1 < len(table) else None
				already_inserted = next_row and next_row.urgent_followup
				if not already_inserted:
					effective_visit_number = len([r for r in table[: i + 1] if r.status == "Completed"])
					urgent_within_days = self.get_urgent_visit_within_days(effective_visit_number)
					urgent_date = add_days(getdate(row.date), urgent_within_days)
					next_row_too_soon = next_row and getdate(next_row.date) <= urgent_date
					if not next_row_too_soon:
						new_row = self.append(table_field, {})
						new_row.window_start_date = row.date
						new_row.date = urgent_date
						new_row.status = "Pending"
						new_row.urgent_followup = 1
						table.remove(new_row)
						table.insert(i + 1, new_row)
						for idx, r in enumerate(table):
							r.idx = idx + 1
			i += 1

	@staticmethod
	def _pending_urgent_in(table):
		urgent_rows = [
			(i, row) for i, row in enumerate(table)
			if row.urgent_followup and row.status != "Completed"
		]
		if not urgent_rows:
			return None

		i, earliest = min(urgent_rows, key=lambda pair: getdate(pair[1].date))
		trigger_row = table[i - 1] if i > 0 else None
		trigger_date = getdate(trigger_row.date) if trigger_row else getdate(earliest.date)
		return frappe._dict(date=getdate(earliest.date), trigger_date=trigger_date)

	@staticmethod
	def get_urgent_visit_within_days(visit_number):
		"""The schedule row matching visit_number's own Urgent Visit Within
		Days - clamped to the last configured row if visit_number runs past
		however many rows exist, so a risk finding beyond the configured
		schedule still gets a sensible duration instead of failing."""
		master = frappe.get_single("PNC Visit Interval Master")
		rows = master.visit_schedule
		if not rows:
			return DEFAULT_RISK_ALERT_DAYS
		index = max(min(visit_number, len(rows)) - 1, 0)
		return rows[index].urgent_visit_within_days or DEFAULT_RISK_ALERT_DAYS

	def set_next_pnc_visit_date(self):
		# Mother and baby are tracked independently - each gets its own
		# effective next-visit date (an open urgent row if either table has
		# one, otherwise the normal schedule lookup) - but they share the
		# exact same Visit Schedule master, since both are checked on the
		# same household visit. The single shared "Next PNC Visit Date"
		# field always shows whichever of the two tracks is due sooner.
		if not self.date_of_delivery:
			return

		delivery_date = getdate(self.date_of_delivery)
		mother_track = self._compute_track(self.mother, delivery_date)
		baby_track = self._compute_track(self.baby, delivery_date)

		self.sync_mother_row_fields(mother_track.window_start, mother_track.window_end)
		self.sync_baby_row_fields(baby_track.window_start, baby_track.window_end)

		candidates = [t for t in (mother_track, baby_track) if t.next_date]
		if not candidates:
			# every scheduled visit, for both mother and baby, is complete
			self.next_pnc_visit_date = None
			self.next_pnc_visit_date_auto = None
			self.pnc_visit_risk_alert = ""
			return

		# An open urgent row on EITHER track always outranks an ordinary due
		# date on the other, even if that ordinary date is sooner - a freshly
		# flagged risk should never get buried behind a merely overdue
		# routine visit. Only once neither track has an open urgent row does
		# "whichever is due sooner" decide it.
		urgent_candidates = [t for t in candidates if t.is_urgent]
		winner = min(urgent_candidates or candidates, key=lambda t: t.next_date)
		self.next_pnc_visit_date = winner.next_date
		self.next_pnc_visit_date_auto = winner.next_date
		self.pnc_visit_risk_alert = winner.risk_alert

	def _compute_track(self, table, delivery_date):
		# An open Urgent-tagged row on this table always wins first - it
		# never gets masked by the normal schedule lookup. The urgent date
		# itself already IS the early-visit signal, so no separate alert on
		# top of it.
		urgent = self._pending_urgent_in(table)
		if urgent:
			return frappe._dict(
				next_date=urgent.date, window_start=urgent.trigger_date, window_end=urgent.date, risk_alert="",
				is_urgent=True,
			)

		visit_number = len([row for row in table if row.status == "Completed"]) + 1
		window = self.get_visit_window(visit_number)
		if window is None:
			# every visit on this table has been completed
			return frappe._dict(next_date=None, window_start=None, window_end=None, risk_alert="", is_urgent=False)

		window_start = add_days(delivery_date, window.start_offset)
		window_end = add_days(delivery_date, window.end_offset)

		# High Risk only, shown in red - a nudge to visit early within the
		# window (from window_start, not window_end - the point is to go
		# sooner, not to wait until the window is about to close). Blank
		# otherwise; the window/due date above are unaffected either way.
		high_risk = self.high_risk or "No"
		risk_alert = (
			"Visit by {0}".format(frappe.utils.formatdate(add_days(window_start, window.risk_alert_within_days)))
			if high_risk == "Yes"
			else ""
		)
		return frappe._dict(
			next_date=window_end, window_start=window_start, window_end=window_end, risk_alert=risk_alert,
			is_urgent=False,
		)

	def sync_mother_row_fields(self, window_start, window_end):
		self._sync_row_fields(self.mother, window_start, window_end)

	def sync_baby_row_fields(self, window_start, window_end):
		self._sync_row_fields(self.baby, window_start, window_end)

	@staticmethod
	def _sync_row_fields(table, window_start, window_end):
		# "Date of Next Visit" is auto-filled on the latest row only.
		# "Next Visit Window" is a plain read-only range shown on every row.
		if window_start and window_end:
			display = "{0} to {1}".format(frappe.utils.formatdate(window_start), frappe.utils.formatdate(window_end))
			if table:
				table[-1].date_of_next_visit = window_end
		else:
			display = ""

		for row in table:
			row.next_visit_window = display

	@staticmethod
	def get_visit_window(visit_number):
		"""visit_number is 1-indexed, matching row position in the master's
		Visit Schedule table - row 1 is visit 1, row 2 is visit 2, and so on.
		Returns None once visit_number exceeds however many rows exist -
		there's no fixed cap, the row count *is* the cap."""
		master = frappe.get_single("PNC Visit Interval Master")
		rows = master.visit_schedule

		if rows:
			if visit_number < 1 or visit_number > len(rows):
				return None
			row = rows[visit_number - 1]
			return frappe._dict(
				start_offset=row.window_opens_day,
				end_offset=row.window_closes_day,
				risk_alert_within_days=row.risk_alert_within_days or DEFAULT_RISK_ALERT_DAYS,
			)

		if visit_number < 1 or visit_number > len(DEFAULT_VISIT_SCHEDULE):
			return None
		start_offset, end_offset = DEFAULT_VISIT_SCHEDULE[visit_number - 1]
		return frappe._dict(
			start_offset=start_offset,
			end_offset=end_offset,
			risk_alert_within_days=DEFAULT_RISK_ALERT_DAYS,
		)

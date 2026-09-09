# Copyright (c) 2026, tech4socialsector@azimpremjifoundation.org and contributors
# For license information, please see license.txt

import json

import frappe
from frappe.model.document import Document
from chw.api import validate_phone_number


class Householdprofile(Document):
	def validate(self):
		validate_phone_number(self.phone_no)
		self.update_member_counts()
		self.sync_lat_lng_from_geo_location()

	def update_member_counts(self):
		self.members_added = frappe.db.count("Family members", {"hhid": self.name}) if self.name else 0
		self.pending_members = max((self.total_family_members or 0) - self.members_added, 0)

	def sync_lat_lng_from_geo_location(self):
		# latitude/longitude are read-only display mirrors of geo_location (the
		# map) - kept as plain Floats so list views/reports can filter and sort
		# on them without parsing GeoJSON. Derived here instead of asking users
		# to enter coordinates twice (once on the map, once by hand).
		coords = None
		if self.geo_location:
			try:
				geojson = json.loads(self.geo_location)
				coords = geojson["features"][0]["geometry"]["coordinates"]
			except (ValueError, KeyError, IndexError, TypeError):
				coords = None

		if coords and len(coords) >= 2:
			self.longitude, self.latitude = coords[0], coords[1]
		else:
			self.latitude, self.longitude = None, None


def refresh_member_counts(hhid):
	if not hhid or not frappe.db.exists("Household profile", hhid):
		return

	members_added = frappe.db.count("Family members", {"hhid": hhid})
	total_family_members = frappe.db.get_value("Household profile", hhid, "total_family_members") or 0
	pending_members = max(total_family_members - members_added, 0)

	frappe.db.set_value(
		"Household profile",
		hhid,
		{"members_added": members_added, "pending_members": pending_members},
		update_modified=False,
	)

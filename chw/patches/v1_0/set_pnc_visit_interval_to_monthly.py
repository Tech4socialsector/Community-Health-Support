def execute():
	"""No-op - superseded by the later row-based Visit Schedule redesign
	(see seed_pnc_visit_interval_rows.py), which replaced the single
	`interval_days` field this patch used to write to. Kept as a no-op
	rather than removed from patches.txt, since it already ran and is
	logged on existing sites; a fresh site just skips straight past it."""
	pass

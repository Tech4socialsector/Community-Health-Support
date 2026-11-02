def execute():
	"""No-op - PNC Visit Interval Master (the doctype this patch seeded) was
	removed once the Visit Schedule Master consolidation (see
	seed_visit_schedule_master.py, which runs after this one) made it dead.
	Kept as a no-op rather than removed from patches.txt, since it already
	ran and is logged on existing sites; a fresh site just skips straight
	past it."""
	pass

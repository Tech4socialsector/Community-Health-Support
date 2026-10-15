"""Auto-translate: fill a site's Translation list for one language in a click.

Every CHW label, option, section title and help text (3,000+ across the
forms) would otherwise have to be typed into Desk's Translation list one by
one, per language, per organization. This collects the CHW texts that have
no translation yet in the chosen language, machine-translates them in
batches, and saves each as a normal Translation record marked
contribution_status = "Pending" - so reviewers can filter on it, correct the
few medical terms that need it, and set it to "Verified".

Only the app's own words are sent for translation - never patient data.

Engine: the official Google Cloud Translation API when the site has a key
(`bench --site <site> set-config google_translate_api_key <key>`), else
Google's free public endpoint (no account, but unofficial - it can be slowed
or blocked, which adding a key fixes without any code change).
"""

import re

import frappe
import requests
from frappe import _
from frappe.translate import get_all_translations

# Text that isn't a word to translate: numbers, codes, expressions, markup.
_SKIP = re.compile(r"^[\d\s.,:/%+\-<>=()]*$")
_HTML = re.compile(r"<[^>]+>")
_FREE_BATCH_CHARS = 1800  # GET URL length limit for the free endpoint
_API_BATCH = 100  # strings per request for the official API


def _clean(text):
	text = _HTML.sub("", text or "").strip()
	return re.sub(r"\s+", " ", text)


def ui_strings():
	"""The Vue app's own screen texts (buttons, menus, messages): every t("...")
	in frontend/src, listed in frontend/src/locales/ui_strings.json by
	`node frontend/scripts/extract-ui-strings.mjs` (run on each build)."""
	import json
	import os

	path = os.path.join(frappe.get_app_path("chw"), "..", "frontend", "src", "locales", "ui_strings.json")
	try:
		with open(path, encoding="utf-8") as f:
			return {t for t in json.load(f) if isinstance(t, str) and t.strip()}
	except (OSError, ValueError):
		return set()


def collect_chw_texts():
	"""Every user-facing text of the CHW app's doctypes: names, field labels,
	help text, Select options and section titles, plus the app's module
	labels. HTML is stripped (a heading stored as "<h5>Cardiovascular</h5>"
	is shown as "Cardiovascular")."""
	modules = set(frappe.get_all("Module Def", filters={"app_name": "chw"}, pluck="name"))
	texts = set()
	for dt in frappe.get_all("DocType", filters={"module": ["in", list(modules)]}, pluck="name"):
		texts.add(dt)
		meta = frappe.get_meta(dt)
		for df in meta.fields:
			if df.label:
				texts.add(_clean(df.label))
			if df.description and "<" not in df.description:
				texts.add(_clean(df.description))
			if df.fieldtype == "Select" and df.options:
				texts.update(_clean(o) for o in df.options.split("\n"))
	if frappe.db.table_exists("App Module Setting"):
		for row in frappe.get_all("App Module Setting", fields=["module_name", "label"]):
			texts.update(filter(None, (row.module_name, row.label)))
	texts.update(ui_strings())
	return {
		t
		for t in texts
		if t and len(t) <= 500 and not _SKIP.match(t) and _braces_ok(t) and not t.startswith("eval:")
	}


_PLACEHOLDER = re.compile(r"\{\d+\}")


def _braces_ok(text):
	"""Only {0}-style placeholders ("Good morning, {0}") - any other brace is
	code or a template, not a sentence to translate."""
	return "{" not in _PLACEHOLDER.sub("", text) and "}" not in _PLACEHOLDER.sub("", text)


def _same_placeholders(source, target):
	return sorted(_PLACEHOLDER.findall(source)) == sorted(_PLACEHOLDER.findall(target))


def missing_texts(language):
	"""CHW texts with no translation yet in `language` - from the app files or
	this site's Translation list. Anything already translated or corrected
	by hand is left alone."""
	have = set(get_all_translations(language).keys())
	have.update(frappe.get_all("Translation", filters={"language": language}, pluck="source_text"))
	return sorted(t for t in collect_chw_texts() if t not in have)


def _translate_api(texts, language, key):
	out = []
	for i in range(0, len(texts), _API_BATCH):
		chunk = texts[i : i + _API_BATCH]
		r = requests.post(
			"https://translation.googleapis.com/language/translate/v2",
			params={"key": key},
			json={"q": chunk, "source": "en", "target": language, "format": "text"},
			timeout=60,
		)
		r.raise_for_status()
		out.extend(t["translatedText"] for t in r.json()["data"]["translations"])
	return out


def _free_request(text, language):
	r = requests.get(
		"https://translate.googleapis.com/translate_a/single",
		params={"client": "gtx", "sl": "en", "tl": language, "dt": "t", "q": text},
		timeout=30,
	)
	r.raise_for_status()
	return "".join(seg[0] for seg in r.json()[0] if seg and seg[0])


def _translate_free(texts, language):
	"""Lines are sent joined by newlines (one request per ~1,800 characters);
	if a reply doesn't come back with the same number of lines, that batch is
	redone one text at a time so nothing is matched to the wrong source."""
	out, batch, size = [], [], 0

	def flush():
		if not batch:
			return
		lines = _free_request("\n".join(batch), language).split("\n")
		if len(lines) == len(batch):
			out.extend(line.strip() for line in lines)
		else:
			out.extend(_free_request(t, language).strip() for t in batch)
		batch.clear()

	for t in texts:
		if size + len(t) + 1 > _FREE_BATCH_CHARS:
			flush()
			size = 0
		batch.append(t)
		size += len(t) + 1
	flush()
	return out


def _engine():
	key = frappe.conf.get("google_translate_api_key")
	return ("Google Cloud Translation", key) if key else ("Google (free endpoint)", None)


def _check_permission():
	if not frappe.has_permission("Translation", "create"):
		frappe.throw(_("Not permitted to create translations"), frappe.PermissionError)


def _check_language(language):
	if not language or not frappe.db.exists("Language", language):
		frappe.throw(_("Unknown language: {0}").format(language))
	if language == "en":
		frappe.throw(_("English is the source language - pick another language"))


# English names for the language list: Frappe stores each language's name
# in its own script (தமிழ், हिन्दी), so an admin searching "Tamil" found
# nothing. Indian languages first, then everything else by code.
ENGLISH_NAMES = {
	"hi": "Hindi",
	"mr": "Marathi",
	"ta": "Tamil",
	"te": "Telugu",
	"kn": "Kannada",
	"ml": "Malayalam",
	"bn": "Bengali",
	"gu": "Gujarati",
	"pa": "Punjabi",
	"or": "Odia",
	"as": "Assamese",
	"ur": "Urdu",
	"ne": "Nepali",
	"sa": "Sanskrit",
	"si": "Sinhala",
}

# Frappe ships no Language record for these, so they were left out of the
# app's Language menu although Google translates them. The record is made
# the first time someone picks one (see _ensure_language).
NATIVE_NAMES = {
	"pa": "ਪੰਜਾਬੀ",
	"or": "ଓଡ଼ିଆ",
	"as": "অসমীয়া",
	"ne": "नेपाली",
	"sa": "संस्कृतम्",
}


def _ensure_language(language):
	# Only the languages listed above - a made-up code would just give an
	# empty translation run.
	if frappe.db.exists("Language", language) or language not in NATIVE_NAMES:
		return
	frappe.get_doc(
		{
			"doctype": "Language",
			"language_code": language,
			"language_name": NATIVE_NAMES[language],
			"enabled": 1,
		}
	).insert(ignore_permissions=True)


@frappe.whitelist()
def get_language_options():
	"""[{value, label}] for the Auto-translate dialog: "Tamil - தமிழ் (ta)"."""
	_check_permission()
	rows = frappe.get_all("Language", fields=["name", "language_name"], filters={"name": ["!=", "en"]})

	def label(r):
		english = ENGLISH_NAMES.get(r.name)
		native = r.language_name or r.name
		return f"{english} - {native} ({r.name})" if english else f"{native} ({r.name})"

	rows.sort(
		key=lambda r: (r.name not in ENGLISH_NAMES, ENGLISH_NAMES.get(r.name, r.language_name or r.name))
	)
	return [{"value": r.name, "label": label(r)} for r in rows]


@frappe.whitelist()
def get_auto_translate_status(language):
	_check_permission()
	_check_language(language)
	return {
		"missing": len(missing_texts(language)),
		"total": len(collect_chw_texts()),
		"engine": _engine()[0],
	}


@frappe.whitelist()
def start_auto_translate(language):
	"""Queue the translation of every missing CHW text into `language`."""
	_check_permission()
	_ensure_language(language)
	_check_language(language)
	# Translating a language means the organization wants to use it: users
	# can only pick an enabled Language (and hi / mr / ta ship disabled).
	if not frappe.db.get_value("Language", language, "enabled"):
		frappe.db.set_value("Language", language, "enabled", 1)
	count = len(missing_texts(language))
	if count:
		frappe.enqueue(
			"chw.translation_tool.run_auto_translate",
			queue="long",
			timeout=3600,
			job_id=f"chw-auto-translate-{frappe.local.site}-{language}",
			deduplicate=True,
			language=language,
			user=frappe.session.user,
		)
	return {"queued": count, "engine": _engine()[0]}


def run_auto_translate(language, user=None):
	"""Background job: translate in batches, saving after each batch so a
	failure part-way keeps what's done (a re-run only does the rest)."""
	texts = missing_texts(language)
	engine, key = _engine()
	added = failed = 0
	step = 50
	for i in range(0, len(texts), step):
		chunk = texts[i : i + step]
		try:
			translated = _translate_api(chunk, language, key) if key else _translate_free(chunk, language)
		except Exception:
			frappe.log_error(frappe.get_traceback(), f"CHW auto-translate ({language}) failed")
			failed += len(chunk)
			continue
		for source, target in zip(chunk, translated, strict=False):
			target = (target or "").strip()
			# A translation that lost or changed a {0} would show a broken
			# sentence - leave that text in English instead.
			if not target or target == source or not _same_placeholders(source, target):
				continue
			doc = frappe.new_doc("Translation")
			doc.update(
				{
					"language": language,
					"source_text": source,
					"translated_text": target,
					"contribution_status": "Pending",
				}
			)
			doc.insert(ignore_permissions=True)
			added += 1
		frappe.db.commit()
		if user:
			frappe.publish_realtime(
				"chw_auto_translate_progress",
				{"language": language, "done": min(i + step, len(texts)), "total": len(texts)},
				user=user,
			)

	frappe.translate.clear_cache()
	summary = {"language": language, "added": added, "failed": failed, "total": len(texts), "engine": engine}
	if user:
		frappe.publish_realtime("chw_auto_translate_done", summary, user=user)
	return summary


# ---- Keeping up when forms change ----
# A field added or relabelled later (in a DocType, Customize Form, or by an
# app update) would otherwise stay in English until someone picked the
# language again. Every language people actually use gets the new texts
# translated in the background instead.


def languages_in_use():
	"""Non-English languages set on enabled users, plus the site default."""
	langs = set(
		frappe.get_all(
			"User",
			filters={"enabled": 1, "language": ["not in", ["", "en"]]},
			pluck="language",
			distinct=True,
		)
	)
	default = frappe.db.get_single_value("System Settings", "language")
	if default and default != "en":
		langs.add(default)
	return sorted(l for l in langs if l and frappe.db.exists("Language", l))


def translate_new_texts():
	"""Queue a translation run for each language in use that has untranslated
	CHW texts. Safe to call often: a language already being translated isn't
	queued twice, and nothing already translated is sent again."""
	frappe.cache.delete_value("chw_app_texts")
	for language in languages_in_use():
		if missing_texts(language):
			frappe.enqueue(
				"chw.translation_tool.run_auto_translate",
				queue="long",
				timeout=3600,
				job_id=f"chw-auto-translate-{frappe.local.site}-{language}",
				deduplicate=True,
				language=language,
			)


def on_form_change(doc, method=None):
	"""doc_events hook for DocType, Custom Field and Property Setter: when a
	CHW form's fields or labels change, translate the new texts. Runs after
	the save is committed, in the background - saving the form isn't slowed."""
	doctype = doc.name if doc.doctype == "DocType" else doc.get("dt") or doc.get("doc_type")
	module = frappe.db.get_value("DocType", doctype, "module") if doctype else None
	if not module or frappe.db.get_value("Module Def", module, "app_name") != "chw":
		return
	frappe.enqueue(
		"chw.translation_tool.translate_new_texts",
		queue="long",
		job_id=f"chw-translate-new-texts-{frappe.local.site}",
		deduplicate=True,
		enqueue_after_commit=True,
	)


# ---- Vue app: choose a language from the Home page ----


@frappe.whitelist()
def get_app_language_options():
	"""Languages offered in the app's Language menu: English, the Indian
	languages, and any other language this site already has translations
	for - each as "Tamil - தமிழ்"."""
	native = {
		**NATIVE_NAMES,
		**dict(frappe.get_all("Language", fields=["name", "language_name"], as_list=True)),
	}
	codes = ["en", *ENGLISH_NAMES.keys()]
	codes += sorted(set(frappe.get_all("Translation", distinct=True, pluck="language")) - set(codes))
	options = []
	for code in codes:
		if code not in native and code != "en":
			continue
		english = "English" if code == "en" else ENGLISH_NAMES.get(code)
		name = native.get(code) or code
		label = english if code == "en" else (f"{english} - {name}" if english else name)
		options.append({"value": code, "label": label})
	return options


def _app_texts_cached():
	# Cached for an hour: the list only changes when forms change (migrate)
	# or the app is rebuilt, and building it reads every CHW doctype's meta.
	texts = frappe.cache.get_value("chw_app_texts")
	if texts is None:
		texts = sorted(collect_chw_texts())
		frappe.cache.set_value("chw_app_texts", texts, expires_in_sec=3600)
	return texts


@frappe.whitelist()
def get_ui_translations(language=None):
	"""{english: translated} for every app text that has a translation in
	`language` (the files plus this site's Translation list, including any
	corrections made in Desk), and how many are still missing. Without a
	language: the user's own, else the organization default (System
	Settings) - Frappe resolves that into frappe.local.lang."""
	language = language or frappe.local.lang or "en"
	if language == "en":
		return {"language": "en", "messages": {}, "missing": 0}
	if not frappe.db.exists("Language", language):
		frappe.throw(_("Unknown language: {0}").format(language))
	all_translations = get_all_translations(language)
	messages = {}
	missing = 0
	for text in _app_texts_cached():
		translated = all_translations.get(text)
		if translated and translated != text:
			messages[text] = translated
		else:
			missing += 1
	return {"language": language, "messages": messages, "missing": missing}


@frappe.whitelist()
def switch_language(language):
	"""The app's Language menu: save the user's language (Desk follows it
	too), switch the Language on if it was off, and - if some app texts have
	no translation yet - translate them in the background. Only the app's
	own words are sent for translation, never patient data."""
	if language:
		_ensure_language(language)
	if not language or not frappe.db.exists("Language", language):
		frappe.throw(_("Unknown language: {0}").format(language))
	if language != "en" and not frappe.db.get_value("Language", language, "enabled"):
		frappe.db.set_value("Language", language, "enabled", 1)
	frappe.db.set_value("User", frappe.session.user, "language", language)
	frappe.clear_cache(user=frappe.session.user)

	queued = 0
	if language != "en":
		frappe.cache.delete_value("chw_app_texts")
		queued = len(missing_texts(language))
		if queued:
			frappe.enqueue(
				"chw.translation_tool.run_auto_translate",
				queue="long",
				timeout=3600,
				job_id=f"chw-auto-translate-{frappe.local.site}-{language}",
				deduplicate=True,
				language=language,
				user=frappe.session.user,
			)
	return {"language": language, "translating": queued}

// The app's language. Every text on screen goes through t(): fixed texts
// (buttons, menus, messages) and texts that come from the forms' design
// (field labels, options, section titles). Translations are Frappe's own -
// the app files plus each site's Translation list, so a correction made in
// Desk shows here too - fetched once per language and kept on the phone, so
// the app stays translated offline. Stored values are never translated:
// "Yes" / "Pending" are saved in English whatever language is on screen.

import { reactive, ref } from "vue";
import { call, toast } from "frappe-ui";

const STORE_KEY = "chw-i18n";

export const i18n = reactive({
	lang: "en",
	messages: {},
	// Background translation of texts missing in the chosen language.
	translating: false,
});

// t('Save'), t('{0} of {1}', [3, 10]) - the English text is the key, so an
// untranslated text simply shows in English.
export function t(text, args) {
	if (text == null || text === "") return text;
	const key = String(text);
	let out = (i18n.lang !== "en" && i18n.messages[key]) || key;
	if (args) {
		(Array.isArray(args) ? args : [args]).forEach((a, i) => {
			out = out.split(`{${i}}`).join(a);
		});
	}
	return out;
}

function readStore() {
	try {
		return JSON.parse(localStorage.getItem(STORE_KEY) || "null");
	} catch {
		return null;
	}
}

function writeStore(lang, messages) {
	try {
		localStorage.setItem(STORE_KEY, JSON.stringify({ lang, messages }));
	} catch {
		// Storage full or blocked - the app still works, just not offline.
	}
}

function apply(lang, messages) {
	i18n.lang = lang || "en";
	i18n.messages = messages || {};
	document.documentElement.lang = i18n.lang;
}

// Fetch a language's translations; returns how many app texts it still
// lacks. No `lang`: the server picks the user's language, else the
// organization default (System Settings).
async function fetchTranslations(lang) {
	const data = await call(
		"chw.translation_tool.get_ui_translations",
		lang ? { language: lang } : {}
	);
	apply(data?.language || lang, data?.messages);
	writeStore(i18n.lang, data?.messages || {});
	return data?.missing || 0;
}

// At start-up: show the last language straight away from the phone (works
// offline), then refresh from the server - the user's language may have
// been changed in Desk, the organization default may apply, or new
// corrections may have been made there.
export async function initLanguage(userLanguage) {
	const stored = readStore();
	if (stored?.lang) apply(stored.lang, stored.messages);
	try {
		await fetchTranslations(userLanguage || null);
	} catch {
		// Offline or not logged in yet - keep whatever was stored.
	}
}

let pollTimer = null;

// The Language menu: save the choice on the user (Desk follows it too),
// switch the screens over, and if some texts weren't translated yet, wait
// for the background translation and refresh as it completes.
export async function switchLanguage(lang) {
	clearTimeout(pollTimer);
	const result = await call("chw.translation_tool.switch_language", { language: lang });
	if (lang === "en") {
		apply("en", {});
		writeStore("en", {});
		i18n.translating = false;
		return;
	}
	let missing = await fetchTranslations(lang);
	if (!result?.translating || !missing) {
		i18n.translating = false;
		return;
	}
	i18n.translating = true;
	toast.info(t("Translating the app into the new language - this takes about a minute."));
	const started = Date.now();
	const poll = async () => {
		try {
			const before = missing;
			missing = await fetchTranslations(lang);
			// Done when nothing is missing, or when a round brings nothing new
			// (a few words, like "ANC", stay the same in every language).
			if (
				!missing ||
				(missing === before && Date.now() - started > 20000) ||
				Date.now() - started > 180000
			) {
				i18n.translating = false;
				toast.success(t("The app is now in your language."));
				return;
			}
		} catch {
			// Network blip - try again next round.
		}
		pollTimer = setTimeout(poll, 4000);
	};
	pollTimer = setTimeout(poll, 4000);
}

// The Language menu's list ("Tamil - தமிழ்"), loaded once per session.
export const languageOptions = ref([]);
let optionsRequest = null;
export function loadLanguageOptions() {
	if (!optionsRequest) {
		optionsRequest = call("chw.translation_tool.get_app_language_options")
			.then((list) => (languageOptions.value = list || []))
			.catch(() => {
				optionsRequest = null;
			});
	}
	return optionsRequest;
}

// Dates follow the app language too ("12 அக்., 2026"); English keeps the
// browser's own format, as before.
export function dateLocale() {
	return i18n.lang && i18n.lang !== "en" ? i18n.lang : undefined;
}

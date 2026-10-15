// Keeping the phone and the server in step: download the CHW's data (all
// of it the first time, then only what changed), and send the Outbox -
// in the order the changes were made, so a household reaches the server
// before the family members entered under it.

import { call } from "frappe-ui";
import { ALL_STORES, idb } from "./db";
import { networkFetch } from "./fetchProxy";
import { markOffline, markOnline, offlineState } from "./state";
import {
	allRecords,
	deleteRecords,
	getRecord,
	addReserved,
	isLocalName,
	reservedCounts,
	outboxEntries,
	putMetas,
	putOutbox,
	putRecords,
	refreshCounts,
	removeOutbox,
} from "./store";

// Read-only answers the forms ask for while being filled in (visit
// schedules, the date format) - fetched once online so they're on the phone.
const PREFETCH = [
	["chw.common.doctype.pnc.pnc.get_visit_schedule", undefined],
	[
		"chw.common.doctype.postpartum_reg_and_followup.postpartum_reg_and_followup.get_visit_schedule",
		{},
	],
	[
		"chw.common.doctype.child_6w_to_1_year_reg_and_followup.child_6w_to_1_year_reg_and_followup.get_visit_schedule",
		{},
	],
	["frappe.client.get_single_value", { doctype: "System Settings", field: "date_format" }],
];

const SYNC_EVERY_MS = 5 * 60 * 1000;

// ---- Talking to the server, never the phone's copy ------------------------

class NetworkError extends Error {}

function messageFrom(body) {
	try {
		const list = JSON.parse(body._server_messages || "[]").map((m) => {
			try {
				return JSON.parse(m).message;
			} catch {
				return m;
			}
		});
		if (list.length) return list.map((m) => String(m).replace(/<[^>]*>/g, "")).join(" ");
	} catch {
		// fall through
	}
	if (body._error_message) return String(body._error_message).replace(/<[^>]*>/g, "");
	const last = String(body.exception || body.exc_type || "")
		.split("\n")
		.filter(Boolean)
		.pop();
	return last || "The server refused this change.";
}

async function serverCall(method, params) {
	let res;
	try {
		res = await networkFetch(`/api/method/${method}`, {
			method: "POST",
			headers: {
				Accept: "application/json",
				"Content-Type": "application/json; charset=utf-8",
				"X-Frappe-Site-Name": window.location.hostname,
				...(window.csrf_token && window.csrf_token !== "{{ csrf_token }}"
					? { "X-Frappe-CSRF-Token": window.csrf_token }
					: {}),
			},
			body: JSON.stringify(params || {}),
		});
	} catch (e) {
		throw new NetworkError(e?.message || "Network error");
	}
	if ([502, 503, 504].includes(res.status))
		throw new NetworkError(`Server unavailable (${res.status})`);
	let body = {};
	try {
		body = await res.json();
	} catch {
		// An HTML error page - nothing to read.
	}
	if (!res.ok) {
		const error = new Error(messageFrom(body));
		error.status = res.status;
		error.excType = body.exc_type;
		throw error;
	}
	markOnline();
	return body.message;
}

// ---- Who the data belongs to --------------------------------------------

let started = false;
let timer = null;

// A different user on the same phone starts from nothing - one CHW's
// patients must never show for another.
async function claimFor(user) {
	const owner = await idb.get("kv", "owner").catch(() => null);
	if (owner && owner !== user) await idb.clear(ALL_STORES);
	await idb.put("kv", user, "owner");
	offlineState.user = user;
	offlineState.lastSync = (await idb.get("kv", "lastSync").catch(() => null)) || null;
	offlineState.ready = !!offlineState.lastSync;
	// Records still waiting to sync are only on this phone.
	const entries = await idb.getAll("outbox").catch(() => []);
	offlineState.local = Object.fromEntries(
		entries.filter((e) => e.action === "insert").map((e) => [e.name, true])
	);
	await refreshCounts();
}

export async function clearOfflineData() {
	started = false;
	clearInterval(timer);
	await idb.clear(ALL_STORES).catch(() => {});
	try {
		if (window.caches) await caches.delete("chw-app-shell");
	} catch {
		// ignore
	}
}

// ---- Download -------------------------------------------------------------

let downloading = null;

export function download({ full = false } = {}) {
	if (!downloading) {
		downloading = runDownload(full).finally(() => {
			downloading = null;
			offlineState.downloading = false;
		});
	}
	return downloading;
}

async function runDownload(full) {
	offlineState.downloading = true;
	const since = full ? null : await idb.get("kv", "lastSync").catch(() => null);
	const metasHash = full ? null : await idb.get("kv", "metasHash").catch(() => null);
	const params = {};
	if (since) params.since = since;
	if (metasHash) params.metas_hash = metasHash;
	const data = await serverCall("chw.offline.get_offline_data", params);
	// Sent only when a form changed since the phone's copy.
	if (data.metas) {
		await putMetas(data.metas);
		await idb.put("kv", data.metas_hash, "metasHash");
	}
	await idb.put("kv", data.doctypes || [], "doctypes");

	for (const doctype of data.doctypes || []) {
		const local = await allRecords(doctype);
		const pendingNames = new Set(local.filter((r) => r.__offline).map((r) => r.name));
		// A record with an offline edit keeps the edit; the sync checks it
		// against the server's version.
		const incoming = (data.records?.[doctype] || []).filter(
			(r) => !pendingNames.has(String(r.name))
		);
		await putRecords(doctype, incoming);
		const keep = new Set((data.names?.[doctype] || []).map(String));
		const gone = local.filter((r) => !r.__offline && !keep.has(r.name)).map((r) => r.name);
		await deleteRecords(doctype, gone);
	}

	// Keep a block of real IDs per form for records made offline.
	try {
		const res = await serverCall("chw.offline.reserve_ids", { have: await reservedCounts() });
		const extra = await addReserved(res?.ids, res?.block);
		if (Object.keys(extra).length)
			await serverCall("chw.offline.release_ids", { names: extra });
	} catch (e) {
		if (e instanceof NetworkError) throw e;
		// A form that can't be reserved just uses temporary names offline.
	}

	await idb.put("kv", data.server_time, "lastSync");
	offlineState.lastSync = data.server_time;
	offlineState.ready = true;

	// Through the app's own fetch, which stores each answer for offline use.
	for (const [method, params] of PREFETCH) await call(method, params).catch(() => {});
}

// ---- Upload (the Outbox) ----------------------------------------------------

let pushing = null;

export function push() {
	if (!pushing) pushing = runPush().finally(() => (pushing = null));
	return pushing;
}

async function idMap() {
	return (await idb.get("kv", "idmap").catch(() => null)) || {};
}

// Swap temporary OFFLINE-… names for real IDs anywhere in a value.
function rename(value, map) {
	if (typeof value === "string") return map[value] ?? value;
	if (Array.isArray(value)) return value.map((v) => rename(v, map));
	if (value && typeof value === "object")
		return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, rename(v, map)]));
	return value;
}

function mentionsTemp(value) {
	if (typeof value === "string") return isLocalName(value) ? value : null;
	if (Array.isArray(value)) return value.map(mentionsTemp).find(Boolean) || null;
	if (value && typeof value === "object")
		return (
			Object.entries(value)
				.filter(([k]) => k !== "name")
				.map(([, v]) => mentionsTemp(v))
				.find(Boolean) || null
		);
	return null;
}

async function runPush() {
	if (!offlineState.online) return;
	offlineState.syncing = true;
	offlineState.lastSyncError = null;
	try {
		for (const entry of await outboxEntries()) {
			if (entry.status !== "pending" && entry.status !== "syncing") continue;
			const map = await idMap();
			const waitingFor = mentionsTemp(
				rename(entry.action === "insert" ? entry.doc : entry.changes, map)
			);
			if (waitingFor) {
				// Linked to a record that hasn't synced (it has an error to fix).
				entry.note = waitingFor;
				await putOutbox(entry);
				continue;
			}
			try {
				if (entry.action === "insert") await pushInsert(entry, map);
				else await pushUpdate(entry, map);
			} catch (e) {
				if (e instanceof NetworkError) {
					markOffline();
					return;
				}
				// Logged out on the server: nothing will sync until the CHW logs in.
				if (e.status === 403 && /session|login|guest/i.test(`${e.excType} ${e.message}`)) {
					offlineState.lastSyncError = "login";
					return;
				}
				entry.status = "error";
				entry.error = e.message;
				await putOutbox(entry);
			}
		}
	} finally {
		offlineState.syncing = false;
		await refreshCounts();
	}
}

async function pushInsert(entry, map) {
	const doc = rename(entry.doc, map);
	const result = await serverCall("chw.offline.push_insert", { client_id: entry.id, doc });
	const realName = String(result.name);
	if (realName !== entry.name) {
		map[entry.name] = realName;
		await idb.put("kv", map, "idmap");
	}
	const local = { ...offlineState.local };
	delete local[entry.name];
	offlineState.local = local;

	await deleteRecords(entry.doctype, [entry.name]);
	await putRecords(entry.doctype, [result.doc]);
	// Offline records that pointed at the temporary name now point at the
	// real one (only offline records can - the server never saw the name).
	for (const doctype of (await idb.get("kv", "doctypes").catch(() => null)) || []) {
		const changed = (await allRecords(doctype))
			.filter((r) => r.__offline && mentionsTemp(r))
			.map((r) => rename(r, map));
		await putRecords(doctype, changed);
	}
	await removeOutbox(entry.id);
	if (realName !== entry.name)
		offlineState.renamed = { ...offlineState.renamed, [entry.name]: realName };
}

async function pushUpdate(entry, map, force = false) {
	const name = map[entry.name] ?? entry.name;
	const result = await serverCall("chw.offline.push_update", {
		client_id: entry.id,
		doctype: entry.doctype,
		name,
		changes: rename(entry.changes, map),
		base: rename(entry.base, map),
		base_modified: entry.base_modified,
		force: force ? 1 : 0,
	});
	if (result.status === "conflict") {
		entry.status = "conflict";
		entry.conflict_fields = result.fields;
		entry.server_doc = result.doc;
		await putOutbox(entry);
		return;
	}
	await putRecords(entry.doctype, [result.doc]);
	await removeOutbox(entry.id);
}

// ---- What the CHW decides on the Outbox page -----------------------------

// Conflict: keep this phone's values ("mine") or the server's.
export async function resolveConflict(entry, choice) {
	if (choice === "mine") {
		try {
			await pushUpdate(entry, await idMap(), true);
		} catch (e) {
			if (e instanceof NetworkError)
				throw new Error("You are offline. Try again when connected.");
			entry.status = "error";
			entry.error = e.message;
			await putOutbox(entry);
		}
	} else {
		if (entry.server_doc) await putRecords(entry.doctype, [entry.server_doc]);
		await removeOutbox(entry.id);
	}
	await refreshCounts();
}

// After fixing a refused record in its form, or to retry after an error.
export async function retry(entry) {
	entry.status = "pending";
	entry.error = null;
	await putOutbox(entry);
	return push();
}

// Throw a change away. A new record disappears; an edit goes back to the
// server's version (fetched now if online, else at the next download).
export async function discard(entry) {
	await removeOutbox(entry.id);
	if (entry.action === "insert") {
		await deleteRecords(entry.doctype, [entry.name]);
		const local = { ...offlineState.local };
		delete local[entry.name];
		offlineState.local = local;
		return;
	}
	const record = await getRecord(entry.doctype, entry.name);
	if (record) {
		const restored = { ...record, ...(entry.base || {}) };
		delete restored.__offline;
		if (entry.server_doc) Object.assign(restored, entry.server_doc);
		await putRecords(entry.doctype, [restored]);
	}
}

// ---- Running it --------------------------------------------------------------

export async function syncNow({ full = false } = {}) {
	if (!offlineState.user) return;
	try {
		await push();
		await download({ full });
		// Changes made while downloading.
		if (offlineState.pending) await push();
	} catch (e) {
		if (e instanceof NetworkError) markOffline();
		else offlineState.lastSyncError = e.message;
	}
}

let queuedTimer = null;

// Store the app page for offline use right away. The service worker only
// stores pages it serves itself - on a phone's very first visit the page
// loaded before it existed, so going offline straight after showed the
// browser's "no internet" page. Same key the service worker reads ('/chw').
async function saveAppPage() {
	if (!window.caches || !window.location.pathname.startsWith("/chw")) return;
	try {
		const res = await networkFetch("/chw/home", {
			credentials: "same-origin",
			cache: "no-store",
		});
		if (res.ok && (res.headers.get("content-type") || "").includes("text/html")) {
			const cache = await caches.open("chw-app-shell");
			await cache.put(new URL("/chw", window.location.origin).href, res);
		}
	} catch {
		// Offline or storage blocked - the service worker stores it next visit.
	}
}

// Load every screen's code once while online, so the service worker has
// it all - a screen first opened offline would otherwise have no code.
async function warmScreens() {
	await saveAppPage();
	const { default: router } = await import("@/router");
	for (const route of router.getRoutes()) {
		const component = route.components?.default;
		if (typeof component === "function") await component().catch(() => {});
	}
	await import("@/components/QuickCreateDialog.vue").catch(() => {});
}

let currentUser = null;

export async function startOfflineSync(user) {
	if (!user || user === "Guest") return;
	currentUser = user;
	if (started && offlineState.user === user) return;
	started = true;
	// Not available (private window) or waiting for another tab: try again
	// the next time the app is opened or comes back into view.
	if (!(await idb.available())) {
		started = false;
		return;
	}
	await claimFor(user);
	if (offlineState.online) {
		syncNow();
		warmScreens();
	}
	clearInterval(timer);
	timer = setInterval(() => offlineState.online && syncNow(), SYNC_EVERY_MS);
}

if (typeof window !== "undefined") {
	window.addEventListener("chw:online", () => started && syncNow());
	// Back to the app (another tab closed, phone unlocked): catch up.
	document.addEventListener("visibilitychange", () => {
		if (document.visibilityState !== "visible" || !currentUser) return;
		if (!started) startOfflineSync(currentUser);
		else if (offlineState.online && !offlineState.ready) syncNow();
	});
	// A change saved offline - or saved online just as the network dropped -
	// goes out as soon as the network allows.
	window.addEventListener("chw:queued", () => {
		clearTimeout(queuedTimer);
		queuedTimer = setTimeout(() => started && offlineState.online && push(), 1500);
	});
	// While offline, check now and then whether the network is back - one
	// failed request (a blip) must not leave the app "Offline" for long.
	setInterval(async () => {
		if (!started || offlineState.online) return;
		try {
			const res = await networkFetch("/api/method/ping", { cache: "no-store" });
			if (res.ok) markOnline();
		} catch {
			// still offline
		}
	}, 10000);
}

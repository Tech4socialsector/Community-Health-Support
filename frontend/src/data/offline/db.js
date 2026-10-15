// The phone's own copy of the CHW data, in IndexedDB (survives closing the
// app, unlike memory; far roomier than localStorage). Four stores:
//   records  - [doctype, name] -> the record, child tables included
//   metas    - doctype -> its form definition (fields, conditions ...)
//   outbox   - client id -> a change made offline, waiting to sync
//   kv       - everything else: cached answers, last sync time, owner
// One database for the whole app; wiped on logout and when a different
// user logs in, so one CHW's patients never show for another.

import { offlineState } from "./state";

const DB_NAME = "chw-offline";
const VERSION = 2;
const STORES = ["records", "metas", "outbox", "kv"];

let dbPromise = null;

function open() {
	if (dbPromise) return dbPromise;
	dbPromise = new Promise((resolve, reject) => {
		if (typeof indexedDB === "undefined") {
			reject(new Error("IndexedDB is not available"));
			return;
		}
		const req = indexedDB.open(DB_NAME, VERSION);
		req.onupgradeneeded = () => {
			const db = req.result;
			if (!db.objectStoreNames.contains("records")) {
				const records = db.createObjectStore("records", { keyPath: ["doctype", "name"] });
				records.createIndex("doctype", "doctype");
			}
			if (!db.objectStoreNames.contains("metas"))
				db.createObjectStore("metas", { keyPath: "name" });
			if (!db.objectStoreNames.contains("outbox")) {
				const outbox = db.createObjectStore("outbox", { keyPath: "id" });
				outbox.createIndex("seq", "seq");
			}
			if (!db.objectStoreNames.contains("kv")) db.createObjectStore("kv");
		};
		req.onsuccess = () => {
			const db = req.result;
			// A database left without its stores (created by something else
			// first, or a broken upgrade) can't be used - start it again.
			if (STORES.some((s) => !db.objectStoreNames.contains(s))) {
				db.close();
				const del = indexedDB.deleteDatabase(DB_NAME);
				del.onsuccess =
					del.onerror =
					del.onblocked =
						() => {
							dbPromise = null;
							open().then(resolve, reject);
						};
				return;
			}
			// Another tab upgrading the database: let it, and reopen next time.
			db.onversionchange = () => {
				db.close();
				dbPromise = null;
			};
			offlineState.storageBlocked = false;
			resolve(db);
		};
		req.onerror = () => reject(req.error);
		// Another tab still runs the older app and holds the storage open: the
		// upgrade waits until it closes. Said on screen, not left silent.
		req.onblocked = () => {
			offlineState.storageBlocked = true;
		};
	});
	// A failed open (private window, storage blocked) must not stay cached:
	// the next call tries again, and callers fall back to online-only.
	dbPromise.catch(() => (dbPromise = null));
	return dbPromise;
}

function promisify(req) {
	return new Promise((resolve, reject) => {
		req.onsuccess = () => resolve(req.result);
		req.onerror = () => reject(req.error);
	});
}

async function tx(storeNames, mode, fn) {
	const db = await open();
	return new Promise((resolve, reject) => {
		const t = db.transaction(storeNames, mode);
		let result;
		Promise.resolve(fn(t)).then((r) => (result = r), reject);
		t.oncomplete = () => resolve(result);
		t.onerror = () => reject(t.error);
		t.onabort = () => reject(t.error);
	});
}

export const idb = {
	get: (store, key) => tx([store], "readonly", (t) => promisify(t.objectStore(store).get(key))),
	getAll: (store) => tx([store], "readonly", (t) => promisify(t.objectStore(store).getAll())),
	getAllByIndex: (store, index, value) =>
		tx([store], "readonly", (t) => promisify(t.objectStore(store).index(index).getAll(value))),
	put: (store, value, key) =>
		tx([store], "readwrite", (t) => promisify(t.objectStore(store).put(value, key))),
	delete: (store, key) =>
		tx([store], "readwrite", (t) => promisify(t.objectStore(store).delete(key))),
	// Many writes in one transaction - a download of thousands of records
	// would otherwise take one transaction (and one disk flush) each.
	putMany: (store, values) =>
		tx([store], "readwrite", (t) => {
			const s = t.objectStore(store);
			for (const v of values) s.put(v);
		}),
	deleteMany: (store, keys) =>
		tx([store], "readwrite", (t) => {
			const s = t.objectStore(store);
			for (const k of keys) s.delete(k);
		}),
	clear: (stores) =>
		tx(stores, "readwrite", (t) => {
			for (const s of stores) t.objectStore(s).clear();
		}),
	// Not stuck for long behind another tab's old version (see onblocked).
	available: () =>
		Promise.race([
			open().then(
				() => true,
				() => false
			),
			new Promise((r) => setTimeout(() => r(false), 5000)),
		]),
};

export const ALL_STORES = STORES;

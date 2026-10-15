// Mirrors what a browser's own "Clear site data" devtools action does -
// wipes every client-side cache this app can accumulate (frappe-ui's
// useCall/useList IndexedDB snapshots, the service worker + its precache,
// localStorage/sessionStorage) and reloads. Exists because a stale IndexedDB
// snapshot from before a permission/module change can otherwise leave a
// user stuck seeing old data indefinitely with no way to self-recover
// short of manually opening devtools.
export async function clearSiteData() {
  const tasks = []

  if (window.indexedDB?.databases) {
    tasks.push(
      window.indexedDB.databases().then((dbs) =>
        Promise.all(
          dbs
            .filter((db) => db.name)
            .map(
              (db) =>
                new Promise((resolve) => {
                  const req = window.indexedDB.deleteDatabase(db.name)
                  req.onsuccess = () => resolve()
                  req.onerror = () => resolve()
                  req.onblocked = () => resolve()
                }),
            ),
        ),
      ),
    )
  }

  if (window.caches?.keys) {
    tasks.push(
      window.caches
        .keys()
        .then((names) => Promise.all(names.map((name) => window.caches.delete(name)))),
    )
  }

  if (navigator.serviceWorker?.getRegistrations) {
    tasks.push(
      navigator.serviceWorker
        .getRegistrations()
        .then((regs) => Promise.all(regs.map((reg) => reg.unregister()))),
    )
  }

  try {
    localStorage.clear()
    sessionStorage.clear()
  } catch {
    // Ignore - storage access can throw in locked-down browser contexts;
    // the IndexedDB/cache/SW clears above are the ones that actually matter.
  }

  await Promise.all(tasks)
  window.location.reload()
}

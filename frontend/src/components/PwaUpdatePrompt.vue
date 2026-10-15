<template>
	<!-- No template - this only registers the service worker and surfaces
  update/offline-ready state via toast. Kept as a component (mounted once
  in App.vue) rather than a bare side-effect module so it participates in
  Vue's lifecycle the same way the rest of this app's singletons do. -->
</template>

<script setup>
import { onMounted } from "vue";
import { toast } from "frappe-ui";
import { t } from "@/data/i18n";

// virtual:pwa-register bakes its service-worker URL as `buildBase + filename`
// (vite-plugin-pwa always couples the two - there's no option to separate
// them), which resolves to /assets/chw/frontend/sw.js. A service worker can
// only control paths at-or-below wherever it's served from, so registering
// it there would cap its scope to /assets/chw/frontend/ - useless for an app
// that lives at /chw/. chw.website.sw_renderer.ServiceWorkerRenderer serves
// the same built file at /chw/sw.js instead, so Workbox is driven directly
// here (bypassing virtual:pwa-register) with that URL hardcoded.

onMounted(async () => {
	if (!("serviceWorker" in navigator)) return;

	const { Workbox } = await import("workbox-window");
	const wb = new Workbox("/chw/sw.js", { scope: "/chw/" });

	// A new version installs itself straight away - for offline use it
	// mustn't wait for someone to tap "Refresh": until it's active the phone
	// keeps the old version's offline files, and a page reloaded offline
	// can't open. Taking over doesn't reload the page (that could lose a
	// form being filled in); the new version shows on the next reload.
	let updateToastShown = false;
	const activateUpdate = () => {
		wb.messageSkipWaiting();
		if (updateToastShown) return;
		updateToastShown = true;
		toast.info(t("The app has been updated. Reload when convenient to use the new version."), {
			duration: 10000,
			action: {
				label: t("Reload"),
				onClick: () => window.location.reload(),
			},
		});
	};

	wb.addEventListener("installed", (event) => {
		if (!event.isUpdate && !event.isExternal)
			toast.success(t("The app is ready to work offline."));
	});
	wb.addEventListener("waiting", activateUpdate);

	wb.register().catch((error) => {
		// Non-fatal - the app still works online exactly as before, it just
		// won't be installable/offline-capable until the SW registers
		// successfully on a later visit. Not worth alarming the user over.
		console.error("Service worker registration failed", error);
	});
});
</script>

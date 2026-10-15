<template>
	<!-- Offline mode at a glance, in the header on every page: offline,
  how many changes wait to sync, or that something needs the CHW. Opens
  the Outbox. -->
	<router-link
		:to="{ name: 'Outbox' }"
		class="inline-flex h-8 flex-shrink-0 items-center gap-1.5 rounded-full px-2.5 text-xs font-semibold ring-1 transition"
		:class="tone"
		:aria-label="label"
	>
		<LucideIcon :name="icon" class="h-3.5 w-3.5" :class="{ 'animate-spin': spinning }" />
		<span :class="{ 'hidden sm:inline': quiet }">{{ label }}</span>
	</router-link>
</template>

<script setup>
import { computed } from "vue";
import LucideIcon from "@/components/LucideIcon.vue";
import { offlineState as s } from "@/data/offline/state";
import { t } from "@/data/i18n";

const attention = computed(() => s.errors + s.conflicts);
const busy = computed(() => s.online && (s.syncing || (s.downloading && !s.ready)));
const spinning = computed(() => busy.value && !attention.value);
// All well: an icon only on a phone, where the header is narrow.
const quiet = computed(
	() => !attention.value && !s.pending && s.online && s.ready && !s.storageBlocked && !busy.value
);

const label = computed(() => {
	if (s.storageBlocked) return t("Close other CHW tabs");
	if (attention.value)
		return attention.value === 1
			? t("1 needs attention")
			: t("{0} need attention", [attention.value]);
	if (busy.value) return s.ready ? t("Syncing…") : t("Getting offline data…");
	if (s.pending) return s.pending === 1 ? t("1 to sync") : t("{0} to sync", [s.pending]);
	if (!s.online) return t("Offline");
	// Online, but this phone hasn't got its offline copy yet.
	if (!s.ready) return t("Not ready offline");
	return t("Synced");
});

const icon = computed(() => {
	if (attention.value || s.storageBlocked) return "triangle-alert";
	if (busy.value) return "loader-circle";
	if (!s.online || !s.ready) return "cloud-off";
	if (s.pending) return "cloud-upload";
	return "cloud-check";
});

const tone = computed(() => {
	if (attention.value || s.storageBlocked)
		return "bg-red-50 text-red-700 ring-red-200 dark:bg-red-900/30 dark:text-red-200 dark:ring-red-800";
	if (s.pending || !s.online || !s.ready)
		return "bg-amber-50 text-amber-800 ring-amber-200 dark:bg-amber-900/30 dark:text-amber-200 dark:ring-amber-800";
	return "bg-white text-forest-700 ring-gray-200 hover:bg-gray-50 dark:bg-gray-900 dark:text-forest-200 dark:ring-gray-700";
});
</script>

<template>
	<!-- The app's Language menu: pick a language and every screen switches.
  Saved on the user (Desk follows it too); a language that isn't fully
  translated yet is translated in the background and fills in as it
  arrives (data/i18n.js). -->
	<ToolbarMenu
		:label="currentLabel"
		icon="languages"
		:align="align"
		width="sm:w-64"
		:class="menuClass"
	>
		<template #default="{ close }">
			<p v-if="!options.length" class="px-2 py-2 text-sm text-gray-400">
				{{ t("Loading…") }}
			</p>
			<button
				v-for="opt in options"
				:key="opt.value"
				type="button"
				class="flex w-full items-center justify-between gap-2 rounded-md px-2 py-2.5 text-left text-sm hover:bg-gray-50 dark:hover:bg-gray-800 sm:py-1.5"
				:class="
					opt.value === i18n.lang
						? 'font-semibold text-navy-900 dark:text-gray-100'
						: 'text-gray-700 dark:text-gray-300'
				"
				:disabled="switching"
				@click="choose(opt.value, close)"
			>
				<span class="truncate">{{ opt.label }}</span>
				<LucideIcon
					v-if="opt.value === i18n.lang"
					name="check"
					class="h-4 w-4 flex-shrink-0 text-forest-700 dark:text-forest-300"
				/>
			</button>
		</template>
	</ToolbarMenu>
</template>

<script setup>
import { computed, ref } from "vue";
import { toast } from "frappe-ui";
import ToolbarMenu from "@/components/ToolbarMenu.vue";
import LucideIcon from "@/components/LucideIcon.vue";
import { i18n, languageOptions, loadLanguageOptions, switchLanguage, t } from "@/data/i18n";

defineProps({
	align: { type: String, default: "right" },
	// Extra classes for the button (e.g. light-on-dark in the Home banner).
	menuClass: { type: [String, Array, Object], default: "" },
});

const options = languageOptions;
loadLanguageOptions();

const currentLabel = computed(() => {
	const opt = options.value.find((o) => o.value === i18n.lang);
	const name = opt ? opt.label.split(" - ").pop() : i18n.lang === "en" ? "English" : i18n.lang;
	return i18n.translating ? `${name} …` : name;
});

const switching = ref(false);
async function choose(lang, close) {
	close();
	if (lang === i18n.lang) return;
	switching.value = true;
	try {
		await switchLanguage(lang);
	} catch (e) {
		toast.error(e?.messages?.[0] || e?.message || t("Could not change the language."));
	} finally {
		switching.value = false;
	}
}
</script>

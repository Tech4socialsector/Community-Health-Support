<template>
	<AppLayout>
		<div :class="ui.PAGE">
			<!-- Hero: greeting + date on the logo's own hill green (#245535 =
      forest-700, also the New / Save buttons), with the logo's two hill
      outlines drawn faintly along the bottom, and the Language menu. -->
			<!-- No overflow-hidden on the banner itself: the Language menu's list
      opens below it and was being cut off. Only the hills are clipped, by
      their own rounded wrapper. -->
			<section
				class="relative z-10 rounded-2xl bg-forest-700 px-5 pb-12 pt-6 text-white shadow-sm sm:px-8 sm:pb-14 sm:pt-8"
			>
				<div
					class="pointer-events-none absolute inset-0 overflow-hidden rounded-2xl"
					aria-hidden="true"
				>
					<svg
						class="pointer-events-none absolute inset-x-0 bottom-0 h-10 w-full sm:h-12"
						viewBox="0 0 640 100"
						preserveAspectRatio="none"
						aria-hidden="true"
					>
						<path
							d="M0 98 C60 92 110 80 150 52 C175 34 200 22 215 24 C240 28 270 60 300 78 C330 92 380 98 420 99"
							fill="none"
							stroke="white"
							stroke-opacity="0.18"
							stroke-width="4"
							vector-effect="non-scaling-stroke"
							stroke-linecap="round"
						/>
						<path
							d="M170 99 C220 70 250 52 280 56 C300 58 312 40 330 34 C350 28 370 10 400 6 C420 4 430 30 445 42 C460 54 470 46 490 52 C530 64 580 86 640 98"
							fill="none"
							stroke="white"
							stroke-opacity="0.18"
							stroke-width="4"
							vector-effect="non-scaling-stroke"
							stroke-linecap="round"
						/>
					</svg>
				</div>
				<div
					class="relative flex flex-col gap-5 md:flex-row md:items-end md:justify-between"
				>
					<div class="min-w-0">
						<p class="text-xs font-medium uppercase tracking-wider text-forest-200">
							{{ todayLabel }}
						</p>
						<h1 class="mt-1 text-xl font-semibold sm:text-2xl">{{ greeting }}</h1>
						<p class="mt-1 text-sm text-forest-100">
							{{ t("Pick a form to view records or start a new entry.") }}
						</p>
					</div>
					<!-- Language menu right where the app opens, one tap away. -->
					<div class="flex">
						<LanguageMenu
							align="right"
							class="flex-shrink-0"
							menu-class="[&>button]:!h-10 [&>button]:!bg-white/10 [&>button]:!text-white [&>button]:!ring-1 [&>button]:!ring-white/20 [&>button:hover]:!bg-white/15"
						/>
					</div>
				</div>
			</section>

			<!-- Forms -->
			<div v-if="modulesResource.loading && !modulesResource.data" :class="ui.STAT_GRID">
				<div v-for="i in 8" :key="i" :class="ui.STAT_CARD">
					<Skeleton width="70%" height="0.875rem" />
					<Skeleton width="3rem" height="2rem" />
					<Skeleton width="5.5rem" height="0.875rem" />
				</div>
			</div>
			<ErrorMessage v-else-if="modulesResource.error" :message="modulesResource.error" />
			<div v-else-if="!modules.length" :class="ui.EMPTY_STATE">
				<LucideIcon name="inbox" class="h-8 w-8 text-gray-300 dark:text-gray-600" />
				{{
					t(
						"No modules are configured for your account yet. Ask a coordinator to enable modules in App Module Setting."
					)
				}}
			</div>
			<template v-else>
				<section v-for="mod in modules" :key="mod.label">
					<div class="mb-3 flex items-center gap-3">
						<h2 :class="ui.SECTION_LABEL">{{ t(mod.label) }}</h2>
						<span :class="ui.COUNT_BADGE">{{ mod.doctypes.length }}</span>
						<span class="h-px flex-1 bg-gray-200 dark:bg-gray-800" />
					</div>
					<div :class="ui.STAT_GRID">
						<!-- Card is a plain div (not a link) because it holds two
            separate actions - nesting the "+ New" link inside an outer link
            is invalid HTML. The stretched ::after on the title link makes
            the whole card clickable anyway; "+ New" sits above it (z-10). -->
						<div
							v-for="(item, index) in mod.doctypes"
							:key="item.route"
							:class="ui.statCardAt(index)"
						>
							<router-link
								:to="{ name: 'DoctypeList', params: { doctypeRoute: item.route } }"
								:title="t(item.displayLabel)"
								:class="[
									ui.STAT_LABEL,
									'after:absolute after:inset-0 after:rounded-xl focus:outline-none',
								]"
							>
								{{ t(item.displayLabel) }}
							</router-link>
							<Skeleton v-if="countsLoading" width="3rem" height="2rem" />
							<span v-else :class="ui.statCountAt(index)">
								<template v-if="countFor(item) != null">{{
									countFor(item)
								}}</template>
								<span v-else class="text-gray-300 dark:text-gray-600">—</span>
							</span>
							<span class="flex w-full items-center justify-between gap-2">
								<span :class="ui.STAT_CTA">
									<span class="hidden min-[400px]:inline">{{
										t("View records")
									}}</span>
									<span class="min-[400px]:hidden">{{ t("View") }}</span>
									<LucideIcon
										name="arrow-right"
										class="h-4 w-4 transition group-hover:translate-x-0.5"
									/>
								</span>
								<router-link
									:to="{
										name: 'DoctypeNew',
										params: { doctypeRoute: item.route },
									}"
									:title="t('New {0}', [t(item.displayLabel)])"
									:aria-label="t('New {0}', [t(item.displayLabel)])"
									:class="ui.BTN_ADD"
								>
									<LucideIcon name="plus" class="h-4 w-4" />
								</router-link>
							</span>
						</div>
					</div>
				</section>
			</template>
		</div>
	</AppLayout>
</template>

<script setup>
import { computed } from "vue";
import { ErrorMessage, useCall } from "frappe-ui";
import AppLayout from "@/layouts/AppLayout.vue";
import Skeleton from "@/components/Skeleton.vue";
import LucideIcon from "@/components/LucideIcon.vue";
import LanguageMenu from "@/components/LanguageMenu.vue";
import { modulesResource } from "@/data/modules";
import { setPageTitle } from "@/data/pageTitle";
import { session } from "@/data/session";
import * as ui from "@/data/ui";
import { t, dateLocale } from "@/data/i18n";

setPageTitle("Home");

const modules = computed(() =>
	(modulesResource.data || [])
		.filter((mod) => mod.doctypes?.length)
		.map((mod) => ({
			...mod,
			doctypes: mod.doctypes.map((item) => ({
				...item,
				displayLabel: item.label || item.doctype_name,
			})),
		}))
);

const countsResource = useCall({
	url: "/api/v2/method/chw.api.get_module_record_counts",
	method: "GET",
	cacheKey: "chw-home-record-counts",
});

const countsLoading = computed(() => countsResource.loading && !countsResource.data);

function countFor(item) {
	const value = countsResource.data?.[item.doctype_name];
	return typeof value === "number" ? value : null;
}

// computed, so the date's language follows the Language menu.
const todayLabel = computed(() =>
	new Date().toLocaleDateString(dateLocale(), {
		weekday: "long",
		day: "numeric",
		month: "long",
		year: "numeric",
	})
);

const greeting = computed(() => {
	const hour = new Date().getHours();
	// Whole sentence as one key ("Good morning, {0}") so languages can put
	// the name where their grammar wants it.
	// Written out in full (not built from pieces) so the auto-translate's
	// text collector finds each one.
	const firstName = (session.full_name || "").split(" ")[0] || session.user || "";
	if (hour < 12) return t("Good morning, {0}", [firstName]);
	if (hour < 17) return t("Good afternoon, {0}", [firstName]);
	return t("Good evening, {0}", [firstName]);
});
</script>

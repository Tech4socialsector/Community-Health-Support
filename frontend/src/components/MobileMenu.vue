<template>
	<!-- The phone's Menu: a sheet that slides up from the bottom (where the
  thumb already is) over the whole width, instead of the desktop sidebar
  squeezed into a side drawer. The forms as big tiles, then where to go and
  the account actions. -->
	<Transition name="sheet-fade">
		<div v-if="open" class="fixed inset-0 z-40 bg-black/40" @click.self="close">
			<Transition name="sheet-up" appear>
				<div
					v-if="open"
					role="dialog"
					aria-modal="true"
					:aria-label="t('Menu')"
					class="absolute inset-x-0 bottom-0 flex max-h-[88vh] flex-col rounded-t-2xl bg-white shadow-2xl dark:bg-gray-900"
				>
					<!-- Drag handle + who is logged in. -->
					<div class="flex-shrink-0 px-4 pt-2">
						<div
							class="mx-auto mb-3 h-1 w-10 rounded-full bg-gray-300 dark:bg-gray-700"
						/>
						<div class="flex items-center gap-3 pb-3">
							<Avatar
								:image="session.user_image"
								:label="session.full_name || session.user"
								size="lg"
							/>
							<div class="min-w-0 flex-1">
								<p
									class="truncate text-sm font-semibold text-navy-900 dark:text-gray-100"
								>
									{{ session.full_name || session.user }}
								</p>
								<p class="truncate text-xs text-gray-500 dark:text-gray-400">
									{{ session.user }}
								</p>
							</div>
							<button
								type="button"
								class="flex h-9 w-9 items-center justify-center rounded-full text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800"
								:aria-label="t('Close')"
								@click="close"
							>
								<LucideIcon name="x" class="h-5 w-5" />
							</button>
						</div>
					</div>

					<div
						class="min-h-0 flex-1 overflow-y-auto px-4 pb-[calc(1rem+env(safe-area-inset-bottom))]"
					>
						<!-- Forms, module by module. -->
						<section v-for="mod in modules" :key="mod.label" class="mb-4">
							<p :class="[ui.SECTION_LABEL, 'mb-2']">{{ t(mod.label) }}</p>
							<div class="grid grid-cols-3 gap-2">
								<router-link
									v-for="item in mod.doctypes"
									:key="item.route"
									:to="{
										name: 'DoctypeList',
										params: { doctypeRoute: item.route },
									}"
									class="flex min-h-[5.5rem] flex-col items-center justify-center gap-1.5 rounded-xl px-1.5 py-2.5 text-center ring-1 transition"
									:class="
										route.params.doctypeRoute === item.route
											? 'bg-forest-50 text-forest-800 ring-forest-200 dark:bg-forest-900/40 dark:text-forest-100 dark:ring-forest-800'
											: 'bg-gray-50 text-gray-700 ring-gray-100 active:bg-gray-100 dark:bg-gray-800/60 dark:text-gray-200 dark:ring-gray-800'
									"
									@click="close"
								>
									<component
										:is="moduleIcon(item.icon || mod.icon)"
										class="h-5 w-5 text-forest-700 dark:text-forest-300"
									/>
									<span
										class="line-clamp-2 text-[11px] font-medium leading-tight"
										>{{ t(item.label || item.doctype_name) }}</span
									>
								</router-link>
							</div>
						</section>

						<!-- Places. -->
						<div
							:class="[
								ui.CARD,
								'mb-4 divide-y divide-gray-100 overflow-hidden dark:divide-gray-800',
							]"
						>
							<router-link :to="{ name: 'Home' }" :class="ROW" @click="close">
								<LucideIcon name="house" :class="ICON" />
								<span class="flex-1">{{ t("Home") }}</span>
							</router-link>
							<router-link :to="{ name: 'WorkOrders' }" :class="ROW" @click="close">
								<LucideIcon name="clipboard-list" :class="ICON" />
								<span class="flex-1">{{ t("My Work") }}</span>
							</router-link>
							<router-link
								v-if="isPrivileged"
								:to="{ name: 'Overview' }"
								:class="ROW"
								@click="close"
							>
								<LucideIcon name="chart-bar-big" :class="ICON" />
								<span class="flex-1">{{ t("Overview") }}</span>
							</router-link>
							<router-link :to="{ name: 'Outbox' }" :class="ROW" @click="close">
								<LucideIcon
									:name="offlineState.online ? 'cloud-check' : 'cloud-off'"
									:class="ICON"
								/>
								<span class="flex-1">{{ t("Offline & Sync") }}</span>
								<span v-if="toSync" :class="[ui.PILL, ui.TONE.amber]">{{
									toSync
								}}</span>
							</router-link>
							<button
								type="button"
								:class="ROW"
								@click="
									close();
									toggleNotifications();
								"
							>
								<LucideIcon name="bell" :class="ICON" />
								<span class="flex-1 text-left">{{ t("Notifications") }}</span>
								<span v-if="unreadCount" :class="[ui.PILL, ui.TONE.red]">{{
									unreadCount > 9 ? "9+" : unreadCount
								}}</span>
							</button>
						</div>

						<!-- Account. -->
						<div
							:class="[
								ui.CARD,
								'divide-y divide-gray-100 overflow-hidden dark:divide-gray-800',
							]"
						>
							<button
								type="button"
								:class="ROW"
								@click="
									close();
									accountActions.settings();
								"
							>
								<LucideIcon name="settings" :class="ICON" />
								<span class="flex-1 text-left">{{ t("Settings") }}</span>
							</button>
							<button type="button" :class="ROW" @click="accountActions.help()">
								<LucideIcon name="circle-question-mark" :class="ICON" />
								<span class="flex-1 text-left">{{ t("Help") }}</span>
							</button>
							<button type="button" :class="ROW" @click="accountActions.desk()">
								<LucideIcon name="layout-grid" :class="ICON" />
								<span class="flex-1 text-left">{{ t("Go to Desk") }}</span>
							</button>
							<button type="button" :class="ROW" @click="accountActions.clearData()">
								<LucideIcon name="refresh-cw" :class="ICON" />
								<span class="flex-1 text-left">{{ t("Clear site data") }}</span>
							</button>
							<button
								type="button"
								:class="[ROW, '!text-red-700 dark:!text-red-300']"
								@click="accountActions.logout()"
							>
								<LucideIcon name="log-out" class="h-5 w-5 flex-shrink-0" />
								<span class="flex-1 text-left">{{ t("Logout") }}</span>
							</button>
						</div>
					</div>
				</div>
			</Transition>
		</div>
	</Transition>
</template>

<script setup>
import { computed, watch } from "vue";
import { useRoute } from "vue-router";
import { Avatar } from "frappe-ui";
import { onKeyStroke } from "@vueuse/core";
import LucideIcon from "@/components/LucideIcon.vue";
import moduleIcon from "@/components/moduleIcon";
import { session } from "@/data/session";
import { modulesResource } from "@/data/modules";
import { userContextResource } from "@/data/userContext";
import { unreadCount, toggleNotifications } from "@/data/notifications";
import { offlineState } from "@/data/offline/state";
import { accountActions } from "@/data/accountActions";
import { t } from "@/data/i18n";
import * as ui from "@/data/ui";

const open = defineModel({ type: Boolean, default: false });
const route = useRoute();

// One look for every row: a big tap target (48px), icon then label.
const ROW =
	"flex w-full min-h-12 items-center gap-3 px-4 py-3 text-sm font-medium text-gray-800 active:bg-gray-50 dark:text-gray-200 dark:active:bg-gray-800";
const ICON = "h-5 w-5 flex-shrink-0 text-gray-500 dark:text-gray-400";

const modules = computed(() => (modulesResource.data || []).filter((m) => m.doctypes?.length));
const isPrivileged = computed(() => !!userContextResource.data?.is_privileged);
const toSync = computed(() => offlineState.pending + offlineState.errors + offlineState.conflicts);

function close() {
	open.value = false;
}

// Leaving the page (a link, Back) closes the sheet; so does Escape.
watch(() => route.fullPath, close);
onKeyStroke("Escape", () => open.value && close());
</script>

<style scoped>
.sheet-fade-enter-active,
.sheet-fade-leave-active {
	transition: opacity 0.2s ease;
}
.sheet-fade-enter-from,
.sheet-fade-leave-to {
	opacity: 0;
}
.sheet-up-enter-active,
.sheet-up-leave-active {
	transition: transform 0.25s ease;
}
.sheet-up-enter-from,
.sheet-up-leave-to {
	transform: translateY(100%);
}
</style>

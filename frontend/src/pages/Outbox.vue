<template>
	<AppLayout>
		<div :class="ui.PAGE">
			<PageHeader
				:description="t('Records saved on this phone and their sync with the server.')"
			>
				<template #title>
					<h1 class="text-lg font-semibold text-navy-900 dark:text-gray-100">
						{{ t("Offline & Sync") }}
					</h1>
				</template>
				<template #actions>
					<button
						type="button"
						:class="ui.BTN_PRIMARY"
						:disabled="!s.online || s.syncing || s.downloading"
						@click="syncNow()"
					>
						<LucideIcon
							name="refresh-cw"
							class="h-4 w-4"
							:class="{ 'animate-spin': s.syncing || s.downloading }"
						/>
						{{ t("Sync now") }}
					</button>
				</template>
			</PageHeader>

			<!-- Where things stand: network, last download, what waits. -->
			<div class="grid grid-cols-2 gap-3 lg:grid-cols-4">
				<div :class="[ui.CARD, 'p-4']">
					<p :class="ui.SECTION_LABEL">{{ t("Network") }}</p>
					<p
						class="mt-1 flex items-center gap-1.5 text-sm font-semibold"
						:class="
							s.online
								? 'text-forest-700 dark:text-forest-300'
								: 'text-amber-700 dark:text-amber-300'
						"
					>
						<LucideIcon
							:name="s.online ? 'cloud-check' : 'cloud-off'"
							class="h-4 w-4"
						/>
						{{ s.online ? t("Online") : t("Offline") }}
					</p>
				</div>
				<div :class="[ui.CARD, 'p-4']">
					<p :class="ui.SECTION_LABEL">{{ t("Last download") }}</p>
					<p class="mt-1 text-sm font-semibold text-navy-900 dark:text-gray-100">
						{{ lastSyncLabel }}
					</p>
				</div>
				<div :class="[ui.CARD, 'p-4']">
					<p :class="ui.SECTION_LABEL">{{ t("Waiting to sync") }}</p>
					<p class="mt-1 text-sm font-semibold text-navy-900 dark:text-gray-100">
						{{ s.pending }}
					</p>
				</div>
				<div :class="[ui.CARD, 'p-4']">
					<p :class="ui.SECTION_LABEL">{{ t("Need attention") }}</p>
					<p
						class="mt-1 text-sm font-semibold"
						:class="
							s.errors + s.conflicts
								? 'text-red-700 dark:text-red-300'
								: 'text-navy-900 dark:text-gray-100'
						"
					>
						{{ s.errors + s.conflicts }}
					</p>
				</div>
			</div>

			<div v-if="s.lastSyncError === 'login'" :class="ui.WARNING_BOX">
				<LucideIcon name="triangle-alert" class="h-5 w-5 flex-shrink-0" />
				<span>{{
					t(
						"Your login has expired on the server. Log out and log in again while online to sync - your saved records stay on this phone."
					)
				}}</span>
			</div>
			<div v-else-if="s.lastSyncError" :class="ui.WARNING_BOX">
				<LucideIcon name="triangle-alert" class="h-5 w-5 flex-shrink-0" />
				<span>{{ s.lastSyncError }}</span>
			</div>
			<div v-if="s.storageBlocked" :class="ui.WARNING_BOX">
				<LucideIcon name="triangle-alert" class="h-5 w-5 flex-shrink-0" />
				<span>{{
					t(
						"Another tab or window still has the older version of this app open, so offline storage cannot be prepared. Close every other CHW tab, then reload this page."
					)
				}}</span>
			</div>
			<div v-else-if="!s.ready" :class="ui.WARNING_BOX">
				<LucideIcon name="smartphone" class="h-5 w-5 flex-shrink-0" />
				<span>{{
					t(
						"This phone has no offline data yet. Stay online for a moment so the forms and your records can download."
					)
				}}</span>
			</div>

			<div v-if="!entries.length" :class="ui.EMPTY_STATE">
				<LucideIcon name="cloud-check" class="h-8 w-8 text-gray-300 dark:text-gray-600" />
				{{ t("Everything on this phone is synced.") }}
			</div>

			<div v-else class="space-y-3">
				<section v-for="entry in entries" :key="entry.id" :class="[ui.CARD, 'p-4']">
					<div class="flex flex-wrap items-start justify-between gap-3">
						<div class="min-w-0">
							<p :class="ui.SECTION_LABEL">{{ t(formLabel(entry.doctype)) }}</p>
							<p
								class="mt-0.5 truncate text-sm font-semibold text-navy-900 dark:text-gray-100"
							>
								{{ isTempName(entry.name) ? t("New record") : entry.name }}
								<span class="font-normal text-gray-500 dark:text-gray-400"
									>· {{ titleOf(entry) }}</span
								>
							</p>
							<p class="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
								{{ t("Saved on phone {0}", [when(entry.created)]) }}
							</p>
						</div>
						<span :class="[ui.PILL, statusTone(entry)]">{{ statusLabel(entry) }}</span>
					</div>

					<p
						v-if="entry.status === 'error'"
						class="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-800 dark:bg-red-900/30 dark:text-red-200"
					>
						{{ entry.error }}
					</p>
					<p
						v-else-if="entry.note"
						class="mt-3 text-sm text-gray-600 dark:text-gray-300"
					>
						{{ t("Waits for the record it is linked to, which has not synced yet.") }}
					</p>

					<!-- Conflict: the same fields were changed online too. Each side
          shown in full; the CHW keeps one. -->
					<div v-if="entry.status === 'conflict'" class="mt-3">
						<p class="mb-2 text-sm text-gray-700 dark:text-gray-300">
							{{
								t(
									"Someone changed this record on the server after this phone downloaded it. Choose which values to keep."
								)
							}}
						</p>
						<div :class="ui.TABLE_WRAP">
							<table :class="ui.TABLE">
								<thead :class="ui.THEAD">
									<tr>
										<th :class="ui.TH">{{ t("Field") }}</th>
										<th :class="ui.TH">{{ t("On this phone") }}</th>
										<th :class="ui.TH">{{ t("On the server") }}</th>
									</tr>
								</thead>
								<tbody :class="ui.TBODY">
									<tr v-for="field in entry.conflict_fields || []" :key="field">
										<td :class="ui.TD_STRONG">
											{{ t(fieldLabel(entry.doctype, field)) }}
										</td>
										<td :class="[ui.TD, 'whitespace-normal']">
											{{
												show(entry.doctype, field, entry.changes?.[field])
											}}
										</td>
										<td :class="[ui.TD, 'whitespace-normal']">
											{{
												show(
													entry.doctype,
													field,
													entry.server_doc?.[field]
												)
											}}
										</td>
									</tr>
								</tbody>
							</table>
						</div>
					</div>

					<div class="mt-3 flex flex-wrap gap-2">
						<template v-if="entry.status === 'conflict'">
							<button
								type="button"
								:class="ui.BTN_PRIMARY"
								:disabled="busy === entry.id || !s.online"
								@click="act(entry, () => resolveConflict(entry, 'mine'))"
							>
								<LucideIcon name="smartphone" class="h-4 w-4" />
								{{ t("Keep mine") }}
							</button>
							<button
								type="button"
								:class="ui.BTN_SECONDARY"
								:disabled="busy === entry.id"
								@click="act(entry, () => resolveConflict(entry, 'server'))"
							>
								<LucideIcon name="server" class="h-4 w-4" />
								{{ t("Keep server's") }}
							</button>
						</template>
						<router-link
							v-if="routeOf(entry)"
							:to="routeOf(entry)"
							:class="ui.BTN_SECONDARY"
						>
							<LucideIcon name="external-link" class="h-4 w-4" />
							{{ entry.status === "error" ? t("Open and fix") : t("Open") }}
						</router-link>
						<button
							v-if="entry.status === 'error'"
							type="button"
							:class="ui.BTN_SECONDARY"
							:disabled="busy === entry.id || !s.online"
							@click="act(entry, () => retry(entry))"
						>
							<LucideIcon name="rotate-ccw" class="h-4 w-4" />
							{{ t("Try again") }}
						</button>
						<button
							v-if="entry.status !== 'syncing'"
							type="button"
							class="inline-flex h-9 items-center gap-1.5 rounded-lg px-3 text-sm font-medium text-red-700 hover:bg-red-50 dark:text-red-300 dark:hover:bg-red-900/30"
							:disabled="busy === entry.id"
							@click="confirmDiscard = entry"
						>
							<LucideIcon name="trash-2" class="h-4 w-4" />
							{{ t("Discard") }}
						</button>
					</div>
				</section>
			</div>

			<div class="flex flex-wrap gap-2">
				<button
					type="button"
					:class="ui.BTN_SECONDARY"
					:disabled="!s.online || s.downloading"
					@click="syncNow({ full: true })"
				>
					<LucideIcon name="download" class="h-4 w-4" />
					{{ t("Download all again") }}
				</button>
			</div>

			<Dialog
				:model-value="!!confirmDiscard"
				:options="{ title: t('Discard this change?'), size: 'sm' }"
				@update:model-value="(v) => !v && (confirmDiscard = null)"
			>
				<template #body-content>
					<p class="text-sm text-gray-600 dark:text-gray-300">
						{{
							confirmDiscard?.action === "insert"
								? t(
										"This new record was never sent to the server. Discarding deletes it from this phone for good."
								  )
								: t(
										"Your offline changes to this record are thrown away and the server version is kept."
								  )
						}}
					</p>
				</template>
				<template #actions>
					<div class="flex justify-end gap-2">
						<button
							type="button"
							:class="ui.BTN_SECONDARY"
							@click="confirmDiscard = null"
						>
							{{ t("Cancel") }}
						</button>
						<button
							type="button"
							class="inline-flex h-9 items-center gap-1.5 rounded-lg bg-red-600 px-3 text-sm font-semibold text-white hover:bg-red-700"
							@click="doDiscard"
						>
							<LucideIcon name="trash-2" class="h-4 w-4" />
							{{ t("Discard") }}
						</button>
					</div>
				</template>
			</Dialog>
		</div>
	</AppLayout>
</template>

<script setup>
import { computed, onBeforeUnmount, ref, watch } from "vue";
import { Dialog, toast } from "frappe-ui";
import AppLayout from "@/layouts/AppLayout.vue";
import PageHeader from "@/components/PageHeader.vue";
import LucideIcon from "@/components/LucideIcon.vue";
import { offlineState as s } from "@/data/offline/state";
import { getMeta, getRecord, isTempName, outboxEntries } from "@/data/offline/store";
import { discard, resolveConflict, retry, syncNow } from "@/data/offline/sync";
import { findModuleByDoctype } from "@/data/modules";
import { formatFieldValue } from "@/data/recordFormat";
import { setPageTitle } from "@/data/pageTitle";
import { dateLocale, t } from "@/data/i18n";
import * as ui from "@/data/ui";

setPageTitle("Offline & Sync");

const entries = ref([]);
const metas = ref({});
const titles = ref({});
const busy = ref(null);
const confirmDiscard = ref(null);

// Re-read whenever the counts move (a sync finished, a save was queued).
async function load() {
	const list = await outboxEntries();
	for (const e of list) {
		if (!metas.value[e.doctype]) metas.value[e.doctype] = await getMeta(e.doctype);
		const meta = metas.value[e.doctype];
		const record = await getRecord(e.doctype, e.name);
		titles.value[e.id] = meta?.title_field ? record?.[meta.title_field] || "" : "";
	}
	entries.value = list;
}
watch(() => [s.pending, s.errors, s.conflicts, s.syncing], load, { immediate: true });
const poll = setInterval(load, 5000);
onBeforeUnmount(() => clearInterval(poll));

const lastSyncLabel = computed(() => (s.lastSync ? when(s.lastSync) : t("Never")));

function when(value) {
	const d = new Date(String(value || "").replace(" ", "T"));
	return isNaN(d)
		? ""
		: d.toLocaleString(dateLocale(), {
				day: "2-digit",
				month: "short",
				hour: "2-digit",
				minute: "2-digit",
		  });
}

function formLabel(doctype) {
	return findModuleByDoctype(doctype)?.label || doctype;
}

function titleOf(entry) {
	return titles.value[entry.id] || "";
}

function fieldOf(doctype, fieldname) {
	return metas.value[doctype]?.fields?.find((f) => f.fieldname === fieldname);
}

function fieldLabel(doctype, fieldname) {
	return fieldOf(doctype, fieldname)?.label || fieldname;
}

function show(doctype, fieldname, value) {
	if (Array.isArray(value))
		return value.length === 1 ? t("1 row") : t("{0} rows", [value.length]);
	const field = fieldOf(doctype, fieldname);
	const text = field ? formatFieldValue(value, field) : value;
	return text === "" || text == null ? "—" : String(text);
}

function routeOf(entry) {
	const item = findModuleByDoctype(entry.doctype);
	if (!item) return null;
	return { name: "DoctypeForm", params: { doctypeRoute: item.route, name: entry.name } };
}

function statusLabel(entry) {
	if (entry.status === "conflict") return t("Conflict");
	if (entry.status === "error") return t("Refused by server");
	if (entry.note) return t("Waiting");
	return entry.action === "insert" ? t("New - to sync") : t("Edited - to sync");
}

function statusTone(entry) {
	if (entry.status === "conflict" || entry.status === "error") return ui.TONE.red;
	return ui.TONE.amber;
}

async function act(entry, fn) {
	busy.value = entry.id;
	try {
		await fn();
	} catch (e) {
		toast.error(e?.message || t("Could not sync."));
	} finally {
		busy.value = null;
		load();
	}
}

async function doDiscard() {
	const entry = confirmDiscard.value;
	confirmDiscard.value = null;
	await act(entry, () => discard(entry));
	toast.success(t("Discarded"));
}
</script>

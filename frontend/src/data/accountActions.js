// The account actions (Settings, Help, Clear site data, Desk, Logout) -
// shared by the desktop sidebar's menu and the phone's Menu sheet, so both
// behave the same, including the unsynced-records warning.

import { clearSiteData } from "@/data/clearSiteData";
import { logoutResource } from "@/data/session";
import { openSettingsDialog } from "@/data/settingsDialog";
import { offlineState } from "@/data/offline/state";
import { t } from "@/data/i18n";

// Logging out or clearing site data wipes the phone's copy - records saved
// offline that haven't reached the server would be lost for good.
export function confirmUnsyncedLoss() {
	const count = offlineState.pending + offlineState.errors + offlineState.conflicts;
	if (!count) return true;
	return window.confirm(
		t(
			"{0} record(s) saved on this phone have not synced yet and will be lost. Sync first (connect to the internet) unless you are sure. Continue anyway?",
			[count]
		)
	);
}

export const accountActions = {
	settings: () => openSettingsDialog(),
	help: () => window.open("https://frappeframework.com/docs", "_blank", "noopener"),
	clearData: () => {
		if (
			window.confirm(t("This clears cached app data and reloads the page. Continue?")) &&
			confirmUnsyncedLoss()
		) {
			clearSiteData();
		}
	},
	desk: () => window.open("/app", "_self"),
	logout: () => confirmUnsyncedLoss() && logoutResource.submit(),
};

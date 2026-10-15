// "Auto-translate CHW" on Desk's Translation list: fill the list for one
// language in a click instead of typing 3,000+ texts by hand. Pick the
// language, see how many CHW texts still need translating, Translate all -
// a background job adds them as Translation records marked "Pending" for
// review (chw/translation_tool.py).

frappe.listview_settings["Translation"] = frappe.listview_settings["Translation"] || {};
const chw_previous_onload = frappe.listview_settings["Translation"].onload;

frappe.listview_settings["Translation"].onload = function (listview) {
	if (chw_previous_onload) chw_previous_onload(listview);
	if (!frappe.model.can_create("Translation")) return;
	listview.page.add_inner_button(__("Auto-translate CHW"), () =>
		chw_open_auto_translate(listview)
	);
};

function chw_open_auto_translate(listview) {
	frappe
		.call("chw.translation_tool.get_language_options")
		.then((r) => chw_build_dialog(listview, r.message || []));
}

function chw_build_dialog(listview, languages) {
	const dialog = new frappe.ui.Dialog({
		title: __("Auto-translate CHW"),
		fields: [
			{
				// A plain dropdown with English names - Frappe's Language list
				// names each language in its own script, so searching "Tamil"
				// in a Link box found nothing.
				fieldname: "language",
				fieldtype: "Select",
				label: __("Language"),
				reqd: 1,
				options: [{ value: "", label: "" }, ...languages],
				onchange: () => chw_show_status(dialog),
			},
			{ fieldname: "status", fieldtype: "HTML" },
		],
		primary_action_label: __("Translate all"),
		primary_action(values) {
			frappe
				.call({
					method: "chw.translation_tool.start_auto_translate",
					args: { language: values.language },
					freeze: true,
				})
				.then((r) => {
					const queued = r.message?.queued || 0;
					dialog.hide();
					if (!queued) {
						frappe.msgprint(
							__("Every CHW text already has a {0} translation.", [values.language])
						);
						return;
					}
					chw_follow_progress(values.language, queued, listview);
				});
		},
	});
	dialog.show();
}

function chw_show_status(dialog) {
	const language = dialog.get_value("language");
	const $status = dialog.fields_dict.status.$wrapper;
	if (!language) {
		$status.empty();
		dialog.chw_status_for = null;
		return;
	}
	if (dialog.chw_status_for === language) return;
	dialog.chw_status_for = language;
	$status.html(`<p class="text-muted">${__("Checking…")}</p>`);
	frappe
		.call({
			method: "chw.translation_tool.get_auto_translate_status",
			args: { language },
		})
		.then((r) => {
			const s = r.message || {};
			$status.html(`
			<p>${__("{0} of {1} CHW texts have no {2} translation yet.", [s.missing, s.total, language])}</p>
			<p class="text-muted small">${__(
				"They are added as Translation records with status Pending - review and correct medical terms, then set them to Verified. Existing translations and your corrections are never overwritten."
			)}</p>
			<p class="text-muted small">${__("Engine")}: ${frappe.utils.escape_html(s.engine || "")}</p>
		`);
		});
}

function chw_follow_progress(language, total, listview) {
	frappe.show_progress(__("Translating to {0}", [language]), 0, total, __("Starting…"));
	const on_progress = (data) => {
		if (data.language !== language) return;
		frappe.show_progress(
			__("Translating to {0}", [language]),
			data.done,
			data.total,
			`${data.done} / ${data.total}`
		);
	};
	const on_done = (data) => {
		if (data.language !== language) return;
		frappe.realtime.off("chw_auto_translate_progress", on_progress);
		frappe.realtime.off("chw_auto_translate_done", on_done);
		frappe.hide_progress();
		frappe.msgprint({
			title: __("Auto-translate finished"),
			indicator: data.failed ? "orange" : "green",
			message: __("{0}: {1} translations added, {2} failed (see Error Log), engine {3}.", [
				language,
				data.added,
				data.failed,
				frappe.utils.escape_html(data.engine),
			]),
		});
		listview.refresh();
	};
	frappe.realtime.on("chw_auto_translate_progress", on_progress);
	frappe.realtime.on("chw_auto_translate_done", on_done);
}

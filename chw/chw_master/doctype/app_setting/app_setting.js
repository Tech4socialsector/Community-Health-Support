// Copyright (c) 2026, tech4socialsector@azimpremjifoundation.org and contributors
// For license information, please see license.txt

frappe.ui.form.on("App Setting", {
	// Field selection per organisation (chw/field_settings.py): tick the
	// questions this site uses; unticked ones are hidden in Desk and the app.
	// Locked ones (needed by the screening's own rules) can't be unticked.
	choose_msf_fields(frm) {
		choose_form_fields(frm, "Main Screening Form");
	},
});

function choose_form_fields(frm, form) {
	frappe.call({ method: "chw.field_settings.get_form_fields", args: { form } }).then((r) => {
		const sections = r.message || [];
		const fields = [
			{
				fieldtype: "HTML",
				options: `<p class="text-muted small">${__(
					"Untick the questions this organisation doesn't use. They're hidden in Desk and the app, and never block Save. Ticking one again brings it back with its data. 🔒 = needed by the app, always shown."
				)}</p>`,
			},
		];
		sections.forEach((sec, i) => {
			fields.push({ fieldtype: "Section Break", label: sec.label, collapsible: i > 0 ? 1 : 0 });
			sec.fields.forEach((f, j) => {
				if (j && j % Math.ceil(sec.fields.length / 2) === 0) fields.push({ fieldtype: "Column Break" });
				fields.push({
					fieldtype: "Check",
					fieldname: `f__${f.fieldname}`,
					label: f.locked ? `${f.label} 🔒` : f.label,
					default: f.shown ? 1 : 0,
					read_only: f.locked ? 1 : 0,
				});
			});
		});

		const dialog = new frappe.ui.Dialog({
			title: __("Choose {0} fields", [__(form)]),
			size: "large",
			fields,
			primary_action_label: __("Save"),
			primary_action(values) {
				const hidden = [];
				sections.forEach((sec) =>
					sec.fields.forEach((f) => {
						if (!f.locked && !values[`f__${f.fieldname}`]) hidden.push(f.fieldname);
					})
				);
				let all = {};
				try {
					all = JSON.parse(frm.doc.hidden_form_fields || "{}") || {};
				} catch (e) {
					all = {};
				}
				if (hidden.length) all[form] = hidden.sort();
				else delete all[form];
				frm.set_value("hidden_form_fields", Object.keys(all).length ? JSON.stringify(all) : "");
				dialog.hide();
				frm.save();
			},
		});
		dialog.show();
	});
}

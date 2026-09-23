// Copyright (c) 2026, tech4socialsector@azimpremjifoundation.org and contributors
// For license information, please see license.txt

// New Work Order List: Today / Upcoming / Overdue visits across the 5
// programs this team actually runs (ANC, PNC, Palliative Care, Postpartum
// 1-6 weeks, Child 6wk-1 year), always relative to the real current date.
// Separate page, separate backend functions
// (chw.api.get_chw_work_order_summary / chw_work_order_drilldown /
// chw_work_order_drilldown_excel) - does not read from or modify
// chw-visit-dashboard's own "My Worklist" section or its
// chw_worklist_summary function.

frappe.pages['chw-work-order-list'].on_page_load = function (wrapper) {
	let page = frappe.ui.make_app_page({
		parent: wrapper,
		title: 'Work Order List',
		single_column: true,
	});

	let isPrivileged = false;
	let villageOptions = ['All Villages'];
	let healthWorkerOptions = ['All Health Workers'];
	let summary = { today: 0, upcoming: 0, overdue: 0, by_type: [], health_worker_linked: true };
	let allRecords = [];

	let selectedFilters = {
		status: 'all',
		visit_type: '',
	};

	const VISIT_TYPES = ['ANC', 'PNC', 'Palliative Care', 'Postpartum (1-6 weeks)', 'Child (6 wk-1 year)'];
	const STATUS_CARDS = [
		{ key: 'today', label: 'Today', color: '#2563EB' },
		{ key: 'upcoming', label: 'Upcoming', color: '#C2540A' },
		{ key: 'overdue', label: 'Overdue / Missed', color: '#B91C1C' },
	];

	function loadOptionsThenRender() {
		frappe.call({ method: 'chw.api.get_current_user_context' }).then((r) => {
			isPrivileged = !!(r.message && r.message.is_privileged);
			if (isPrivileged) {
				frappe.call({ method: 'chw.api.get_villages' }).then((vr) => {
					villageOptions = ['All Villages'].concat(vr.message || []);
					frappe.call({ method: 'chw.api.get_health_workers' }).then((hr) => {
						healthWorkerOptions = ['All Health Workers'].concat(hr.message || []);
						loadAndRender();
					});
				});
			} else {
				loadAndRender();
			}
		});
	}

	function loadAndRender() {
		frappe.call({
			method: 'chw.api.get_chw_work_order_summary',
			args: {
				village: selectedFilters.village,
				health_worker: selectedFilters.health_worker,
				visit_type: selectedFilters.visit_type || undefined,
			},
			callback: function (r) {
				summary = r.message || summary;
				loadRecordsThenRender();
			},
		});
	}

	function loadRecordsThenRender() {
		frappe.call({
			method: 'chw.api.chw_work_order_drilldown',
			args: {
				status: selectedFilters.status,
				village: selectedFilters.village,
				health_worker: selectedFilters.health_worker,
				visit_type: selectedFilters.visit_type || undefined,
			},
			callback: function (r) {
				allRecords = (r.message && r.message.records) || [];
				render();
			},
		});
	}

	function badgeHtml() {
		let who = frappe.session.user_fullname || frappe.session.user;
		let role = isPrivileged ? 'Coordinator' : 'CHW Health Worker';
		return `Signed in as: ${frappe.utils.escape_html(who)} (${role})`;
	}

	function chipHtml(label, count) {
		return `<span style="font-size: 12px; font-weight: 600; color: #374151; border: 1px dashed #D1D5DB; border-radius: 999px; padding: 5px 12px;">${frappe.utils.escape_html(label)} &middot; ${count}</span>`;
	}

	function statusCardHtml(card) {
		let active = selectedFilters.status === card.key;
		return `
			<div class="wol-status-card" data-key="${card.key}" style="cursor: pointer; background: #FFFFFF; border: 1px solid ${active ? card.color : '#E5E7EB'}; border-top: 3px solid ${card.color}; border-radius: 10px; padding: 20px; ${active ? 'box-shadow: 0 0 0 1px ' + card.color + ';' : ''}">
				<div style="font-size: 30px; font-weight: 800; color: #111827;">${summary[card.key]}</div>
				<div style="font-size: 13px; font-weight: 600; color: #6B7280; margin-top: 6px;">${card.label}</div>
			</div>
		`;
	}

	function byTypeCountFor(t) {
		if (selectedFilters.status === 'all') return t.today + t.upcoming + t.overdue;
		return t[selectedFilters.status] || 0;
	}

	function render() {
		let filterRow = `
			<div style="display: flex; flex-direction: column; gap: 4px;">
				<label style="font-size: 11px; font-weight: 600; color: #B91C1C; text-transform: uppercase; letter-spacing: 0.04em;">Status</label>
				<select id="wol-status" class="form-control" style="height: 34px; width: 150px;">
					<option value="all" ${selectedFilters.status === 'all' ? 'selected' : ''}>All</option>
					<option value="today" ${selectedFilters.status === 'today' ? 'selected' : ''}>Today</option>
					<option value="upcoming" ${selectedFilters.status === 'upcoming' ? 'selected' : ''}>Upcoming</option>
					<option value="overdue" ${selectedFilters.status === 'overdue' ? 'selected' : ''}>Overdue</option>
				</select>
			</div>
			<div style="display: flex; flex-direction: column; gap: 4px;">
				<label style="font-size: 11px; font-weight: 600; color: #2563EB; text-transform: uppercase; letter-spacing: 0.04em;">Visit Type</label>
				<select id="wol-visit-type" class="form-control" style="height: 34px; width: 190px;">
					<option value="">All Visit Types</option>
					${VISIT_TYPES.map((v) => `<option value="${v}" ${selectedFilters.visit_type === v ? 'selected' : ''}>${v}</option>`).join('')}
				</select>
			</div>
		`;

		let coordinatorFilters = isPrivileged
			? `
			<div style="display: flex; flex-direction: column; gap: 4px;">
				<label style="font-size: 11px; font-weight: 600; color: #9333EA; text-transform: uppercase; letter-spacing: 0.04em;">Village</label>
				<select id="wol-village" class="form-control" style="height: 34px; width: 150px;">
					${villageOptions.map((v) => `<option value="${v}" ${selectedFilters.village === v ? 'selected' : ''}>${v}</option>`).join('')}
				</select>
			</div>
			<div style="display: flex; flex-direction: column; gap: 4px;">
				<label style="font-size: 11px; font-weight: 600; color: #0D9488; text-transform: uppercase; letter-spacing: 0.04em;">Health Worker</label>
				<select id="wol-health-worker" class="form-control" style="height: 34px; width: 170px;">
					${healthWorkerOptions.map((v) => `<option value="${v}" ${selectedFilters.health_worker === v ? 'selected' : ''}>${v}</option>`).join('')}
				</select>
			</div>
		`
			: '';

		let noHealthWorker = !isPrivileged && summary.health_worker_linked === false
			? `<div style="background:#FFF3CD; border:1px solid #FFE69C; color:#664D03; padding:12px 16px; border-radius:8px; margin-bottom:18px;">No Health Worker record is linked to your login. Ask your coordinator to set the <strong>User</strong> field on your Health Worker record so your work order list can show here.</div>`
			: '';

		let byTypeChips = (summary.by_type || []).map((t) => chipHtml(t.label, byTypeCountFor(t))).join('');

		let rows = allRecords
			.map((r) => {
				let statusColor =
					r.status === 'Overdue'
						? 'background:#FEE2E2;color:#B91C1C;'
						: r.status === 'Upcoming'
						? 'background:#FFEDD5;color:#C2540A;'
						: 'background:#DBEAFE;color:#1D4ED8;';
				return `
				<tr data-doctype="${r.doctype}" data-name="${frappe.utils.escape_html(r.name)}" style="cursor: pointer;">
					<td style="padding: 11px 8px; font-size: 13px; font-weight: 600; color: #1F2937;">${frappe.utils.escape_html(r.patient || r.name)}</td>
					<td style="padding: 11px 8px; font-size: 13px; color: #6B7280;">${frappe.utils.escape_html(r.visit_type)}</td>
					<td style="padding: 11px 8px; font-size: 13px; color: #6B7280;">${frappe.utils.escape_html(r.village || '-')}</td>
					<td style="padding: 11px 8px; font-size: 13px; color: #6B7280;">${r.due_date ? frappe.datetime.str_to_user(r.due_date) : '-'}</td>
					<td style="padding: 11px 8px;"><span style="font-size: 11px; font-weight: 700; padding: 3px 9px; border-radius: 999px; ${statusColor}">${r.status}</span></td>
				</tr>
			`;
			})
			.join('');

		let html = `
			<div style="padding: 8px 4px 28px 4px;">
				<div style="display: flex; align-items: center; justify-content: space-between; gap: 16px; flex-wrap: wrap; background: #ECFDF5; border: 1px solid #A7F3D0; border-radius: 12px; padding: 14px 20px; margin-bottom: 22px;">
					<div style="display: flex; align-items: center; gap: 12px;">
						<span style="width: 40px; height: 40px; border-radius: 10px; background: #0D9488; color: #FFFFFF; display: flex; align-items: center; justify-content: center; font-size: 16px; font-weight: 800; flex-shrink: 0;">C</span>
						<div style="display: flex; flex-direction: column;">
							<span style="font-size: 16px; font-weight: 800; color: #065F46;">CHW App</span>
							<span style="font-size: 12px; color: #047857;">Work Order List</span>
						</div>
					</div>
					<div style="display: flex; align-items: center; gap: 14px;">
						<span style="font-size: 11px; font-weight: 700; color: #0D9488; background: #CCFBF1; padding: 4px 10px; border-radius: 999px;">${badgeHtml()}</span>
					</div>
				</div>

				<div style="display: flex; align-items: flex-end; justify-content: center; gap: 10px; flex-wrap: wrap; background: #FAFAF8; border: 1px solid #EDEBE5; border-radius: 10px; padding: 14px 16px; margin-bottom: 22px;">
					${filterRow}
					${coordinatorFilters}
				</div>

				${noHealthWorker}

				<div style="display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 16px; margin-bottom: 18px;">
					${STATUS_CARDS.map(statusCardHtml).join('')}
				</div>

				<div style="margin-bottom: 18px;">
					<span style="font-size: 11px; font-weight: 700; letter-spacing: 0.04em; text-transform: uppercase; color: #9CA3AF;">By visit type</span>
					<div style="display: flex; gap: 8px; margin-top: 8px; flex-wrap: wrap;">${byTypeChips}</div>
				</div>

				<div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px;">
					<input type="text" id="wol-search" class="form-control" placeholder="Search by patient name" style="width: 260px;">
					<button class="btn btn-default" id="wol-export" style="height: 34px;">Download Excel</button>
				</div>

				<table class="table table-bordered" id="wol-table" style="width: 100%;">
					<thead>
						<tr>
							<th>Patient</th>
							<th>Visit Type</th>
							<th>Village</th>
							<th>Due Date</th>
							<th>Status</th>
						</tr>
					</thead>
					<tbody>
						${rows || '<tr><td colspan="5" style="color:#9CA3AF;padding:20px;text-align:center;">No records for this selection.</td></tr>'}
					</tbody>
				</table>
			</div>
		`;

		page.main.html(html);

		page.main.find('.wol-status-card').on('click', function () {
			let key = $(this).data('key');
			selectedFilters.status = selectedFilters.status === key ? 'all' : key;
			loadRecordsThenRender();
		});
		page.main.find('#wol-status').on('change', function () {
			selectedFilters.status = $(this).val();
			loadRecordsThenRender();
		});
		page.main.find('#wol-visit-type').on('change', function () {
			selectedFilters.visit_type = $(this).val();
			loadAndRender();
		});
		page.main.find('#wol-village').on('change', function () {
			selectedFilters.village = $(this).val();
			loadAndRender();
		});
		page.main.find('#wol-health-worker').on('change', function () {
			selectedFilters.health_worker = $(this).val();
			loadAndRender();
		});
		page.main.find('#wol-search').on('input', function () {
			let q = $(this).val().toLowerCase();
			page.main.find('#wol-table tbody tr').each(function () {
				$(this).toggle($(this).text().toLowerCase().indexOf(q) !== -1);
			});
		});
		page.main.find('#wol-export').on('click', function () {
			let params = new URLSearchParams({
				status: selectedFilters.status,
				village: selectedFilters.village || '',
				health_worker: selectedFilters.health_worker || '',
				visit_type: selectedFilters.visit_type || '',
			});
			window.open(`/api/method/chw.api.chw_work_order_drilldown_excel?${params.toString()}`, '_blank');
		});
		page.main.find('#wol-table tbody tr[data-name]').on('click', function () {
			let doctype = $(this).data('doctype');
			let name = $(this).data('name');
			if (doctype && name) {
				frappe.set_route('Form', doctype, name);
			}
		});
	}

	loadOptionsThenRender();
};

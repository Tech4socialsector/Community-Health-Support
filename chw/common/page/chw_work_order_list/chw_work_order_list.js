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
	let summary = { this_week: 0, today: 0, upcoming: 0, overdue: 0, completed: 0, high_risk: 0, by_type: [], health_worker_linked: true };
	let allRecords = [];
	let totalCount = 0;

	// status starts unselected ('') - the landing view shows only the
	// summary cards, nothing drilled into yet. Clicking a card (or picking
	// one from the Status dropdown) opens the drilldown popup instead of
	// expanding inline - the filters, search, export and table all live
	// inside that dialog too (not just on the main page behind it, which
	// the modal backdrop would make unreachable while it's open).
	let selectedFilters = {
		status: '',
		visit_type: '',
		risk: '',
	};
	// Next/Previous pagination (same pattern as the CHW Dashboard popup) in
	// place of Frappe's standard 20/100/500/2500 page-size selector.
	const PAGE_SIZE = 100;
	let pageOffset = 0;

	let drilldownDialog = null;

	const VISIT_TYPES = ['ANC', 'PNC', 'Palliative Care', 'Postpartum (1-6 weeks)', 'Child (6 wk-1 year)'];
	// This Week is the working list for the week (any day Mon-Sun); Today is
	// just that same list filtered down to date == today, not a separate
	// count - see the backend's own get_chw_work_order_summary. Upcoming is
	// a rolling 30-days-from-today view, not "later this week" and not
	// "rest of this calendar month" (that gap - a visit due just after
	// month-end - used to fall through the cracks). Completed is followups
	// actually logged this week, kept separate from the other 4 (which are
	// all "still pending") so it never gets mixed into "All". High Risk is
	// a risk-status view, not a due-date bucket - every currently High Risk
	// patient, regardless of when her next visit lands. Not a subset of the
	// other 5 and not part of "All" for the same reason Completed isn't -
	// mixing it in would double-count patients who are both High Risk and,
	// say, due This Week.
	const STATUS_CARDS = [
		{ key: 'this_week', label: 'This Week', color: '#7C3AED' },
		{ key: 'today', label: 'Today', color: '#2563EB' },
		{ key: 'upcoming', label: 'Upcoming (30 days)', color: '#C2540A' },
		{ key: 'overdue', label: 'Overdue / Missed', color: '#B91C1C' },
		{ key: 'completed', label: 'Completed (this week)', color: '#15803D' },
		{ key: 'high_risk', label: 'High Risk', color: '#9F1239' },
	];
	// Exact same colors as the cards above - every status label's badge in
	// the drilldown table is styled from this one shared map, so the two
	// can never drift out of sync with each other again.
	const STATUS_ROW_COLORS = {
		'This Week': { bg: '#F3E8FF', text: '#7C3AED' },
		'Today': { bg: '#DBEAFE', text: '#2563EB' },
		'Upcoming': { bg: '#FFEDD5', text: '#C2540A' },
		'Overdue': { bg: '#FEE2E2', text: '#B91C1C' },
		'Completed': { bg: '#DCFCE7', text: '#15803D' },
		'High Risk': { bg: '#FCE7F3', text: '#9F1239' },
	};

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
		// Nothing selected yet (landing view) - don't bother fetching records
		// at all, and make sure the popup isn't left open from before.
		if (!selectedFilters.status) {
			allRecords = [];
			totalCount = 0;
			if (drilldownDialog) drilldownDialog.hide();
			render();
			return;
		}
		frappe.call({
			method: 'chw.api.chw_work_order_drilldown',
			args: {
				status: selectedFilters.status,
				village: selectedFilters.village,
				health_worker: selectedFilters.health_worker,
				visit_type: selectedFilters.visit_type || undefined,
				page_length: PAGE_SIZE,
				start: pageOffset,
			},
			callback: function (r) {
				allRecords = (r.message && r.message.records) || [];
				totalCount = (r.message && r.message.total_count) || 0;
				render();
				showDrilldownDialog();
			},
		});
	}

	function badgeHtml() {
		let who = frappe.session.user_fullname || frappe.session.user;
		let role = isPrivileged ? 'Coordinator' : 'CHW Health Worker';
		return `Signed in as: ${frappe.utils.escape_html(who)} (${role})`;
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

	// Shared by both the main landing page and the drilldown popup, so the
	// exact same Status/Visit Type/Risk filters are usable in either place -
	// necessary for the popup specifically, since its own modal backdrop
	// would otherwise block reaching the main page's copy while it's open.
	function filterRowHtml() {
		return `
			<div style="display: flex; flex-direction: column; gap: 4px;">
				<label style="font-size: 11px; font-weight: 600; color: #B91C1C; text-transform: uppercase; letter-spacing: 0.04em;">Status</label>
				<select class="wol-status form-control" style="height: 34px; width: 170px;">
					<option value="" ${!selectedFilters.status ? 'selected' : ''}>Select...</option>
					<option value="all" ${selectedFilters.status === 'all' ? 'selected' : ''}>All (pending)</option>
					<option value="this_week" ${selectedFilters.status === 'this_week' ? 'selected' : ''}>This Week</option>
					<option value="today" ${selectedFilters.status === 'today' ? 'selected' : ''}>Today</option>
					<option value="upcoming" ${selectedFilters.status === 'upcoming' ? 'selected' : ''}>Upcoming (30 days)</option>
					<option value="overdue" ${selectedFilters.status === 'overdue' ? 'selected' : ''}>Overdue</option>
					<option value="completed" ${selectedFilters.status === 'completed' ? 'selected' : ''}>Completed (week)</option>
					<option value="high_risk" ${selectedFilters.status === 'high_risk' ? 'selected' : ''}>High Risk</option>
				</select>
			</div>
			<div style="display: flex; flex-direction: column; gap: 4px;">
				<label style="font-size: 11px; font-weight: 600; color: #2563EB; text-transform: uppercase; letter-spacing: 0.04em;">Visit Type</label>
				<select class="wol-visit-type form-control" style="height: 34px; width: 190px;">
					<option value="">All Visit Types</option>
					${VISIT_TYPES.map((v) => `<option value="${v}" ${selectedFilters.visit_type === v ? 'selected' : ''}>${v}</option>`).join('')}
				</select>
			</div>
			<div style="display: flex; flex-direction: column; gap: 4px;">
				<label style="font-size: 11px; font-weight: 600; color: #B91C1C; text-transform: uppercase; letter-spacing: 0.04em;">Risk</label>
				<select class="wol-risk form-control" style="height: 34px; width: 150px;">
					<option value="" ${selectedFilters.risk === '' ? 'selected' : ''}>All</option>
					<option value="high_risk" ${selectedFilters.risk === 'high_risk' ? 'selected' : ''}>High Risk</option>
					<option value="normal" ${selectedFilters.risk === 'normal' ? 'selected' : ''}>Normal</option>
				</select>
			</div>
			${
				isPrivileged
					? `
			<div style="display: flex; flex-direction: column; gap: 4px;">
				<label style="font-size: 11px; font-weight: 600; color: #9333EA; text-transform: uppercase; letter-spacing: 0.04em;">Village</label>
				<select class="wol-village form-control" style="height: 34px; width: 150px;">
					${villageOptions.map((v) => `<option value="${v}" ${selectedFilters.village === v ? 'selected' : ''}>${v}</option>`).join('')}
				</select>
			</div>
			<div style="display: flex; flex-direction: column; gap: 4px;">
				<label style="font-size: 11px; font-weight: 600; color: #0D9488; text-transform: uppercase; letter-spacing: 0.04em;">Health Worker</label>
				<select class="wol-health-worker form-control" style="height: 34px; width: 170px;">
					${healthWorkerOptions.map((v) => `<option value="${v}" ${selectedFilters.health_worker === v ? 'selected' : ''}>${v}</option>`).join('')}
				</select>
			</div>
			`
					: ''
			}
		`;
	}

	// Attaches the filter handlers within whichever container they're
	// rendered in ($container is either page.main or the popup's own body) -
	// a no-op for any selector that doesn't exist in that container.
	function wireFilterEvents($container) {
		$container.find('.wol-status').on('change', function () {
			selectedFilters.status = $(this).val();
			pageOffset = 0;
			loadRecordsThenRender();
		});
		$container.find('.wol-visit-type').on('change', function () {
			selectedFilters.visit_type = $(this).val();
			pageOffset = 0;
			loadAndRender();
		});
		$container.find('.wol-risk').on('change', function () {
			// Risk only re-filters the records already fetched - no need to
			// hit the server again for this one.
			selectedFilters.risk = $(this).val();
			if (drilldownDialog && selectedFilters.status) {
				drilldownDialog.fields_dict.drilldown_body.$wrapper.html(drilldownBodyHtml());
				wireDrilldownEvents();
			}
		});
		$container.find('.wol-village').on('change', function () {
			selectedFilters.village = $(this).val();
			pageOffset = 0;
			loadAndRender();
		});
		$container.find('.wol-health-worker').on('change', function () {
			selectedFilters.health_worker = $(this).val();
			pageOffset = 0;
			loadAndRender();
		});
	}

	function render() {
		let noHealthWorker = !isPrivileged && summary.health_worker_linked === false
			? `<div style="background:#FFF3CD; border:1px solid #FFE69C; color:#664D03; padding:12px 16px; border-radius:8px; margin-bottom:18px;">No Health Worker record is linked to your login. Ask your coordinator to set the <strong>User</strong> field on your Health Worker record so your work order list can show here.</div>`
			: '';

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
					${filterRowHtml()}
				</div>

				${noHealthWorker}

				<div style="display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 14px; margin-bottom: 18px;">
					${STATUS_CARDS.map(statusCardHtml).join('')}
				</div>
			</div>
		`;

		page.main.html(html);

		page.main.find('.wol-status-card').on('click', function () {
			let key = $(this).data('key');
			selectedFilters.status = selectedFilters.status === key ? '' : key;
			pageOffset = 0;
			loadRecordsThenRender();
		});
		wireFilterEvents(page.main);
	}

	// Next/Previous pagination, same pattern as the CHW Dashboard popup - but
	// in indigo rather than Dashboard's teal, specifically so the two popups
	// (which now otherwise share a very similar look) stay visually
	// distinguishable at a glance.
	function paginationControlsHtml() {
		let hasPrevious = pageOffset > 0;
		let hasNext = pageOffset + allRecords.length < totalCount;
		return `
			<button type="button" class="btn btn-xs wol-prev" ${hasPrevious ? '' : 'disabled'}
				style="border: 1.5px solid ${hasPrevious ? '#4F46E5' : '#D1D5DB'}; background: ${hasPrevious ? '#4F46E5' : '#F3F4F6'}; color: ${hasPrevious ? '#FFFFFF' : '#9CA3AF'}; font-weight: 700; font-size: 12.5px; padding: 5px 12px; border-radius: 6px;">
				&lt; Previous
			</button>
			<button type="button" class="btn btn-xs wol-next" ${hasNext ? '' : 'disabled'}
				style="border: 1.5px solid ${hasNext ? '#4F46E5' : '#D1D5DB'}; background: ${hasNext ? '#4F46E5' : '#F3F4F6'}; color: ${hasNext ? '#FFFFFF' : '#9CA3AF'}; font-weight: 700; font-size: 12.5px; padding: 5px 12px; border-radius: 6px;">
				Next &gt;
			</button>
		`;
	}

	// Injected once, guarded against duplicate <style> tags across re-renders
	// - zebra striping + sticky table header, matching the CHW Dashboard
	// popup's "attractive table" treatment but in indigo instead of teal, and
	// the same green pill Download Excel button style as Dashboard (reused
	// as-is, since that one was explicitly asked to match).
	function ensureWolTableStyle() {
		if (document.getElementById('wol-table-style')) return;
		let style = document.createElement('style');
		style.id = 'wol-table-style';
		style.innerHTML = `
			#wol-table-wrapper table { margin-bottom: 0; }
			#wol-table thead th {
				position: sticky; top: 0; z-index: 1;
				background: #4F46E5; color: #FFFFFF;
				font-size: 12.5px; font-weight: 800; text-transform: uppercase;
				border-bottom: 2px solid #4338CA;
			}
			#wol-table tbody tr:nth-child(odd) { background: #FFFFFF; }
			#wol-table tbody tr:nth-child(even) { background: #F5F5FF; }
			#wol-table tbody tr:hover { background: #E0E7FF !important; }
			.wol-export-btn {
				display: inline-flex; align-items: center; gap: 7px; height: 36px; padding: 0 16px;
				border: none; border-radius: 8px; background: #15803D; color: #FFFFFF;
				font-size: 13px; font-weight: 700; box-shadow: 0 1px 3px rgba(21,128,61,0.35);
				cursor: pointer; transition: background .15s ease, box-shadow .15s ease, transform .1s ease;
			}
			.wol-export-btn:hover { background: #126C32; box-shadow: 0 3px 8px rgba(21,128,61,0.45); }
			.wol-export-btn:active { transform: translateY(1px); box-shadow: 0 1px 2px rgba(21,128,61,0.4); }
		`;
		document.head.appendChild(style);
	}

	function drilldownBodyHtml() {
		let visibleRecords = allRecords.filter((r) => {
			if (selectedFilters.risk === 'high_risk') return r.high_risk === 'Yes';
			if (selectedFilters.risk === 'normal') return r.high_risk !== 'Yes';
			return true;
		});

		let rows = visibleRecords
			.map((r) => {
				let colors = STATUS_ROW_COLORS[r.status] || STATUS_ROW_COLORS['Upcoming'];

				let isHighRisk = r.high_risk === 'Yes';
				let highRiskBadge = isHighRisk
					? `<span style="font-size: 10px; font-weight: 700; color: #B91C1C; background: #FEE2E2; border: 1px solid #FCA5A5; border-radius: 999px; padding: 2px 8px; margin-left: 8px;">HIGH RISK</span>`
					: '';

				// Always show a full range - if no window start was stored
				// (older records saved before this field existed, or the
				// manual phase's own typed date), fall back to 30 days
				// before the due date so the list always reads as a range.
				let windowRange = '-';
				if (r.due_date) {
					let fromDate = r.from_date || frappe.datetime.add_days(r.due_date, -30);
					windowRange = `${frappe.datetime.str_to_user(fromDate)} &ndash; ${frappe.datetime.str_to_user(r.due_date)}`;
				}

				return `
				<tr data-doctype="${r.doctype}" data-name="${frappe.utils.escape_html(r.name)}" style="cursor: pointer; ${isHighRisk ? 'background:#FFFBFB;' : ''}">
					<td style="padding: 11px 8px; font-size: 13px; font-weight: 600; color: #1F2937; white-space: nowrap;">${frappe.utils.escape_html(r.patient || r.name)}${highRiskBadge}</td>
					<td style="padding: 11px 8px; font-size: 13px; color: #6B7280;">${frappe.utils.escape_html(r.visit_type)}</td>
					<td style="padding: 11px 8px; font-size: 13px; color: #6B7280;">${frappe.utils.escape_html(r.village || '-')}</td>
					<td style="padding: 11px 8px; font-size: 13px; color: #6B7280; white-space: nowrap;">${windowRange}</td>
					<td style="padding: 11px 8px;"><span style="font-size: 11px; font-weight: 700; padding: 3px 9px; border-radius: 999px; background:${colors.bg}; color:${colors.text};">${r.status}</span></td>
				</tr>
			`;
			})
			.join('');

		ensureWolTableStyle();

		return `
			<div style="display: flex; flex-direction: column; max-height: 68vh;">
				<div style="flex-shrink: 0; display: flex; align-items: flex-end; justify-content: center; gap: 10px; flex-wrap: wrap; background: #FAFAF8; border: 1px solid #EDEBE5; border-radius: 10px; padding: 14px 16px; margin-bottom: 18px;">
					${filterRowHtml()}
				</div>

				<div style="flex-shrink: 0; display: flex; align-items: center; justify-content: flex-end; margin-bottom: 8px; flex-wrap: wrap; gap: 10px;">
					<button class="wol-export-btn" id="wol-export">
						<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
							<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
							<polyline points="7 10 12 15 17 10"></polyline>
							<line x1="12" y1="15" x2="12" y2="3"></line>
						</svg>
						Download Excel
					</button>
				</div>

				<div id="wol-table-wrapper" style="flex: 1; min-height: 0; overflow: auto; border: 1px solid #EDEBE5; border-radius: 10px;">
					<table class="table table-bordered" id="wol-table" style="width: 100%;">
						<thead>
							<tr>
								<th>Patient</th>
								<th>Visit Type</th>
								<th>Village</th>
								<th>Visit Window (From &ndash; To)</th>
								<th>Status</th>
							</tr>
						</thead>
						<tbody>
							${rows || '<tr><td colspan="5" style="color:#9CA3AF;padding:20px;text-align:center;">No records for this selection.</td></tr>'}
						</tbody>
					</table>
				</div>

				<div style="flex-shrink: 0; display: flex; align-items: center; justify-content: space-between; margin-top: 10px; flex-wrap: wrap; gap: 10px;">
					<div style="display: flex; align-items: center; gap: 10px;">
						${paginationControlsHtml()}
					</div>
					<span style="font-size: 13px; font-weight: 700; color: #374151;">Showing ${allRecords.length ? pageOffset + 1 : 0}-${pageOffset + allRecords.length} of ${totalCount}</span>
				</div>
			</div>
		`;
	}

	function showDrilldownDialog() {
		if (!drilldownDialog) {
			drilldownDialog = new frappe.ui.Dialog({
				title: 'Work Order List - Drilldown',
				size: 'extra-large',
				fields: [{ fieldtype: 'HTML', fieldname: 'drilldown_body' }],
			});
			// extra-large (Bootstrap's modal-xl) is the biggest size Frappe's
			// Dialog supports natively - going any bigger needs a direct
			// width override on the modal itself.
			drilldownDialog.$wrapper.find('.modal-dialog').css({ 'max-width': '1400px', width: '92vw' });
		}

		drilldownDialog.fields_dict.drilldown_body.$wrapper.html(drilldownBodyHtml());
		drilldownDialog.show();
		wireDrilldownEvents();
	}

	function wireDrilldownEvents() {
		let $body = drilldownDialog.fields_dict.drilldown_body.$wrapper;

		wireFilterEvents($body);
		$body.find('.wol-prev').on('click', function () {
			pageOffset = Math.max(0, pageOffset - PAGE_SIZE);
			loadRecordsThenRender();
		});
		$body.find('.wol-next').on('click', function () {
			pageOffset = pageOffset + PAGE_SIZE;
			loadRecordsThenRender();
		});
		$body.find('#wol-export').on('click', function () {
			let params = new URLSearchParams({
				status: selectedFilters.status,
				village: selectedFilters.village || '',
				health_worker: selectedFilters.health_worker || '',
				visit_type: selectedFilters.visit_type || '',
				page_length: PAGE_SIZE,
				start: pageOffset,
				risk: selectedFilters.risk || '',
			});
			window.open(`/api/method/chw.api.chw_work_order_drilldown_excel?${params.toString()}`, '_blank');
		});
		$body.find('#wol-table tbody tr[data-name]').on('click', function () {
			let doctype = $(this).data('doctype');
			let name = $(this).data('name');
			if (doctype && name) {
				frappe.set_route('Form', doctype, name);
			}
		});
	}

	loadOptionsThenRender();
};

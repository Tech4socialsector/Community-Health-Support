// Copyright (c) 2026, tech4socialsector@azimpremjifoundation.org and contributors
// For license information, please see license.txt

// Coordinator-facing overview dashboard: program-wide record counts
// (Household/Family/Pregnancy/Birth/PNC/ANC/Palliative) with Date range,
// Village and Health Worker filters, and a drilldown popup into the
// underlying records per card. The popup itself mirrors whatever that
// card's own doctype actually shows/filters by in its real list view
// (chw.api.chw_dashboard_doctype_fields/_drilldown), not a fixed generic
// set shared by every card - so it's a fully separate filter scope from
// this page's own Date range/Village/Health Worker filters above, which
// only ever control the card counts themselves. Separate from
// chw-visit-dashboard (each CHW's own pending/backlog worklist) - this
// page never touches that one's files or its chw_visit_summary/
// chw_visit_drilldown backend.

frappe.pages['chw-dashboard'].on_page_load = function (wrapper) {
	let page = frappe.ui.make_app_page({
		parent: wrapper,
		title: 'Dashboard',
		single_column: true,
	});

	let villageOptions = ['All Villages'];
	let healthWorkerOptions = ['All Health Workers'];
	let cardsData = [];

	let selectedFilters = {
		date_range: 'all',
		village: 'All Villages',
		health_worker: 'All Health Workers',
	};

	// Previous/Next paging, fixed 100 records per page - not the standard
	// Frappe 20/100/500/2500 page-size selector.
	const PAGE_SIZE = 100;
	let pageOffset = 0;

	let drilldownDialog = null;
	let currentCard = null;
	let listViewFields = [];
	let standardFilterFields = [];
	let linkFieldOptions = {}; // { fieldname: [options...] }, for Link-type filter fields
	let popupFilters = {}; // { fieldname: value }, this popup's own filter state - independent of selectedFilters above
	let drilldownRecords = [];
	let drilldownTotalCount = 0;

	const COLORS = {
		gray: { bg: '#F3F4F6', border: '#E5E7EB', fg: '#374151' },
		purple: { bg: '#F5F0FF', border: '#E9D8FD', fg: '#7C3AED' },
		blue: { bg: '#EEF4FF', border: '#DCE9FF', fg: '#2563EB' },
		green: { bg: '#EEFBF2', border: '#D3F3DF', fg: '#15803D' },
		orange: { bg: '#FFF5EA', border: '#FFE3C2', fg: '#C2540A' },
		red: { bg: '#FDF0F0', border: '#F8D7D7', fg: '#B91C1C' },
	};

	function loadFilterOptions() {
		frappe.call({ method: 'chw.api.get_villages' }).then((r) => {
			villageOptions = ['All Villages'].concat(r.message || []);
			render();
		});
		frappe.call({ method: 'chw.api.get_health_workers' }).then((r) => {
			healthWorkerOptions = ['All Health Workers'].concat(r.message || []);
			render();
		});
	}

	function loadAndRender() {
		frappe.call({
			method: 'chw.api.get_chw_dashboard_cards',
			args: {
				village: selectedFilters.village,
				health_worker: selectedFilters.health_worker,
				date_range: selectedFilters.date_range,
			},
			callback: function (r) {
				cardsData = r.message || [];
				render();
			},
		});
	}

	function cardHtml(card) {
		let color = COLORS[card.color] || COLORS.gray;
		return `
			<div class="chw-dashboard-card" data-key="${card.key}" style="cursor: pointer; text-align: left; display: flex; flex-direction: column; gap: 8px; background: #FFFFFF; border: 1px solid #E5E7EB; border-top: 3px solid ${color.fg}; border-radius: 10px; padding: 20px;">
				<span style="font-size: 28px; font-weight: 800; color: #111827; line-height: 1;">${card.count}</span>
				<span style="font-size: 13px; font-weight: 600; color: #6B7280;">${frappe.utils.escape_html(card.label)}</span>
			</div>
		`;
	}

	function render() {
		let html = `
			<div style="padding: 8px 4px 28px 4px;">
				<div style="display: flex; align-items: center; justify-content: space-between; gap: 16px; flex-wrap: wrap; background: #ECFDF5; border: 1px solid #A7F3D0; border-radius: 12px; padding: 14px 20px; margin-bottom: 22px;">
					<div style="display: flex; align-items: center; gap: 12px;">
						<span style="width: 40px; height: 40px; border-radius: 10px; background: #0D9488; color: #FFFFFF; display: flex; align-items: center; justify-content: center; font-size: 16px; font-weight: 800; flex-shrink: 0;">C</span>
						<div style="display: flex; flex-direction: column;">
							<span style="font-size: 16px; font-weight: 800; color: #065F46;">CHW App</span>
							<span style="font-size: 12px; color: #047857;">Program Overview Dashboard</span>
						</div>
					</div>
					<div style="display: flex; align-items: center; gap: 14px;">
						<span style="font-size: 12px; color: #047857; display: flex; align-items: center; gap: 5px;">
							<span style="width: 7px; height: 7px; border-radius: 50%; background: #10B981; display: inline-block;"></span>
						</span>
						<button class="btn" id="chw-dashboard-open-worklist" style="height: 36px; background: #0D9488; border-color: #0D9488; color: #FFFFFF;">&#8599; Go to Work Order List</button>
						<button class="btn btn-primary" id="chw-dashboard-open-workspace" style="height: 36px; background: #0D9488; border-color: #0D9488;">&#8599; Open Workspace</button>
					</div>
				</div>
				<div style="display: flex; align-items: flex-end; justify-content: center; gap: 10px; flex-wrap: wrap; margin-bottom: 22px;">
					<div style="display: flex; flex-direction: column; gap: 4px;">
						<label style="font-size: 11px; font-weight: 600; color: #B45309; text-transform: uppercase; letter-spacing: 0.04em;">Date range</label>
						<select id="chw-dashboard-date-range" class="form-control" style="height: 34px; width: 150px;">
							<option value="all" ${selectedFilters.date_range === 'all' ? 'selected' : ''}>All time</option>
							<option value="today" ${selectedFilters.date_range === 'today' ? 'selected' : ''}>Today</option>
							<option value="week" ${selectedFilters.date_range === 'week' ? 'selected' : ''}>This week</option>
							<option value="month" ${selectedFilters.date_range === 'month' ? 'selected' : ''}>This month</option>
						</select>
					</div>
					<div style="display: flex; flex-direction: column; gap: 4px;">
						<label style="font-size: 11px; font-weight: 600; color: #9333EA; text-transform: uppercase; letter-spacing: 0.04em;">Village</label>
						<select id="chw-dashboard-village" class="form-control" style="height: 34px; width: 160px;">
							${villageOptions.map((v) => `<option value="${v}" ${selectedFilters.village === v ? 'selected' : ''}>${v}</option>`).join('')}
						</select>
					</div>
					<div style="display: flex; flex-direction: column; gap: 4px;">
						<label style="font-size: 11px; font-weight: 600; color: #0D9488; text-transform: uppercase; letter-spacing: 0.04em;">Health Worker</label>
						<select id="chw-dashboard-health-worker" class="form-control" style="height: 34px; width: 170px;">
							${healthWorkerOptions.map((v) => `<option value="${v}" ${selectedFilters.health_worker === v ? 'selected' : ''}>${v}</option>`).join('')}
						</select>
					</div>
					<button class="btn btn-default" id="chw-dashboard-refresh" style="height: 34px;">Refresh</button>
				</div>
				<div style="display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); column-gap: 16px; row-gap: 28px;">
					${cardsData.map(cardHtml).join('')}
				</div>
				<p style="font-size: 12px; color: #9CA3AF; margin-top: 18px;">Click a card to see the records behind it.</p>
			</div>
		`;
		page.main.html(html);

		page.main.find('#chw-dashboard-date-range').on('change', function () {
			selectedFilters.date_range = $(this).val();
			loadAndRender();
		});
		page.main.find('#chw-dashboard-village').on('change', function () {
			selectedFilters.village = $(this).val();
			loadAndRender();
		});
		page.main.find('#chw-dashboard-health-worker').on('change', function () {
			selectedFilters.health_worker = $(this).val();
			loadAndRender();
		});
		page.main.find('#chw-dashboard-refresh').on('click', loadAndRender);

		page.main.find('#chw-dashboard-open-workspace').on('click', function () {
			window.location.href = '/app/' + frappe.router.slug('CHW App');
		});

		page.main.find('#chw-dashboard-open-worklist').on('click', function () {
			frappe.set_route('chw-work-order-list');
		});

		page.main.find('.chw-dashboard-card').on('click', function () {
			showDrilldown($(this).data('key'));
		});
	}

	function paginationControlsHtml() {
		let hasPrevious = pageOffset > 0;
		let hasNext = pageOffset + drilldownRecords.length < drilldownTotalCount;
		return `
			<button type="button" class="btn btn-xs chw-dashboard-prev" ${hasPrevious ? '' : 'disabled'}
				style="border: 1.5px solid ${hasPrevious ? '#0D9488' : '#D1D5DB'}; background: ${hasPrevious ? '#0D9488' : '#F3F4F6'}; color: ${hasPrevious ? '#FFFFFF' : '#9CA3AF'}; font-weight: 700; font-size: 12.5px; padding: 5px 12px; border-radius: 6px;">
				&lt; Previous
			</button>
			<button type="button" class="btn btn-xs chw-dashboard-next" ${hasNext ? '' : 'disabled'}
				style="border: 1.5px solid ${hasNext ? '#0D9488' : '#D1D5DB'}; background: ${hasNext ? '#0D9488' : '#F3F4F6'}; color: ${hasNext ? '#FFFFFF' : '#9CA3AF'}; font-weight: 700; font-size: 12.5px; padding: 5px 12px; border-radius: 6px;">
				Next &gt;
			</button>
		`;
	}

	// One filter control per standard_filter_fields entry, the right kind of
	// control for that field's own fieldtype - a Select gets its own real
	// options, a Link gets a dropdown of that doctype's names (already
	// fetched into linkFieldOptions before this renders), a Date gets a
	// date picker, anything else gets a plain text (partial match) input.
	const FILTER_CONTROL_STYLE = 'height: 36px; width: 170px; font-size: 13px; font-weight: 600; color: #1F2937; border: 1.5px solid #A7D8D0; border-radius: 7px;';

	function filterFieldHtml(field) {
		let value = popupFilters[field.fieldname] || '';
		if (field.fieldtype === 'Select') {
			let options = (field.options || '').split('\n').map((o) => o.trim()).filter(Boolean);
			return `
				<select class="form-control chw-dashboard-popup-filter" data-fieldname="${field.fieldname}" style="${FILTER_CONTROL_STYLE}">
					<option value="">All</option>
					${options.map((o) => `<option value="${o}" ${value === o ? 'selected' : ''}>${o}</option>`).join('')}
				</select>
			`;
		}
		if (field.fieldtype === 'Link') {
			let options = linkFieldOptions[field.fieldname] || [];
			return `
				<select class="form-control chw-dashboard-popup-filter" data-fieldname="${field.fieldname}" style="${FILTER_CONTROL_STYLE}">
					<option value="">All</option>
					${options.map((o) => `<option value="${o}" ${value === o ? 'selected' : ''}>${o}</option>`).join('')}
				</select>
			`;
		}
		if (field.fieldtype === 'Date') {
			return `<input type="date" class="form-control chw-dashboard-popup-filter" data-fieldname="${field.fieldname}" value="${value}" style="${FILTER_CONTROL_STYLE}">`;
		}
		return `<input type="text" class="form-control chw-dashboard-popup-filter" data-fieldname="${field.fieldname}" value="${frappe.utils.escape_html(value)}" placeholder="Search ${frappe.utils.escape_html(field.label)}" style="${FILTER_CONTROL_STYLE}">`;
	}

	function formatCell(value, field) {
		if (value === null || value === undefined || value === '') return '-';
		if (field.fieldtype === 'Date') return frappe.datetime.str_to_user(value);
		if (field.fieldtype === 'Datetime') return frappe.datetime.comment_when(value);
		return frappe.utils.escape_html(String(value));
	}

	function ensureDashboardTableStyle() {
		if (document.getElementById('chw-dashboard-table-style')) return;
		let style = document.createElement('style');
		style.id = 'chw-dashboard-table-style';
		style.textContent = `
			#chw-dashboard-table-wrapper table#chw-dashboard-table tbody tr:nth-child(odd) td {
				background: #FFFFFF;
			}
			#chw-dashboard-table-wrapper table#chw-dashboard-table tbody tr:nth-child(even) td {
				background: #F3FBF8;
			}
			#chw-dashboard-table-wrapper table#chw-dashboard-table tbody tr:hover td {
				background: #D7F5E9 !important;
			}
			#chw-dashboard-table-wrapper table#chw-dashboard-table tbody td {
				font-size: 14px;
				font-weight: 500;
			}
			#chw-dashboard-table-wrapper table#chw-dashboard-table thead th {
				position: sticky;
				top: 0;
				z-index: 1;
				background: #0D9488;
				color: #FFFFFF;
				font-size: 12.5px;
				text-transform: uppercase;
				letter-spacing: 0.04em;
				font-weight: 800;
				border-bottom: 2px solid #0B7D72;
				padding: 12px 10px;
			}
			.chw-dashboard-popup-filter:focus {
				border-color: #0D9488 !important;
				box-shadow: 0 0 0 2px rgba(13, 148, 136, 0.15) !important;
				outline: none;
			}
			.chw-dashboard-export-btn {
				display: inline-flex;
				align-items: center;
				gap: 7px;
				height: 36px;
				padding: 0 16px;
				border: none;
				border-radius: 8px;
				background: #15803D;
				color: #FFFFFF;
				font-size: 13px;
				font-weight: 700;
				box-shadow: 0 1px 3px rgba(21, 128, 61, 0.35);
				cursor: pointer;
				transition: background 0.15s ease, box-shadow 0.15s ease, transform 0.1s ease;
			}
			.chw-dashboard-export-btn:hover {
				background: #126C32;
				box-shadow: 0 3px 8px rgba(21, 128, 61, 0.45);
			}
			.chw-dashboard-export-btn:active {
				transform: translateY(1px);
				box-shadow: 0 1px 2px rgba(21, 128, 61, 0.4);
			}
		`;
		document.head.appendChild(style);
	}

	function drilldownBodyHtml() {
		ensureDashboardTableStyle();

		let rows = drilldownRecords
			.map((r) => {
				let cells = listViewFields
					.filter((f) => f.fieldname !== 'name')
					.map((f) => `<td style="padding: 12px 10px; color: #374151;">${formatCell(r[f.fieldname], f)}</td>`)
					.join('');
				return `
				<tr data-name="${frappe.utils.escape_html(r.name)}" style="cursor: pointer;">
					<td style="padding: 12px 10px; font-size: 14px; font-weight: 700; color: #0D9488;">${frappe.utils.escape_html(r.name)}</td>
					${cells}
				</tr>
			`;
			})
			.join('');

		let headers = listViewFields
			.map((f) => `<th>${frappe.utils.escape_html(f.fieldname === 'name' ? 'ID' : f.label)}</th>`)
			.join('');

		return `
			<div style="display: flex; flex-direction: column; max-height: 68vh;">
				<div style="flex-shrink: 0;">
					<div style="display: flex; align-items: flex-end; justify-content: center; gap: 14px; flex-wrap: wrap; background: #ECFDF5; border: 1.5px solid #A7F3D0; border-radius: 10px; padding: 16px 18px; margin-bottom: 14px;">
						${standardFilterFields.map((f) => `
							<div style="display: flex; flex-direction: column; gap: 5px;">
								<label style="font-size: 12px; font-weight: 800; color: #0D9488; text-transform: uppercase; letter-spacing: 0.05em;">${frappe.utils.escape_html(f.label)}</label>
								${filterFieldHtml(f)}
							</div>
						`).join('')}
					</div>

					<div style="display: flex; align-items: center; justify-content: flex-end; margin-bottom: 10px;">
						<button class="chw-dashboard-export-btn" id="chw-dashboard-export">
							<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
								<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
								<polyline points="7 10 12 15 17 10"></polyline>
								<line x1="12" y1="15" x2="12" y2="3"></line>
							</svg>
							Download Excel
						</button>
					</div>
				</div>

				<div id="chw-dashboard-table-wrapper" style="flex: 1; min-height: 0; overflow: auto; border: 1px solid #EDEBE5; border-radius: 10px;">
					<table class="table table-bordered" id="chw-dashboard-table" style="width: 100%; margin-bottom: 0;">
						<thead><tr>${headers}</tr></thead>
						<tbody>
							${rows || `<tr><td colspan="${listViewFields.length}" style="color:#9CA3AF;padding:20px;text-align:center;">No records for this selection.</td></tr>`}
						</tbody>
					</table>
				</div>

				<div style="display: flex; align-items: center; gap: 10px; margin-top: 12px; flex-wrap: wrap; flex-shrink: 0;">
					<div style="display: flex; gap: 6px;">${paginationControlsHtml()}</div>
					<span style="font-size: 13px; font-weight: 700; color: #374151;">Showing ${drilldownRecords.length ? pageOffset + 1 : 0}-${pageOffset + drilldownRecords.length} of ${drilldownTotalCount}</span>
				</div>
			</div>
		`;
	}

	function fetchDrilldownRecordsThenRender() {
		frappe.call({
			method: 'chw.api.chw_dashboard_drilldown',
			args: {
				card_key: currentCard.key,
				filters: JSON.stringify(popupFilters),
				page_length: PAGE_SIZE,
				start: pageOffset,
			},
			callback: function (r) {
				drilldownRecords = (r.message && r.message.records) || [];
				drilldownTotalCount = (r.message && r.message.total_count) || 0;
				renderDrilldownDialog();
			},
		});
	}

	function renderDrilldownDialog() {
		if (!drilldownDialog) {
			drilldownDialog = new frappe.ui.Dialog({
				size: 'extra-large',
				fields: [{ fieldtype: 'HTML', fieldname: 'drilldown_body' }],
			});
			// extra-large (Bootstrap's modal-xl) is the biggest size Frappe's
			// Dialog supports natively - going any bigger needs a direct
			// width override on the modal itself.
			drilldownDialog.$wrapper.find('.modal-dialog').css({ 'max-width': '1400px', width: '92vw' });
		}

		drilldownDialog.set_title(currentCard.label);
		drilldownDialog.fields_dict.drilldown_body.$wrapper.html(drilldownBodyHtml());
		drilldownDialog.show();
		wireDrilldownEvents();
	}

	function wireDrilldownEvents() {
		let $body = drilldownDialog.fields_dict.drilldown_body.$wrapper;

		$body.find('.chw-dashboard-popup-filter').on('change input', function () {
			let fieldname = $(this).data('fieldname');
			let value = $(this).val();
			if (value) popupFilters[fieldname] = value;
			else delete popupFilters[fieldname];
		});
		// Text inputs re-fetch on Enter (avoids a server round-trip per
		// keystroke); Select/Link/Date re-fetch immediately on change.
		$body.find('select.chw-dashboard-popup-filter, input[type="date"].chw-dashboard-popup-filter').on('change', function () {
			pageOffset = 0;
			fetchDrilldownRecordsThenRender();
		});
		$body.find('input[type="text"].chw-dashboard-popup-filter').on('keydown', function (e) {
			if (e.key === 'Enter') {
				pageOffset = 0;
				fetchDrilldownRecordsThenRender();
			}
		});
		$body.find('.chw-dashboard-prev').on('click', function () {
			pageOffset = Math.max(0, pageOffset - PAGE_SIZE);
			fetchDrilldownRecordsThenRender();
		});
		$body.find('.chw-dashboard-next').on('click', function () {
			pageOffset = pageOffset + PAGE_SIZE;
			fetchDrilldownRecordsThenRender();
		});
		$body.find('#chw-dashboard-export').on('click', function () {
			let params = new URLSearchParams({
				card_key: currentCard.key,
				filters: JSON.stringify(popupFilters),
				page_length: PAGE_SIZE,
				start: pageOffset,
			});
			window.open(`/api/method/chw.api.chw_dashboard_drilldown_excel?${params.toString()}`, '_blank');
		});
		$body.find('#chw-dashboard-table tbody tr[data-name]').on('click', function () {
			frappe.set_route('Form', currentCard.doctype, $(this).data('name'));
		});
	}

	function loadLinkOptionsThenShow() {
		let linkFields = standardFilterFields.filter((f) => f.fieldtype === 'Link');
		if (!linkFields.length) {
			fetchDrilldownRecordsThenRender();
			return;
		}
		let remaining = linkFields.length;
		linkFields.forEach((f) => {
			frappe.call({
				method: 'chw.api.chw_dashboard_link_options',
				args: { link_doctype: f.options },
				callback: function (r) {
					linkFieldOptions[f.fieldname] = r.message || [];
					remaining -= 1;
					if (remaining === 0) fetchDrilldownRecordsThenRender();
				},
			});
		});
	}

	function showDrilldown(cardKey) {
		let card = cardsData.find((c) => c.key === cardKey);
		if (!card) return;
		currentCard = card;
		pageOffset = 0;
		popupFilters = {};
		linkFieldOptions = {};

		frappe.call({
			method: 'chw.api.chw_dashboard_doctype_fields',
			args: { card_key: cardKey },
			callback: function (r) {
				listViewFields = (r.message && r.message.list_view_fields) || [];
				standardFilterFields = (r.message && r.message.standard_filter_fields) || [];
				loadLinkOptionsThenShow();
			},
		});
	}

	loadFilterOptions();
	loadAndRender();
};

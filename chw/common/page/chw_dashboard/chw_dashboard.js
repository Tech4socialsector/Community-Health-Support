// Copyright (c) 2026, tech4socialsector@azimpremjifoundation.org and contributors
// For license information, please see license.txt

// Coordinator-facing overview dashboard: program-wide record counts
// (Household/Family/Pregnancy/Birth/PNC/ANC/Palliative) with Date range,
// Village and Health Worker filters, and a drilldown into the underlying
// records per card. Separate from chw-visit-dashboard (each CHW's own
// pending/backlog worklist) - this page never touches that one's files or
// its chw_visit_summary/chw_visit_drilldown backend.

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
			page.main.find('#chw-dashboard-village').html(
				villageOptions
					.map((v) => `<option value="${v}" ${selectedFilters.village === v ? 'selected' : ''}>${v}</option>`)
					.join('')
			);
		});
		frappe.call({ method: 'chw.api.get_health_workers' }).then((r) => {
			healthWorkerOptions = ['All Health Workers'].concat(r.message || []);
			page.main.find('#chw-dashboard-health-worker').html(
				healthWorkerOptions
					.map((v) => `<option value="${v}" ${selectedFilters.health_worker === v ? 'selected' : ''}>${v}</option>`)
					.join('')
			);
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
				<div style="display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 16px;">
					${cardsData.map(cardHtml).join('')}
				</div>
				<p style="font-size: 12px; color: #9CA3AF; margin-top: 18px;">Click a card to see the records behind it, filtered by the selection above.</p>
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

	function drilldownStats(records, cardKey) {
		let sevenDaysAgo = moment().subtract(7, 'days');
		let thisWeek = records.filter((r) => r.creation && moment(r.creation).isAfter(sevenDaysAgo)).length;

		let villageCounts = {};
		records.forEach((r) => {
			if (!r.village) return;
			villageCounts[r.village] = (villageCounts[r.village] || 0) + 1;
		});

		let stats = [
			{ label: 'Records', value: records.length },
			{ label: 'This week', value: thisWeek },
		];

		if (cardKey === 'household' || cardKey === 'family') {
			// Households/Family Members are one-per-village-slot - how many
			// distinct villages have a record registered matters more here
			// than which single village has the most.
			let villageCount = Object.keys(villageCounts).length;
			stats.push({ label: 'Total villages registered', value: villageCount });
		} else {
			let topVillage = Object.entries(villageCounts).sort((a, b) => b[1] - a[1])[0];
			if (topVillage) {
				stats.push({ label: 'Top village', value: `${topVillage[0]} (${topVillage[1]})` });
			}
		}
		return stats;
	}

	function drilldownTabHtml(card, cardKey, records) {
		let rows = records
			.map(
				(r) => `
			<tr>
				<td><a href="/app/${frappe.router.slug(card.doctype)}/${encodeURIComponent(r.name)}">${frappe.utils.escape_html(r.patient || r.name || '')}</a></td>
				<td>${frappe.utils.escape_html(r.village || '-')}</td>
				<td>${frappe.datetime.comment_when(r.creation)}</td>
			</tr>
		`
			)
			.join('');
		let excelParams = new URLSearchParams({
			card_key: cardKey,
			village: selectedFilters.village,
			health_worker: selectedFilters.health_worker,
			date_range: selectedFilters.date_range,
		});
		let metaBits = [
			selectedFilters.village !== 'All Villages' ? `Village = ${selectedFilters.village}` : null,
			selectedFilters.health_worker !== 'All Health Workers' ? `Health Worker = ${selectedFilters.health_worker}` : null,
			selectedFilters.date_range !== 'all' ? `Date range = ${selectedFilters.date_range}` : null,
		].filter(Boolean);
		let subtitle = metaBits.length ? `${metaBits.join(' · ')} (${records.length} records)` : `${records.length} records`;

		let statsHtml = drilldownStats(records, cardKey)
			.map(
				(s) => `
			<div>
				<div class="stat-label">${frappe.utils.escape_html(s.label)}</div>
				<div class="stat-value">${frappe.utils.escape_html(String(s.value))}</div>
			</div>
		`
			)
			.join('');

		return `
			<!doctype html>
			<html>
			<head>
				<meta charset="utf-8">
				<title>${frappe.utils.escape_html(card.label)} — CHW Dashboard</title>
				<style>
					body { font-family: -apple-system, "Segoe UI", system-ui, sans-serif; margin: 0; padding: 0; color: #1F2937; background: #FFFFFF; }
					header { display: flex; align-items: flex-start; justify-content: space-between; padding: 18px 28px; border-bottom: 1px solid #EDEBE5; }
					h1 { font-size: 18px; margin: 0 0 4px 0; }
					p.meta { color: #6B7280; font-size: 13px; margin: 0; }
					.export { display: inline-flex; align-items: center; gap: 6px; height: 36px; padding: 0 14px; border: 1px solid #0D9488; border-radius: 8px; font-size: 13px; font-weight: 600; color: #0D9488; text-decoration: none; background: #FFFFFF; }
					.stats-bar { display: flex; gap: 36px; flex-wrap: wrap; background: #F7F6F3; border-bottom: 1px solid #EDEBE5; padding: 16px 28px; }
					.stat-label { font-size: 11px; color: #9CA3AF; text-transform: uppercase; letter-spacing: 0.04em; margin-bottom: 4px; }
					.stat-value { font-size: 16px; font-weight: 800; color: #111827; }
					.content { padding: 20px 28px; }
					input#search { width: 320px; height: 34px; border-radius: 8px; border: 1px solid #E4E1D8; padding: 0 10px; font-size: 13px; margin-bottom: 14px; box-sizing: border-box; }
					table { border-collapse: collapse; width: 100%; }
					th { text-align: left; font-size: 11px; color: #9CA3AF; text-transform: uppercase; letter-spacing: 0.04em; padding: 8px; border-bottom: 1px solid #EDEBE5; }
					td { padding: 10px 8px; font-size: 13px; border-bottom: 1px solid #F5F4EF; }
					tr:nth-child(even) td { background: #FBF7F1; }
					a { color: #1D4ED8; text-decoration: none; font-weight: 600; }
					a:hover { text-decoration: underline; }
				</style>
			</head>
			<body>
				<header>
					<div>
						<h1>${frappe.utils.escape_html(card.label)}</h1>
						<p class="meta">${frappe.utils.escape_html(subtitle)}</p>
					</div>
					<a class="export" href="/api/method/chw.api.chw_dashboard_drilldown_excel?${excelParams.toString()}">&#8595; Download Excel</a>
				</header>
				<div class="stats-bar">${statsHtml}</div>
				<div class="content">
					<input id="search" type="text" placeholder="Search by name">
					<table>
						<thead><tr><th>Name</th><th>Village</th><th>Date</th></tr></thead>
						<tbody>${rows || '<tr><td colspan="3" style="color:#9CA3AF;padding:20px;">No records for this selection.</td></tr>'}</tbody>
					</table>
				</div>
				<script>
					document.getElementById('search').addEventListener('input', function (e) {
						var q = e.target.value.toLowerCase();
						document.querySelectorAll('tbody tr').forEach(function (tr) {
							tr.style.display = tr.textContent.toLowerCase().indexOf(q) !== -1 ? '' : 'none';
						});
					});
				</script>
			</body>
			</html>
		`;
	}

	function showDrilldown(cardKey) {
		let card = cardsData.find((c) => c.key === cardKey);
		if (!card) return;

		let tab = window.open('', '_blank');
		if (tab) {
			tab.document.write('<p style="font-family: system-ui, sans-serif; padding: 24px; color: #6B7280;">Loading…</p>');
		}

		frappe.call({
			method: 'chw.api.chw_dashboard_drilldown',
			args: {
				card_key: cardKey,
				village: selectedFilters.village,
				health_worker: selectedFilters.health_worker,
				date_range: selectedFilters.date_range,
			},
			callback: function (r) {
				let records = (r.message && r.message.records) || [];
				if (!tab || tab.closed) {
					frappe.msgprint(__('Please allow pop-ups for this site to open the drilldown in a new tab.'));
					return;
				}
				tab.document.open();
				tab.document.write(drilldownTabHtml(card, cardKey, records));
				tab.document.close();
			},
		});
	}

	loadFilterOptions();
	loadAndRender();
};

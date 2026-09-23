frappe.pages['chw-visit-dashboard'].on_page_load = function(wrapper) {
    let selectedDate = frappe.datetime.get_today();
    let dashboardData = {};

    let selectedFilters = {
        village: 'All Villages',
        age_group: 'All Ages',
        gender: 'All',
        year: 'All Years',
        month: 'All Months',
        program: null,
        visit_type: null,
        view_mode: 'week', // 'week' or 'day'
        period_date: selectedDate
    };

    function toDateOnly(d) {
        // frappe.datetime.add_days() returns a full ISO timestamp; keep just the date part
        return (d || '').split(/[ T]/)[0];
    }

    function shiftDate(dateStr, days) {
        return toDateOnly(frappe.datetime.add_days(dateStr, days));
    }

    function getWeekBounds(anyDate) {
        let base = anyDate || frappe.datetime.get_today();
        let dow = moment(base, 'YYYY-MM-DD').day(); // 0 = Sunday .. 6 = Saturday
        let diffToMonday = (dow + 6) % 7; // days since Monday
        let monday = shiftDate(base, -diffToMonday);
        let sunday = shiftDate(monday, 6);
        return { start: monday, end: sunday };
    }

    function getDayBounds(anyDate) {
        let day = toDateOnly(anyDate) || frappe.datetime.get_today();
        return { start: day, end: day };
    }

    function getPeriodBounds(anyDate, viewMode) {
        return viewMode === 'day' ? getDayBounds(anyDate) : getWeekBounds(anyDate);
    }

    function formatDMY(dateStr) {
        return (dateStr || '').split('-').reverse().join('-');
    }

    // Programs cascade into Visit Types, mirroring the health-worker mobile app's
    // Subject Type / Program / Visit Type filter, scoped to what the dashboard
    // backend (chw_visit_summary / chw_visit_drilldown) actually supports.
    const PROGRAMS = [
        {
            label: 'Pregnancy',
            visitTypes: [
                { label: 'ANC Follow-up', value: 'ANC Follow-up' },
                { label: 'PNC', value: 'PNC' },
                { label: 'Preconception', value: 'Preconception' }
            ]
        },
        {
            label: 'Child',
            visitTypes: [
                { label: 'Child 6w-1y', value: 'Child 6w-1y' }
            ]
        },
        {
            label: 'Postpartum',
            visitTypes: [
                { label: 'Postpartum', value: 'Postpartum' }
            ]
        },
        {
            label: 'Palliative Care',
            visitTypes: [
                { label: 'Palliative Care', value: 'Palliative Care' }
            ]
        }
    ];

    function programFor(visitTypeValue) {
        if (!visitTypeValue) return null;
        let program = PROGRAMS.find(p => p.visitTypes.some(vt => vt.value === visitTypeValue));
        return program ? program.label : null;
    }

    // One color per My Worklist program - same palette used in the design
    // preview. Only these 6 - ANC, PNC, Preconception, Postpartum,
    // Child 6w-1y, Palliative Care - chw_worklist_summary never returns
    // anything else, so no fallback/default color is needed here.
    const WORKLIST_PROGRAM_COLORS = {
        'ANC Follow-up': '#2a78d6',
        'PNC': '#eb6834',
        'Preconception': '#4a3aa7',
        'Postpartum': '#007a5e',
        'Child 6w-1y': '#8a5a00',
        'Palliative Care': '#c2568a'
    };

    const WORKLIST_TABS = ['overdue', 'today', 'upcoming', 'all'];
    const WORKLIST_TAB_LABELS = { overdue: 'Overdue', today: 'Today', upcoming: 'Upcoming', all: 'All' };
    const WORKLIST_TAB_COLORS = { overdue: '#c62828', today: '#b8790a', upcoming: '#607d8b', all: '#222' };
    let worklistData = { overdue: [], today: [], upcoming: [] };
    let worklistActiveTab = 'overdue';

    function worklistChipHtml(tab, value) {
        let color = WORKLIST_TAB_COLORS[tab];
        let active = worklistActiveTab === tab;
        return `
            <div class="worklist-chip" data-tab="${tab}" style="
                flex:1; min-width:100px; background:${active ? color + '18' : 'white'};
                border:2px solid ${color}; border-radius:10px; padding:14px; text-align:center; cursor:pointer;">
                <div style="font-size:26px; font-weight:800; color:${color};">${value}</div>
                <div style="font-size:11px; font-weight:700; letter-spacing:0.03em; color:${color}; margin-top:2px;">${WORKLIST_TAB_LABELS[tab].toUpperCase()}</div>
            </div>`;
    }

    function worklistTabBarHtml() {
        return `
            <div style="display:flex; gap:4px; background:var(--control-bg,#f5f7fa); border-radius:8px; padding:4px; margin:14px 0;">
                ${WORKLIST_TABS.map(tab => `
                    <div class="worklist-tab" data-tab="${tab}" style="
                        flex:1; text-align:center; padding:7px 4px; border-radius:6px; cursor:pointer;
                        font-size:12.5px; font-weight:600;
                        background:${worklistActiveTab === tab ? '#222' : 'transparent'};
                        color:${worklistActiveTab === tab ? 'white' : '#555'};">
                        ${WORKLIST_TAB_LABELS[tab]}
                    </div>`).join('')}
            </div>`;
    }

    function worklistCardHtml(visit) {
        let color = WORKLIST_PROGRAM_COLORS[visit.visit_type] || '#607d8b';
        let dateStr = visit.visit_date ? formatDMY(visit.visit_date) : '';
        let today = frappe.datetime.get_today();
        let tagColor = visit.visit_date < today ? '#c62828' : (visit.visit_date === today ? '#b8790a' : '#607d8b');
        let tagText = visit.visit_date < today
            ? `Overdue (${dateStr})`
            : (visit.visit_date === today ? 'Due today' : `Due ${dateStr}`);
        return `
            <div class="worklist-card" style="
                display:flex; align-items:center; gap:12px; background:white; border:1px solid var(--border-color,#d1d8dd);
                border-radius:10px; padding:12px 14px; margin-bottom:8px; box-shadow:0 1px 2px rgba(0,0,0,.04); cursor:pointer;"
                data-doctype="${visit.doctype}" data-name="${visit.name}">
                <div style="flex:1; min-width:0;">
                    <div style="display:flex; align-items:center; gap:8px; margin-bottom:3px; flex-wrap:wrap;">
                        <span style="font-weight:700; font-size:14px;">${frappe.utils.escape_html(visit.patient_name || '-')}</span>
                        <span style="font-size:10px; font-weight:700; padding:2px 8px; border-radius:100px; border:1.3px solid ${color}; color:${color}; white-space:nowrap;">${frappe.utils.escape_html(visit.visit_type)}</span>
                    </div>
                    ${visit.village ? `<div style="font-size:12px; color:#777;">${frappe.utils.escape_html(visit.village)}</div>` : ''}
                </div>
                <div style="font-size:12px; font-weight:700; color:${tagColor}; white-space:nowrap;">${tagText}</div>
            </div>`;
    }

    let worklistFilters = { village: 'All Villages', visit_type: '' };

    function worklistFilterChipsHtml() {
        let villageOpts = villageOptions.length ? villageOptions : ['All Villages'];
        let programOpts = Object.keys(WORKLIST_PROGRAM_COLORS);
        return `
            <div style="display:flex; gap:8px; margin:12px 0 14px; flex-wrap:wrap;">
                <select class="worklist-village-filter" style="
                    border:1px solid var(--border-color,#d1d8dd); border-radius:100px; padding:5px 12px;
                    font-size:12.5px; background:white; cursor:pointer;">
                    ${villageOpts.map(v => `<option value="${v}" ${worklistFilters.village === v ? 'selected' : ''}>📍 ${v}</option>`).join('')}
                </select>
                <select class="worklist-program-filter" style="
                    border:1px solid var(--border-color,#d1d8dd); border-radius:100px; padding:5px 12px;
                    font-size:12.5px; background:white; cursor:pointer;">
                    <option value="" ${!worklistFilters.visit_type ? 'selected' : ''}>All programs</option>
                    ${programOpts.map(p => `<option value="${p}" ${worklistFilters.visit_type === p ? 'selected' : ''}>${p}</option>`).join('')}
                </select>
            </div>`;
    }

    function worklistSectionHtml(subtitle) {
        let overdueCount = worklistData.overdue.length;
        let todayCount = worklistData.today.length;
        let upcomingCount = worklistData.upcoming.length;
        return `
            <div style="margin-bottom:2px;">
                <div style="font-size:20px; font-weight:800;">My Worklist</div>
                <div style="color:#888; font-size:12.5px; margin-top:2px;">${subtitle}</div>
            </div>
            <div style="display:flex; gap:10px; flex-wrap:wrap; margin-top:14px;">
                ${worklistChipHtml('overdue', overdueCount)}
                ${worklistChipHtml('today', todayCount)}
                ${worklistChipHtml('upcoming', upcomingCount)}
            </div>
            ${worklistTabBarHtml()}
            ${worklistFilterChipsHtml()}
            <div id="worklist-list-container"></div>
        `;
    }

    function renderWorklistList() {
        let $container = page.main.find('#worklist-list-container');
        if (!$container.length) return;
        let visits = worklistActiveTab === 'all'
            ? [...worklistData.overdue, ...worklistData.today, ...worklistData.upcoming]
            : worklistData[worklistActiveTab] || [];

        if (!visits.length) {
            $container.html(`<div style="text-align:center; color:#999; padding:30px; border:1px dashed var(--border-color,#ddd); border-radius:8px;">Nothing here.</div>`);
            return;
        }
        $container.html(`<div style="max-height:420px; overflow-y:auto;">${visits.map(worklistCardHtml).join('')}</div>`);
        $container.find('.worklist-card').on('click', function() {
            frappe.set_route('Form', $(this).data('doctype'), $(this).data('name'));
        });
    }

    function rerenderWorklistChipsAndTabs() {
        page.main.find('.worklist-chip').each(function() {
            let tab = $(this).data('tab');
            let active = worklistActiveTab === tab;
            let color = WORKLIST_TAB_COLORS[tab];
            $(this).css({ background: active ? color + '18' : 'white' });
        });
        page.main.find('.worklist-tab').each(function() {
            let tab = $(this).data('tab');
            let active = worklistActiveTab === tab;
            $(this).css({ background: active ? '#222' : 'transparent', color: active ? 'white' : '#555' });
        });
    }

    function worklistVillageSummary(visits) {
        let villages = [...new Set(visits.map(v => v.village).filter(Boolean))];
        if (!villages.length) return 'All villages';
        if (villages.length === 1) return villages[0];
        return `${villages[0]} & ${villages.length - 1} more village${villages.length - 1 > 1 ? 's' : ''}`;
    }

    function loadWorklistData() {
        let $wrap = page.main.find('#my-worklist-wrapper');
        if (!$wrap.length) return;
        frappe.call({
            method: 'chw.api.chw_worklist_summary',
            args: {
                village: worklistFilters.village !== 'All Villages' ? worklistFilters.village : null,
                visit_type: worklistFilters.visit_type || null
            },
            callback: function(r) {
                let data = r.message || {};
                if (data.health_worker_linked === false) {
                    $wrap.html(`<div style="background:#fff3cd; border:1px solid #ffe69c; color:#664d03; padding:12px 16px; border-radius:6px;">
                        No Health Worker record is linked to your login, so your worklist can't be shown here.
                    </div>`);
                    return;
                }
                worklistData = { overdue: data.overdue || [], today: data.today || [], upcoming: data.upcoming || [] };
                let allVisits = [...worklistData.overdue, ...worklistData.today, ...worklistData.upcoming];
                let subtitle = `${data.health_worker_name || 'You'} · ${worklistVillageSummary(allVisits)}`;

                $wrap.html(worklistSectionHtml(subtitle));
                renderWorklistList();
                $wrap.find('.worklist-chip, .worklist-tab').on('click', function() {
                    worklistActiveTab = $(this).data('tab');
                    rerenderWorklistChipsAndTabs();
                    renderWorklistList();
                });
                $wrap.find('.worklist-village-filter').on('change', function() {
                    worklistFilters.village = $(this).val();
                    loadWorklistData();
                });
                $wrap.find('.worklist-program-filter').on('change', function() {
                    worklistFilters.visit_type = $(this).val();
                    loadWorklistData();
                });
            }
        });
    }

    let villageOptions = [
        'All Villages'
    ];

    function villageArg() {
        return (selectedFilters.village && selectedFilters.village !== 'All Villages')
            ? selectedFilters.village
            : null;
    }

    const ageGroupOptions = [
        'All Ages',
        '0-17',
        '18-35',
        '36-50',
        '51+'
    ];

    const genderOptions = [
        'All',
        'Male',
        'Female',
        'Other'
    ];

    const yearOptions = ['All Years'];
    const currentYear = new Date().getFullYear();
    for (let i = 0; i < 5; i++) {
        yearOptions.push(String(currentYear - i));
    }

    const monthOptions = [
        'All Months',
        'January',
        'February',
        'March',
        'April',
        'May',
        'June',
        'July',
        'August',
        'September',
        'October',
        'November',
        'December'
    ];

    // Create page with title
    let page = frappe.ui.make_app_page({
        parent: wrapper,
        title: 'Visit Dashboard',
        single_column: true
    });

    function statCard(value, label, color, reportType) {
        return `
            <div class="chw-stat-card" data-report-type="${reportType || ''}"
                 style="flex:1; min-width:180px; background:white; border-top:4px solid ${color};
                        border-radius:8px; padding:16px 20px; box-shadow:0 1px 3px rgba(0,0,0,0.1);
                        cursor:${reportType ? 'pointer' : 'default'};">
                <div style="font-size:28px; font-weight:bold; color:#222;">${value}</div>
                <div style="color:#555; margin-top:4px; font-size:13px;">${label}</div>
            </div>
        `;
    }

    function updateSelectedDateFromFilters() {
        selectedDate = selectedFilters.period_date || frappe.datetime.get_today();
    }

    function loadDataAndRender() {
        updateSelectedDateFromFilters();
        frappe.call({
            method: 'chw.api.chw_visit_summary',
            args: {
                target_date: selectedDate,
                visit_type: selectedFilters.visit_type,
                village: villageArg(),
                view_mode: selectedFilters.view_mode
            },
            callback: function(r) {
                if (r.message) {
                    dashboardData = r.message;
                }
                render();
            }
        });
    }

    function render() {
        // Get data
        let recentReg = dashboardData.recent_registrations || 0;
        let totalReg = dashboardData.total_registrations || 0;
        let exitWomenAnc = dashboardData.exit_women_anc || 0;
        let exitWomenPnc = dashboardData.exit_women_pnc || 0;

        let viewMode = selectedFilters.view_mode;
        let periodRange = getPeriodBounds(selectedDate, viewMode);
        let periodLabel = viewMode === 'day'
            ? `Day: <strong style="color: #00875a;">${formatDMY(periodRange.start)}</strong>`
            : `Week: <strong style="color: #00875a;">${formatDMY(periodRange.start)} to ${formatDMY(periodRange.end)}</strong>`;
        let noHealthWorker = dashboardData.health_worker_linked === false;

        let html = `
            <div style="padding: 20px;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; gap: 10px; flex-wrap: wrap;">
                    <div>
                        <h3 style="margin: 0; font-size: 24px;">Visit Dashboard</h3>
                        <p style="margin: 10px 0 0 0; color: #666;">${periodLabel}</p>
                    </div>
                    <div style="display: flex; gap: 10px; flex-wrap: wrap; align-items: center;">
                        <button class="btn btn-outline-primary" id="dashboard-open-filter" style="height: 40px; align-self: flex-end; border-color:#00875a; color:#00875a; font-weight:600; letter-spacing:0.5px;">FILTER</button>
                        <div style="display: flex; flex-direction: column;">
                            <label style="font-size: 12px; color: #666; margin-bottom: 4px;">Village</label>
                            <select id="filter-village" class="input-sm form-control" style="min-width: 160px;">
                                ${villageOptions.map(v => `<option value="${v}" ${selectedFilters.village === v ? 'selected' : ''}>${v}</option>`).join('')}
                            </select>
                        </div>
                        <div style="display: flex; flex-direction: column;">
                            <label style="font-size: 12px; color: #666; margin-bottom: 4px;">Age Group</label>
                            <select id="filter-age-group" class="input-sm form-control" style="min-width: 140px;">
                                ${ageGroupOptions.map(v => `<option value="${v}">${v}</option>`).join('')}
                            </select>
                        </div>
                        <div style="display: flex; flex-direction: column;">
                            <label style="font-size: 12px; color: #666; margin-bottom: 4px;">Gender</label>
                            <select id="filter-gender" class="input-sm form-control" style="min-width: 120px;">
                                ${genderOptions.map(v => `<option value="${v}">${v}</option>`).join('')}
                            </select>
                        </div>
                        <div style="display: flex; flex-direction: column;">
                            <label style="font-size: 12px; color: #666; margin-bottom: 4px;">Year</label>
                            <select id="filter-year" class="input-sm form-control" style="min-width: 120px;">
                                ${yearOptions.map(v => `<option value="${v}">${v}</option>`).join('')}
                            </select>
                        </div>
                        <div style="display: flex; flex-direction: column;">
                            <label style="font-size: 12px; color: #666; margin-bottom: 4px;">Month</label>
                            <select id="filter-month" class="input-sm form-control" style="min-width: 140px;">
                                ${monthOptions.map(v => `<option value="${v}">${v}</option>`).join('')}
                            </select>
                        </div>
                        <div style="display: flex; flex-direction: column;">
                            <label style="font-size: 12px; color: #666; margin-bottom: 4px;">View</label>
                            <select id="filter-view-mode" class="input-sm form-control" style="min-width: 110px;">
                                <option value="week" ${viewMode === 'week' ? 'selected' : ''}>Week wise</option>
                                <option value="day" ${viewMode === 'day' ? 'selected' : ''}>Day wise</option>
                            </select>
                        </div>
                        <div style="display: flex; flex-direction: column;">
                            <label style="font-size: 12px; color: #666; margin-bottom: 4px;">${viewMode === 'day' ? 'Date' : 'Week of'}</label>
                            <input id="filter-period-date" class="input-sm form-control" type="date" value="${selectedFilters.period_date || ''}" />
                        </div>
                        <button class="btn btn-default" id="dashboard-prev-period" title="Previous ${viewMode === 'day' ? 'day' : 'week'}" style="height: 40px; align-self: flex-end;">&laquo; Prev</button>
                        <button class="btn btn-default" id="dashboard-next-period" title="Next ${viewMode === 'day' ? 'day' : 'week'}" style="height: 40px; align-self: flex-end;">Next &raquo;</button>
                        <button class="btn btn-default" id="dashboard-this-period" style="height: 40px; align-self: flex-end;">${viewMode === 'day' ? 'Today' : 'This Week'}</button>
                        <button class="btn btn-primary" id="dashboard-apply-filters" style="height: 40px; align-self: flex-end;">Apply</button>
                        <button class="btn btn-default" id="dashboard-clear-filters" title="Reset all filters" style="height: 40px; align-self: flex-end;">Clear</button>
                    </div>
                </div>

                ${noHealthWorker ? `
                <div style="background:#fff3cd; border:1px solid #ffe69c; color:#664d03; padding:12px 16px; border-radius:6px; margin-bottom:20px;">
                    No Health Worker record is linked to your login. Ask your coordinator to set the <strong>User</strong> field on your Health Worker record so your pending and missed visits can be shown here.
                </div>` : ''}

                ${selectedFilters.visit_type ? `
                <div style="background:#f0f0f0; border-radius:6px; padding:12px 16px; margin-bottom:20px; display:flex; justify-content:space-between; align-items:flex-start;">
                    <div style="color:#333; font-size:13px; line-height:1.6;">
                        <div>Program - ${programFor(selectedFilters.visit_type)}</div>
                        <div>Visit - ${selectedFilters.visit_type}</div>
                    </div>
                    <span id="dashboard-clear-visit-filter" title="Clear filter" style="cursor:pointer; color:#00875a; font-weight:bold;">&times;</span>
                </div>` : ''}

                ${selectedFilters.program === 'Pregnancy' ? `
                <div style="margin-bottom: 30px;">
                    <h5 style="font-size: 13px; font-weight: 700; letter-spacing:0.5px; color: #333; margin-bottom: 12px;">MATERNAL & CHILD HEALTH</h5>
                    <div style="display: flex; gap: 16px; flex-wrap: wrap;">
                        ${selectedFilters.visit_type !== 'PNC' ? statCard(exitWomenAnc, 'Exit Women (ANC)', '#78909c', 'exit_women_anc') : ''}
                        ${selectedFilters.visit_type !== 'ANC Follow-up' ? statCard(exitWomenPnc, 'Exit Women (PNC)', '#546e7a', 'exit_women_pnc') : ''}
                    </div>
                </div>` : ''}

                <div style="margin-bottom: 30px; max-width: 620px;">
                    <div id="my-worklist-wrapper"><div style="text-align:center; color:#999; padding:20px;">Loading...</div></div>
                </div>

                <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 20px; margin-bottom: 30px;">
                    <div>
                        <h5 style="font-size: 16px; font-weight: 600; margin-bottom: 15px;">Recent Registrations</h5>
                        <div id="recent-registrations-card" style="background: white; padding: 20px; border: 1px solid #ddd; border-radius: 8px; text-align: center; cursor: pointer; transition: all 0.2s ease;">
                            <div style="font-size: 32px; font-weight: bold;">${recentReg}</div>
                            <div style="font-size: 12px; color: #666;">Pregnancy Registrations, last 30 days</div>
                        </div>
                    </div>

                    <div>
                        <h5 style="font-size: 16px; font-weight: 600; margin-bottom: 15px;">Registration Overview</h5>
                        <div style="background: white; padding: 20px; border: 1px solid #ddd; border-radius: 8px;">
                            <div id="total-registrations-card" style="font-size: 48px; font-weight: bold; margin-bottom: 10px; cursor: pointer;">${totalReg}</div>
                            <div style="font-size: 14px; color: #666;">Total</div>
                        </div>
                    </div>
                </div>
            </div>
        `;

        page.main.html(html);

        loadWorklistData();

        page.main.find('#dashboard-apply-filters').on('click', function() {
            selectedFilters.village = page.main.find('#filter-village').val();
            selectedFilters.age_group = page.main.find('#filter-age-group').val();
            selectedFilters.gender = page.main.find('#filter-gender').val();
            selectedFilters.year = page.main.find('#filter-year').val();
            selectedFilters.month = page.main.find('#filter-month').val();
            selectedFilters.view_mode = page.main.find('#filter-view-mode').val();
            selectedFilters.period_date = page.main.find('#filter-period-date').val() || frappe.datetime.get_today();
            loadDataAndRender();
        });

        page.main.find('#dashboard-clear-filters').on('click', function() {
            selectedFilters.program = null;
            selectedFilters.visit_type = null;
            selectedFilters.village = 'All Villages';
            selectedFilters.age_group = 'All Ages';
            selectedFilters.gender = 'All';
            selectedFilters.year = 'All Years';
            selectedFilters.month = 'All Months';
            selectedFilters.view_mode = 'week';
            selectedFilters.period_date = frappe.datetime.get_today();
            loadDataAndRender();
        });

        page.main.find('#dashboard-open-filter').on('click', function() {
            showFilterDialog();
        });

        page.main.find('#dashboard-clear-visit-filter').on('click', function() {
            selectedFilters.program = null;
            selectedFilters.visit_type = null;
            loadDataAndRender();
        });

        page.main.find('#filter-view-mode').on('change', function() {
            selectedFilters.view_mode = $(this).val();
            loadDataAndRender();
        });

        page.main.find('#dashboard-prev-period').on('click', function() {
            let step = selectedFilters.view_mode === 'day' ? -1 : -7;
            selectedFilters.period_date = shiftDate(selectedFilters.period_date || frappe.datetime.get_today(), step);
            loadDataAndRender();
        });
        page.main.find('#dashboard-next-period').on('click', function() {
            let step = selectedFilters.view_mode === 'day' ? 1 : 7;
            selectedFilters.period_date = shiftDate(selectedFilters.period_date || frappe.datetime.get_today(), step);
            loadDataAndRender();
        });
        page.main.find('#dashboard-this-period').on('click', function() {
            selectedFilters.period_date = frappe.datetime.get_today();
            loadDataAndRender();
        });

        page.main.find('#recent-registrations-card').on('click', function() {
            showRecentRegistrationsDialog();
        });
        page.main.find('#total-registrations-card').on('click', function() {
            showTotalRegistrationsDialog();
        });

        // Attach events to the new stat cards (Household & Family / NCD sections)
        page.main.find('.chw-stat-card').on('click', function() {
            let reportType = $(this).data('report-type');
            let title = $(this).find('div').eq(1).text();
            if (reportType) {
                showGenericDrilldownDialog(reportType, title);
            }
        });
    }

    // ---- Cascading Program / Visit Type filter dialog ----
    function checkboxGroupHtml(name, options, selectedValue) {
        return options.map(opt => `
            <label style="display:flex; align-items:center; gap:8px; padding:6px 0; cursor:pointer; font-weight:normal;">
                <input type="checkbox" class="${name}-option" value="${opt.value}" ${opt.value === selectedValue ? 'checked' : ''} />
                ${opt.label}
            </label>
        `).join('');
    }

    function visitTypeSectionHtml(programLabel, visitTypeValue) {
        let program = PROGRAMS.find(p => p.label === programLabel);
        if (!program) return '';
        return `
            <div id="dialog-visit-type-section" style="margin-top:16px;">
                <div style="color:#666; font-size:13px; margin-bottom:8px;">Choose Visit Type</div>
                ${checkboxGroupHtml('dialog-visit-type', program.visitTypes, visitTypeValue)}
            </div>
        `;
    }

    function showFilterDialog() {
        let workingProgram = selectedFilters.program;
        let workingVisitType = selectedFilters.visit_type;

        let d = new frappe.ui.Dialog({
            title: 'Filter',
            fields: [{ fieldtype: 'HTML', fieldname: 'content' }],
            primary_action_label: 'Apply',
            primary_action: function() {
                selectedFilters.program = workingProgram;
                selectedFilters.visit_type = workingVisitType;
                d.hide();
                loadDataAndRender();
            }
        });

        function renderDialogBody() {
            d.fields_dict.content.$wrapper.html(`
                <div style="color:#666; font-size:13px; margin-bottom:8px;">Programs</div>
                ${checkboxGroupHtml('dialog-program', PROGRAMS.map(p => ({ label: p.label, value: p.label })), workingProgram)}
                ${visitTypeSectionHtml(workingProgram, workingVisitType)}
            `);

            d.$wrapper.find('.dialog-program-option').on('change', function() {
                let checked = this.checked;
                let value = $(this).val();
                d.$wrapper.find('.dialog-program-option').not(this).prop('checked', false);
                workingProgram = checked ? value : null;
                // Switching (or clearing) the program invalidates the previously chosen visit type.
                let program = PROGRAMS.find(p => p.label === workingProgram);
                workingVisitType = (program && program.visitTypes.length === 1) ? program.visitTypes[0].value : null;
                renderDialogBody();
            });

            d.$wrapper.find('.dialog-visit-type-option').on('change', function() {
                let checked = this.checked;
                let value = $(this).val();
                d.$wrapper.find('.dialog-visit-type-option').not(this).prop('checked', false);
                workingVisitType = checked ? value : null;
            });
        }

        renderDialogBody();
        d.show();
    }

    function renderRecordList(records) {
        if (!records || !records.length) {
            return '<div style="padding: 10px; color: #666;">No records available.</div>';
        }
        let esc = frappe.utils.escape_html;
        return `
            <div style="padding: 10px;">
                <table class="table table-bordered" style="width: 100%; border-collapse: collapse;">
                    <thead>
                        <tr style="background: #f5f5f5;">
                            <th style="padding: 8px; border: 1px solid #ddd; text-align: left;">Doctype</th>
                            <th style="padding: 8px; border: 1px solid #ddd; text-align: left;">Name</th>
                            <th style="padding: 8px; border: 1px solid #ddd; text-align: left;">Patient</th>
                            <th style="padding: 8px; border: 1px solid #ddd; text-align: left;">Date</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${records.map(rec => `
                            <tr style="cursor: pointer;" data-doctype="${esc(rec.doctype || '')}" data-name="${esc(rec.name || '')}">
                                <td style="padding: 8px; border: 1px solid #ddd;">${esc(rec.doctype || '')}</td>
                                <td style="padding: 8px; border: 1px solid #ddd;">${esc(rec.name || '')}</td>
                                <td style="padding: 8px; border: 1px solid #ddd;">${esc(rec.patient || '-')}</td>
                                <td style="padding: 8px; border: 1px solid #ddd;">${esc(rec.creation || rec.visit_date || rec.expected_date || '')}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        `;
    }

    // ---- Generic drill-down dialog for new stat cards (with village/phone columns + Excel download) ----
    function renderGenericRecordList(records) {
        if (!records || !records.length) {
            return '<div style="padding: 10px; color: #666;">No records available.</div>';
        }
        let esc = frappe.utils.escape_html;
        return `
            <div style="padding: 10px; max-height: 500px; overflow:auto;">
                <table class="table table-bordered" style="width: 100%; border-collapse: collapse;">
                    <thead>
                        <tr style="background: #f5f5f5;">
                            <th style="padding: 8px; border: 1px solid #ddd; text-align: left;">HH ID</th>
                            <th style="padding: 8px; border: 1px solid #ddd; text-align: left;">House Head Name</th>
                            <th style="padding: 8px; border: 1px solid #ddd; text-align: left;">Village</th>
                            <th style="padding: 8px; border: 1px solid #ddd; text-align: left;">Phone</th>
                            <th style="padding: 8px; border: 1px solid #ddd; text-align: left;">Created</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${records.map(rec => `
                            <tr style="cursor: pointer;" data-doctype="${esc(rec.doctype || '')}" data-name="${esc(rec.name || '')}">
                                <td style="padding: 8px; border: 1px solid #ddd;">${esc(rec.name || '')}</td>
                                <td style="padding: 8px; border: 1px solid #ddd;">${esc(rec.patient || '-')}</td>
                                <td style="padding: 8px; border: 1px solid #ddd;">${esc(rec.village || '-')}</td>
                                <td style="padding: 8px; border: 1px solid #ddd;">${esc(rec.phone || '-')}</td>
                                <td style="padding: 8px; border: 1px solid #ddd;">${esc(rec.creation || '')}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        `;
    }

    function showGenericDrilldownDialog(reportType, title) {
        frappe.call({
            method: 'chw.api.chw_visit_drilldown',
            args: { report_type: reportType, village: villageArg() },
            callback: function(r) {
                let records = (r.message && r.message.records) || [];
                let d = new frappe.ui.Dialog({
                    title: `${title} — ${records.length} records`,
                    size: 'extra-large',
                    fields: [
                        { fieldtype: 'HTML', fieldname: 'content' }
                    ],
                    primary_action_label: 'Download Excel',
                    primary_action: function() {
                        let villageQuery = villageArg() ? `&village=${encodeURIComponent(villageArg())}` : '';
                        window.open(
                            `/api/method/chw.api.chw_drilldown_excel?report_type=${reportType}${villageQuery}`,
                            '_blank'
                        );
                    }
                });
                d.fields_dict.content.$wrapper.html(renderGenericRecordList(records));
                d.show();
                d.$wrapper.find('tbody tr').on('click', function() {
                    let doctype = $(this).data('doctype');
                    let name = $(this).data('name');
                    if (doctype && name) {
                        frappe.set_route('Form', doctype, name);
                        d.hide();
                    }
                });
            }
        });
    }

    function showRecentRegistrationsDialog() {
        frappe.call({
            method: 'chw.api.chw_visit_drilldown',
            args: {
                report_type: 'recent_registrations',
                village: villageArg()
            },
            callback: function(r) {
                let records = (r.message && r.message.records) || [];
                let d = new frappe.ui.Dialog({
                    title: 'Recent Registrations',
                    fields: [
                        { fieldtype: 'HTML', fieldname: 'content' }
                    ]
                });
                d.fields_dict.content.$wrapper.html(renderRecordList(records));
                d.show();
                d.$wrapper.find('tbody tr').on('click', function() {
                    let doctype = $(this).data('doctype');
                    let name = $(this).data('name');
                    if (doctype && name) {
                        frappe.set_route('Form', doctype, name);
                        d.hide();
                    }
                });
            }
        });
    }

    function showTotalRegistrationsDialog() {
        frappe.call({
            method: 'chw.api.chw_visit_drilldown',
            args: { report_type: 'all_registrations', village: villageArg() },
            callback: function(r) {
                let records = (r.message && r.message.records) || [];
                let d = new frappe.ui.Dialog({
                    title: 'Total Registrations',
                    fields: [
                        { fieldtype: 'HTML', fieldname: 'content' }
                    ]
                });
                d.fields_dict.content.$wrapper.html(renderRecordList(records));
                d.show();
                d.$wrapper.find('tbody tr').on('click', function() {
                    let doctype = $(this).data('doctype');
                    let name = $(this).data('name');
                    if (doctype && name) {
                        frappe.set_route('Form', doctype, name);
                        d.hide();
                    }
                });
            }
        });
    }

    // Initial load: fetch the real village list before the first render so the
    // Village filter isn't stuck showing just "All Villages".
    frappe.call({
        method: 'chw.api.get_villages',
        callback: function(r) {
            if (r.message && r.message.length) {
                villageOptions = ['All Villages'].concat(r.message);
            }
            loadDataAndRender();
        }
    });
};
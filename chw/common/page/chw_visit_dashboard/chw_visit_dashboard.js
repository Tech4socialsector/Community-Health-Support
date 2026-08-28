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
                { label: 'PNC', value: 'PNC' }
            ]
        },
        {
            label: 'Child',
            visitTypes: [
                { label: 'Growth Monitoring', value: 'Child Growth Monitoring' }
            ]
        },
        {
            label: 'NCD',
            visitTypes: [
                { label: 'NCD', value: 'NCD' }
            ]
        },
        {
            label: 'Mental Health',
            visitTypes: [
                { label: 'Mental Health', value: 'Mental Health' }
            ]
        }
    ];

    function programFor(visitTypeValue) {
        if (!visitTypeValue) return null;
        let program = PROGRAMS.find(p => p.visitTypes.some(vt => vt.value === visitTypeValue));
        return program ? program.label : null;
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

    function bigVisitCard(id, value, label, color) {
        return `
            <div id="${id}" style="background: ${color}; color: white; padding: 30px; border-radius: 8px; text-align: center; cursor: pointer; transition: all 0.3s ease;" onmouseover="this.style.boxShadow='0 4px 12px rgba(0,0,0,0.3)'; this.style.transform='translateY(-2px)';" onmouseout="this.style.boxShadow='none'; this.style.transform='translateY(0)';">
                <div style="font-size: 48px; font-weight: bold;">${value}</div>
                <div>${label}</div>
            </div>
        `;
    }

    function visitDetailsHtml(scheduled, backlog, viewMode) {
        // Always a single combined Pending/Missed pair for the selected day or week -
        // narrowed to whichever Program/Visit Type is selected in FILTER, or the total when none is.
        let pendingLabel = viewMode === 'day' ? 'Pending Today' : 'Pending This Week';
        return `
            <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 20px;">
                ${bigVisitCard('scheduled-card', scheduled, pendingLabel, '#2e7d32')}
                ${bigVisitCard('backlog-card', backlog, 'Missed / Due List', '#c62828')}
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
        let scheduled = dashboardData.scheduled_count || 0;
        let backlog = dashboardData.backlog_count || 0;
        let recentReg = dashboardData.recent_registrations || 0;
        let recentEnroll = dashboardData.recent_enrollments || 0;
        let recentVisits = dashboardData.recent_visits || 0;
        let totalReg = dashboardData.total_registrations || 0;
        let normalChildren = dashboardData.normal_children || 0;
        let mamChildren = dashboardData.mam_children || 0;
        let samChildren = dashboardData.sam_children || 0;
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

                ${selectedFilters.program === 'Child' ? `
                <div style="margin-bottom: 30px;">
                    <h5 style="font-size: 13px; font-weight: 700; letter-spacing:0.5px; color: #333; margin-bottom: 12px;">CHILD GROWTH MONITORING</h5>
                    <div style="display: flex; gap: 16px; flex-wrap: wrap;">
                        ${statCard(normalChildren, 'Normal', '#66bb6a', 'normal_children')}
                        ${statCard(mamChildren, 'MAM (Moderate)', '#ffa726', 'mam_children')}
                        ${statCard(samChildren, 'SAM (Severe)', '#ef5350', 'sam_children')}
                    </div>
                </div>` : ''}

                <div style="margin-bottom: 30px;">
                    <h5 style="font-size: 16px; font-weight: 600; margin-bottom: 15px;">Visit Details</h5>
                    ${visitDetailsHtml(scheduled, backlog, viewMode)}
                </div>

                <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 20px; margin-bottom: 30px;">
                    <div>
                        <h5 style="font-size: 16px; font-weight: 600; margin-bottom: 15px;">Recent Statistics</h5>
                        <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 15px;">
                            <div id="recent-registrations-card" style="background: white; padding: 20px; border: 1px solid #ddd; border-radius: 8px; text-align: center; cursor: pointer; transition: all 0.2s ease;">
                                <div style="font-size: 32px; font-weight: bold;">${recentReg}</div>
                                <div style="font-size: 12px; color: #666;">Recent registrations</div>
                            </div>
                            <div id="recent-enrollments-card" style="background: white; padding: 20px; border: 1px solid #ddd; border-radius: 8px; text-align: center; cursor: pointer; transition: all 0.2s ease;">
                                <div style="font-size: 32px; font-weight: bold;">${recentEnroll}</div>
                                <div style="font-size: 12px; color: #666;">Recent enrollments</div>
                            </div>
                            <div id="total-visits-card" style="background: white; padding: 20px; border: 1px solid #ddd; border-radius: 8px; text-align: center; grid-column: 1 / -1; cursor: pointer; transition: all 0.2s ease;">
                                <div style="font-size: 32px; font-weight: bold;">${recentVisits}</div>
                                <div style="font-size: 12px; color: #666;">Total pending visits ${viewMode === 'day' ? 'today' : 'this week'}</div>
                            </div>
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
        page.main.find('#recent-enrollments-card').on('click', function() {
            showRecentEnrollmentsDialog();
        });
        page.main.find('#total-visits-card').on('click', function() {
            showTotalVisitsDialog();
        });
        page.main.find('#total-registrations-card').on('click', function() {
            showTotalRegistrationsDialog();
        });
        page.main.find('#backlog-card').on('click', function() {
            showBacklogDialog();
        });

        // Attach event to scheduled (pending this week) visits card
        page.main.find('#scheduled-card').on('click', function() {
            showPendingDialog();
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

    function showRecentEnrollmentsDialog() {
        frappe.call({
            method: 'chw.api.chw_visit_drilldown',
            args: {
                report_type: 'recent_enrollments'
            },
            callback: function(r) {
                let records = (r.message && r.message.records) || [];
                let d = new frappe.ui.Dialog({
                    title: 'Recent Enrollments',
                    fields: [
                        { fieldtype: 'HTML', fieldname: 'content' }
                    ]
                });
                if (records.length) {
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
                } else {
                    d.fields_dict.content.$wrapper.html('<div style="padding: 10px; color: #666;">No enrollment records available.</div>');
                    d.show();
                }
            }
        });
    }

    function showTotalVisitsDialog() {
        let viewMode = selectedFilters.view_mode;
        let periodRange = getPeriodBounds(selectedDate, viewMode);
        let periodStr = viewMode === 'day' ? periodRange.start : `${periodRange.start} to ${periodRange.end}`;
        let d = new frappe.ui.Dialog({
            title: `Total Pending Visits ${viewMode === 'day' ? 'Today' : 'This Week'}`,
            fields: [
                { fieldtype: 'HTML', fieldname: 'content' }
            ]
        });
        d.fields_dict.content.$wrapper.html(`
            <div style="padding: 10px;">
                <p>${viewMode === 'day' ? 'Day' : 'Week'}: <strong>${periodStr}</strong>: <strong>${dashboardData.recent_visits || 0}</strong> pending visits.</p>
                <p>This is your own pending count for the selected visit type and ${viewMode === 'day' ? 'day' : 'week'}.</p>
            </div>
        `);
        d.show();
    }

    function showPendingDialog(visitTypeOverride) {
        let vt = visitTypeOverride !== undefined ? visitTypeOverride : selectedFilters.visit_type;
        let viewMode = selectedFilters.view_mode;
        let periodLabel = viewMode === 'day' ? 'Pending Today' : 'Pending This Week';
        frappe.call({
            method: 'chw.api.chw_visit_drilldown',
            args: {
                report_type: 'pending_visits',
                visit_type: vt,
                week_start: getPeriodBounds(selectedDate, viewMode).start,
                village: villageArg(),
                view_mode: viewMode
            },
            callback: function(r) {
                let records = (r.message && r.message.records) || [];
                let d = new frappe.ui.Dialog({
                    title: vt ? `${periodLabel} — ${vt}` : periodLabel,
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

    function showBacklogDialog(visitTypeOverride) {
        let vt = visitTypeOverride !== undefined ? visitTypeOverride : selectedFilters.visit_type;
        let viewMode = selectedFilters.view_mode;
        frappe.call({
            method: 'chw.api.chw_visit_drilldown',
            args: {
                report_type: 'backlog_visits',
                visit_type: vt,
                week_start: getPeriodBounds(selectedDate, viewMode).start,
                village: villageArg(),
                view_mode: viewMode
            },
            callback: function(r) {
                let records = (r.message && r.message.records) || [];
                let d = new frappe.ui.Dialog({
                    title: vt ? `Missed / Due List — ${vt}` : 'Missed / Due List',
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
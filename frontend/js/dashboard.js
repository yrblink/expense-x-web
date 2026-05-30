requireAuth();

const CHART_COLORS = [
    '#00FFB2','#ef4444','#f59e0b','#a78bfa',
    '#22c55e','#fb923c','#38bdf8','#f472b6',
];

let chart = null;
let breakdownPie = null;
let breakdownView = 'pie';
let lastSummary = null;

document.addEventListener('DOMContentLoaded', async () => {
    initSidebar();
    await loadDashboard();
});

async function loadDashboard() {
    const [summaryRes, txRes, billsRes] = await Promise.all([
        apiGet('/summary'),
        apiGet('/transactions'),
        apiGet('/bills'),
    ]);

    if (!summaryRes || !txRes || !billsRes) {
        const tbody = document.getElementById('recent-tbody');
        if (tbody) tbody.innerHTML = '<tr><td colspan="4" class="text-center text-sub" style="padding:24px;">Could not connect to server</td></tr>';
        return;
    }

    const summary = await summaryRes.json();
    const txData  = await txRes.json();
    const bills   = await billsRes.json();
    lastSummary = summary;

    // Stat cards
    setText('stat-balance', formatMoney(summary.balance));
    setText('stat-income',  formatMoney(summary.monthlyIncome));
    setText('stat-spent',   formatMoney(summary.totalSpent));
    setText('stat-bills',   formatMoney(summary.billsDue));

    // Balance breakdown bars
    renderBreakdown(summary);

    // Spending chart
    renderChart(summary.byCategory);

    // Recent transactions (last 5)
    renderRecentTx(txData.slice(0, 5));

    // Upcoming bills (next 5 unpaid, soonest first)
    renderUpcoming(bills);
}

function setText(id, value) {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
}

function renderBreakdown(s) {
    const start    = s.startingBalance  || 0;
    const income   = s.allTimeIncome    || 0;
    const expenses = s.allTimeExpenses  || 0;
    const paid     = s.allTimePaidBills || 0;
    const unpaid   = s.billsDue         || 0;

    setText('bd-start',    formatMoney(start));
    setText('bd-income',   formatMoney(income));
    setText('bd-expenses', formatMoney(expenses));
    setText('bd-paid',     formatMoney(paid));
    setText('bd-unpaid',   formatMoney(unpaid));
    setText('bd-current',  formatMoney(s.balance));

    const afterEl = document.getElementById('bd-after');
    afterEl.textContent = formatMoney(s.balanceAfterBills);
    afterEl.classList.toggle('red', s.balanceAfterBills < 0);

    // Bar view: scale bars to the max value so visual size reflects impact.
    const max = Math.max(start, income, expenses, paid, unpaid, 1);
    const pct = v => (v / max) * 100 + '%';
    requestAnimationFrame(() => {
        document.getElementById('bar-start').style.width    = pct(start);
        document.getElementById('bar-income').style.width   = pct(income);
        document.getElementById('bar-expenses').style.width = pct(expenses);
        document.getElementById('bar-paid').style.width     = pct(paid);
        document.getElementById('bar-unpaid').style.width   = pct(unpaid);
    });

    // Pie view: same five components by absolute value.
    renderBreakdownPie(start, income, expenses, paid, unpaid, s.balanceAfterBills);
}

function _breakdownColors() {
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    return {
        start:   isDark ? '#3a3a3a' : '#c4c4c2',
        income:  isDark ? '#00FFB2' : '#007a54',
        expense: isDark ? '#ef4444' : '#dc2626',
        paid:    isDark ? '#fb923c' : '#c2410c',
        unpaid:  isDark ? '#f59e0b' : '#b45309',
    };
}

function renderBreakdownPie(start, income, expenses, paid, unpaid, after) {
    const canvas = document.getElementById('breakdown-pie');
    if (!canvas) return;

    const c = _breakdownColors();
    const labels  = ['Starting', 'Income', 'Expenses', 'Paid Bills', 'Unpaid Bills'];
    const data    = [start, income, expenses, paid, unpaid];
    const colors  = [c.start, c.income, c.expense, c.paid, c.unpaid];

    // Center text
    const centerEl = document.getElementById('bd-after-pie');
    centerEl.textContent = formatMoney(after);
    centerEl.classList.toggle('red', after < 0);

    if (breakdownPie) breakdownPie.destroy();
    breakdownPie = new Chart(canvas, {
        type: 'doughnut',
        data: {
            labels,
            datasets: [{
                data,
                backgroundColor: colors,
                borderWidth: 0,
                hoverOffset: 8,
            }],
        },
        options: {
            cutout: '70%',
            responsive: true,
            maintainAspectRatio: true,
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: { label: ctx => ` ${ctx.label}: ${formatMoney(ctx.raw)}` },
                },
            },
            animation: { duration: 600 },
        },
    });

    // Custom legend
    const legend = document.getElementById('breakdown-pie-legend');
    const total = data.reduce((a, b) => a + b, 0) || 1;
    legend.innerHTML = labels.map((lbl, i) => `
        <div class="breakdown-pie-legend-item">
          <span class="breakdown-pie-legend-swatch" style="background:${colors[i]}"></span>
          <span class="breakdown-pie-legend-label">${lbl} · ${Math.round((data[i] / total) * 100)}%</span>
          <span class="breakdown-pie-legend-value">${formatMoney(data[i])}</span>
        </div>
    `).join('');
}

function setBreakdownView(mode) {
    breakdownView = mode;
    document.querySelectorAll('.view-toggle-btn').forEach(b => {
        b.classList.toggle('active', b.dataset.view === mode);
    });
    document.getElementById('view-bar').hidden = mode !== 'bar';
    document.getElementById('view-pie').hidden = mode !== 'pie';
    // Re-render so Chart.js picks up the now-visible canvas size.
    if (mode === 'pie' && lastSummary) {
        renderBreakdownPie(
            lastSummary.startingBalance  || 0,
            lastSummary.allTimeIncome    || 0,
            lastSummary.allTimeExpenses  || 0,
            lastSummary.allTimePaidBills || 0,
            lastSummary.billsDue         || 0,
            lastSummary.balanceAfterBills,
        );
    }
}

function renderChart(byCategory) {
    const canvas  = document.getElementById('spending-chart');
    const noData  = document.getElementById('chart-no-data');

    if (!byCategory || byCategory.length === 0) {
        canvas.style.display = 'none';
        noData.style.display = '';
        return;
    }

    canvas.style.display = '';
    noData.style.display = 'none';

    if (chart) chart.destroy();

    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    chart = new Chart(canvas, {
        type: 'doughnut',
        data: {
            labels:   byCategory.map(c => c.category),
            datasets: [{
                data:            byCategory.map(c => c.total),
                backgroundColor: CHART_COLORS.slice(0, byCategory.length),
                borderWidth: 0,
                hoverOffset: 6,
            }],
        },
        options: {
            cutout: '68%',
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: {
                        color: isDark ? '#909090' : '#606060',
                        padding: 12,
                        font: { size: 12 },
                    },
                },
                tooltip: {
                    callbacks: {
                        label: ctx => ` ${ctx.label}: ${formatMoney(ctx.raw)}`,
                    },
                },
            },
        },
    });
}

function renderRecentTx(txList) {
    const tbody = document.getElementById('recent-tbody');
    if (txList.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" class="text-center text-sub" style="padding:24px;">No transactions yet</td></tr>';
        return;
    }
    tbody.innerHTML = txList.map(t => {
        const cls = t.type === 'income' ? 'amount-positive' : 'amount-negative';
        return `
            <tr>
              <td>${t.date}</td>
              <td><span class="badge">${t.category}</span></td>
              <td class="${cls}">${formatMoney(t.amount)}</td>
              <td class="text-sub">${t.notes || '—'}</td>
            </tr>
        `;
    }).join('');
}

const MONTHS = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];

function renderUpcoming(bills) {
    const list = document.getElementById('upcoming-list');
    const unpaid = bills.filter(b => !b.isPaid)
        .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
        .slice(0, 5);

    if (unpaid.length === 0) {
        list.innerHTML = '<div class="text-center text-sub" style="padding:32px;">No upcoming bills — you\'re all caught up.</div>';
        return;
    }

    const today = new Date(); today.setHours(0,0,0,0);
    list.innerHTML = unpaid.map(b => {
        const d = new Date(b.dueDate + 'T00:00:00');
        const day = d.getDate();
        const mon = MONTHS[d.getMonth()];
        const diffDays = Math.round((d - today) / 86400000);
        let statusCls, statusText;
        if (diffDays < 0)       { statusCls = 'overdue'; statusText = `${Math.abs(diffDays)} days overdue`; }
        else if (diffDays === 0){ statusCls = 'overdue'; statusText = 'Due today'; }
        else if (diffDays <= 7) { statusCls = 'soon';    statusText = `Due in ${diffDays} ${diffDays === 1 ? 'day' : 'days'}`; }
        else                    { statusCls = 'later';   statusText = `In ${diffDays} days`; }

        return `
            <div class="upcoming-row ${statusCls}">
              <div class="upcoming-date">
                <span class="upcoming-date-day">${day}</span>
                <span class="upcoming-date-mon">${mon}</span>
              </div>
              <div class="upcoming-info">
                <span class="upcoming-name">${b.name}</span>
                <span class="upcoming-meta">${b.category} · ${statusText}</span>
              </div>
              <span class="upcoming-amount ${statusCls === 'overdue' ? 'overdue' : ''}">${formatMoney(b.amountDue)}</span>
            </div>
        `;
    }).join('');
}

function openBalanceModal() {
    const input = document.getElementById('input-balance');
    if (input && lastSummary && lastSummary.startingBalance != null)
        input.value = Math.round(lastSummary.startingBalance);
    hideAlert('alert-balance');
    openModal('modal-balance');
}

async function saveStartingBalance() {
    const val = parseFloat(document.getElementById('input-balance').value);
    if (isNaN(val)) return showAlert('alert-balance', 'Enter a valid number');
    const res = await apiPut('/user/starting_balance', { startingBalance: val });
    if (res && res.ok) {
        closeModal('modal-balance');
        await loadDashboard();
    } else {
        showAlert('alert-balance', 'Failed to save — check your connection');
    }
}

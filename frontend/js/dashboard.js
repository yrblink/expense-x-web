requireAuth();

const CHART_COLORS = [
    '#1677ff','#52c41a','#fa8c16','#ff4d4f',
    '#722ed1','#faad14','#13c2c2','#eb2f96',
];

let chart = null;
let lastSummary = null;

document.addEventListener('DOMContentLoaded', async () => {
    initSidebar();
    await loadDashboard();
});

async function loadDashboard() {
    const [summaryRes, txRes] = await Promise.all([
        apiGet('/summary'),
        apiGet('/transactions'),
    ]);

    if (!summaryRes || !txRes) {
        const tbody = document.getElementById('recent-tbody');
        if (tbody) tbody.innerHTML = '<tr><td colspan="4" class="text-center text-sub" style="padding:24px;">Could not connect to server</td></tr>';
        return;
    }

    const summary = await summaryRes.json();
    const txData  = await txRes.json();
    lastSummary = summary;

    // Stat cards
    setText('stat-balance', formatMoney(summary.balance));
    setText('stat-income',  formatMoney(summary.monthlyIncome));
    setText('stat-spent',   formatMoney(summary.totalSpent));
    setText('stat-bills',   formatMoney(summary.billsDue));

    // Balance breakdown
    setText('bd-start',    formatMoney(summary.startingBalance));
    setText('bd-income',   formatMoney(summary.allTimeIncome));
    setText('bd-expenses', formatMoney(summary.allTimeExpenses));
    setText('bd-paid',     formatMoney(summary.allTimePaidBills));
    setText('bd-current',  formatMoney(summary.balance));
    setText('bd-unpaid',   formatMoney(summary.billsDue));

    const afterEl = document.getElementById('bd-after');
    afterEl.textContent = formatMoney(summary.balanceAfterBills);
    afterEl.style.color = summary.balanceAfterBills < 0 ? 'var(--red)' : 'var(--green)';

    // Spending chart
    renderChart(summary.byCategory);

    // Recent transactions (last 5)
    renderRecentTx(txData.slice(0, 5));
}

function setText(id, value) {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
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
                        color: isDark ? '#8b93b0' : '#8c93ab',
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

function openBalanceModal() {
    const input = document.getElementById('input-balance');
    if (input && lastSummary && lastSummary.startingBalance != null)
        input.value = lastSummary.startingBalance.toFixed(2);
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

requireAuth();

const CHART_COLORS = [
    '#89b4fa','#a6e3a1','#fab387','#f38ba8',
    '#cba6f7','#f9e2af','#94e2d5','#89dceb',
];

let chart = null;

document.addEventListener('DOMContentLoaded', async () => {
    initSidebar();
    await loadDashboard();
});

async function loadDashboard() {
    const [summaryRes, txRes] = await Promise.all([
        apiGet('/summary'),
        apiGet('/transactions'),
    ]);

    if (!summaryRes || !txRes) return;

    const summary = await summaryRes.json();
    const txData  = await txRes.json();

    // Stat cards
    document.getElementById('stat-balance').textContent = formatMoney(summary.balance);
    document.getElementById('stat-spent').textContent   = formatMoney(summary.totalSpent);
    document.getElementById('stat-bills').textContent   = formatMoney(summary.billsDue);

    // Projected balance row
    document.getElementById('proj-balance').textContent = formatMoney(summary.balance);
    document.getElementById('proj-bills').textContent   = formatMoney(summary.billsDue);
    const after = summary.balanceAfterBills;
    const afterEl = document.getElementById('proj-after');
    afterEl.textContent = formatMoney(after);
    afterEl.style.color = after < 0 ? 'var(--red)' : 'var(--green)';

    // Spending chart
    renderChart(summary.byCategory);

    // Recent transactions (last 5)
    renderRecentTx(txData.slice(0, 5));
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
                    labels: { color: '#a6adc8', padding: 12, font: { size: 12 } },
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
    tbody.innerHTML = txList.map(t => `
        <tr>
          <td>${t.date}</td>
          <td><span class="badge">${t.category}</span></td>
          <td class="amount-negative">${formatMoney(t.amount)}</td>
          <td class="text-sub">${t.notes || '—'}</td>
        </tr>
    `).join('');
}

async function saveBalance() {
    const val = parseFloat(document.getElementById('input-balance').value);
    if (isNaN(val) || val < 0) return;
    const res = await apiPut('/user/balance', { balance: val });
    if (res && res.ok) {
        closeModal('modal-balance');
        await loadDashboard();
    }
}

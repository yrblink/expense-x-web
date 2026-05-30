requireAuth();

let budgetPeriod = 'monthly';
let wheelChart   = null;

document.addEventListener('DOMContentLoaded', () => {
    initSidebar();
    loadBudgets();
});

async function loadBudgets() {
    const res = await apiGet('/budgets');
    if (!res) return;
    const data = await res.json();
    renderOverview(data);
    renderBudgets(data);
}

function renderOverview(budgets) {
    const totalLimit = budgets.reduce((acc, b) => acc + (b.monthlyLimit || 0), 0);
    const totalSpent = budgets.reduce((acc, b) => acc + (b.spent || 0), 0);
    const remaining  = totalLimit - totalSpent;
    const pct        = totalLimit > 0 ? Math.min((totalSpent / totalLimit) * 100, 100) : 0;

    document.getElementById('overview-limit').textContent     = formatMoney(totalLimit);
    document.getElementById('overview-spent').textContent     = formatMoney(totalSpent);
    document.getElementById('overview-remaining').textContent = formatMoney(remaining);
    document.getElementById('overview-pct').textContent       = Math.round(pct) + '%';

    const remainEl = document.getElementById('overview-remaining');
    remainEl.classList.toggle('red',   remaining < 0);
    remainEl.classList.toggle('green', remaining >= 0);

    const isDark   = document.documentElement.getAttribute('data-theme') === 'dark';
    const trackBg  = isDark ? '#1f1f1f' : '#e8e8e6';
    const fillColor = pct >= 90 ? (isDark ? '#ef4444' : '#dc2626')
                     : pct >= 70 ? (isDark ? '#f59e0b' : '#b45309')
                     :              (isDark ? '#00FFB2' : '#007a54');

    const canvas = document.getElementById('budget-wheel');
    if (wheelChart) wheelChart.destroy();
    wheelChart = new Chart(canvas, {
        type: 'doughnut',
        data: {
            datasets: [{
                data: [pct, 100 - pct],
                backgroundColor: [fillColor, trackBg],
                borderWidth: 0,
                circumference: 360,
            }],
        },
        options: {
            cutout: '78%',
            plugins: { legend: { display: false }, tooltip: { enabled: false } },
            animation: { animateRotate: true, duration: 700 },
        },
    });
}

function renderBudgets(budgets) {
    const tbody = document.getElementById('budget-grid');
    if (budgets.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:48px;color:var(--subtext);">No budgets set yet. Add one to start tracking.</td></tr>`;
        return;
    }
    tbody.innerHTML = budgets.map(b => {
        const pct   = b.monthlyLimit > 0 ? Math.min((b.spent / b.monthlyLimit) * 100, 100) : 0;
        const cls   = pct >= 90 ? 'over' : pct >= 70 ? 'warn' : 'ok';
        const color = pct >= 90 ? 'var(--red)' : pct >= 70 ? 'var(--yellow)' : 'var(--green)';
        const period = b.period || 'monthly';
        return `
            <tr>
              <td style="font-weight:600;">${b.category}</td>
              <td><span class="period-badge">${period}</span></td>
              <td>${formatMoney(b.monthlyLimit)}</td>
              <td>${formatMoney(b.spent)}</td>
              <td style="min-width:140px;">
                <div class="progress-bar">
                  <div class="progress-fill ${cls}" style="width:${pct}%"></div>
                </div>
              </td>
              <td><span class="budget-pct" style="color:${color};">${Math.round(pct)}%</span></td>
              <td style="text-align:right;">
                <button class="btn btn-danger btn-sm" onclick="deleteBudget(${b.id})">Remove</button>
              </td>
            </tr>
        `;
    }).join('');
}

function openAddBudgetModal() {
    setBudgetPeriod('monthly');
    document.getElementById('form-add-budget').reset();
    hideAlert('alert-budget-modal');
    openModal('modal-add-budget');
}

function setBudgetPeriod(period) {
    budgetPeriod = period;
    document.querySelectorAll('#form-add-budget .segmented-btn').forEach(b => {
        b.classList.toggle('active', b.dataset.period === period);
    });
    const label = document.getElementById('budget-limit-label');
    if (label) label.textContent = period === 'weekly' ? 'Weekly' : 'Monthly';
}

async function handleSetBudget(e) {
    e.preventDefault();
    hideAlert('alert-budget-modal');

    const body = {
        category:     document.getElementById('budget-category').value,
        monthlyLimit: parseFloat(document.getElementById('budget-limit').value),
        period:       budgetPeriod,
    };

    const res = await apiPost('/budgets', body);
    if (!res) return showAlert('alert-budget-modal', 'Network error');
    const data = await res.json();
    if (!res.ok) return showAlert('alert-budget-modal', data.error || 'Failed to save budget');

    closeModal('modal-add-budget');
    document.getElementById('form-add-budget').reset();
    await loadBudgets();
}

async function deleteBudget(id) {
    if (!confirm('Remove this budget?')) return;
    const res = await apiDelete(`/budgets/${id}`);
    if (res && res.ok) await loadBudgets();
    else showAlert('alert-budgets', 'Failed to delete budget');
}

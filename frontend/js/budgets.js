requireAuth();

document.addEventListener('DOMContentLoaded', () => {
    initSidebar();
    loadBudgets();
});

async function loadBudgets() {
    const res = await apiGet('/budgets');
    if (!res) return;
    const data = await res.json();
    renderBudgets(data);
}

function renderBudgets(budgets) {
    const tbody = document.getElementById('budget-grid');
    if (budgets.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:48px;color:var(--subtext);">No budgets set yet. Add one to start tracking.</td></tr>`;
        return;
    }
    tbody.innerHTML = budgets.map(b => {
        const pct   = b.monthlyLimit > 0 ? Math.min((b.spent / b.monthlyLimit) * 100, 100) : 0;
        const cls   = pct >= 90 ? 'over' : pct >= 70 ? 'warn' : 'ok';
        const color = pct >= 90 ? 'var(--red)' : pct >= 70 ? 'var(--yellow)' : 'var(--green)';
        return `
            <tr>
              <td style="font-weight:600;">${b.category}</td>
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

async function handleSetBudget(e) {
    e.preventDefault();
    hideAlert('alert-budget-modal');

    const body = {
        category:     document.getElementById('budget-category').value,
        monthlyLimit: parseFloat(document.getElementById('budget-limit').value),
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

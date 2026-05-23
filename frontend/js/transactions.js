requireAuth();

const TX_CATEGORIES = {
    expense: ['Groceries','Transportation','Dining Out','Entertainment','Utilities',
              'Healthcare','Shopping','Education','Personal Care','Other'],
    income:  ['Salary','Freelance','Investment','Gift','Refund','Bonus','Other'],
};

let txType = 'expense';

document.addEventListener('DOMContentLoaded', () => {
    initSidebar();
    document.getElementById('tx-date').value = new Date().toISOString().split('T')[0];
    setTxType('expense');
    loadTransactions();
});

function setTxType(type) {
    txType = type;
    document.querySelectorAll('.type-toggle-btn').forEach(b => {
        b.classList.toggle('active', b.dataset.type === type);
    });
    const select = document.getElementById('tx-category');
    if (select) {
        select.innerHTML = '<option value="">Select…</option>' +
            TX_CATEGORIES[type].map(c => `<option>${c}</option>`).join('');
    }
    const submitBtn = document.getElementById('btn-tx-submit');
    if (submitBtn) submitBtn.textContent = type === 'income' ? 'Add Income' : 'Add Expense';
}

async function loadTransactions() {
    const res = await apiGet('/transactions');
    if (!res) {
        const tbody = document.getElementById('tx-tbody');
        if (tbody) tbody.innerHTML = '<tr><td colspan="6" class="text-center text-sub" style="padding:40px;">Could not connect to server</td></tr>';
        return;
    }
    const data = await res.json();
    renderTable(data);
}

function renderTable(txList) {
    const tbody = document.getElementById('tx-tbody');
    if (txList.length === 0) {
        tbody.innerHTML = `
            <tr>
              <td colspan="6" class="text-center text-sub" style="padding:40px;">
                No transactions yet. Add your first one!
              </td>
            </tr>`;
        return;
    }
    tbody.innerHTML = txList.map(t => {
        const isIncome = t.type === 'income';
        const amountCls = isIncome ? 'amount-positive' : 'amount-negative';
        const typeBadge = isIncome
            ? '<span class="badge badge-paid">Income</span>'
            : '<span class="badge badge-unpaid">Expense</span>';
        return `
            <tr>
              <td>${t.date}</td>
              <td>${typeBadge}</td>
              <td><span class="badge">${t.category}</span></td>
              <td class="${amountCls}">${formatMoney(t.amount)}</td>
              <td class="text-sub">${t.notes || '—'}</td>
              <td>
                <button class="btn btn-danger btn-sm" onclick="deleteTx(${t.id})">Delete</button>
              </td>
            </tr>
        `;
    }).join('');
}

async function handleAddTx(e) {
    e.preventDefault();
    hideAlert('alert-modal');

    const body = {
        date:     document.getElementById('tx-date').value,
        category: document.getElementById('tx-category').value,
        amount:   parseFloat(document.getElementById('tx-amount').value),
        notes:    document.getElementById('tx-notes').value.trim(),
        type:     txType,
    };

    const res = await apiPost('/transactions', body);
    if (!res) return showAlert('alert-modal', 'Network error');
    const data = await res.json();
    if (!res.ok) return showAlert('alert-modal', data.error || 'Failed to add transaction');

    closeModal('modal-add-tx');
    document.getElementById('form-add-tx').reset();
    document.getElementById('tx-date').value = new Date().toISOString().split('T')[0];
    setTxType('expense');
    await loadTransactions();
}

async function deleteTx(id) {
    if (!confirm('Delete this transaction?')) return;
    const res = await apiDelete(`/transactions/${id}`);
    if (res && res.ok) {
        await loadTransactions();
    } else {
        showAlert('alert-tx', 'Failed to delete transaction');
    }
}

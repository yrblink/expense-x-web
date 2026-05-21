requireAuth();

document.addEventListener('DOMContentLoaded', () => {
    initSidebar();
    // Default date to today
    document.getElementById('tx-date').value = new Date().toISOString().split('T')[0];
    loadTransactions();
});

async function loadTransactions() {
    const res = await apiGet('/transactions');
    if (!res) return;
    const data = await res.json();
    renderTable(data);
}

function renderTable(txList) {
    const tbody = document.getElementById('tx-tbody');
    if (txList.length === 0) {
        tbody.innerHTML = `
            <tr>
              <td colspan="5" class="text-center text-sub" style="padding:40px;">
                No transactions yet. Add your first one!
              </td>
            </tr>`;
        return;
    }
    tbody.innerHTML = txList.map(t => `
        <tr>
          <td>${t.date}</td>
          <td><span class="badge">${t.category}</span></td>
          <td class="amount-negative">${formatMoney(t.amount)}</td>
          <td class="text-sub">${t.notes || '—'}</td>
          <td>
            <button class="btn btn-danger btn-sm" onclick="deleteTx(${t.id})">Delete</button>
          </td>
        </tr>
    `).join('');
}

async function handleAddTx(e) {
    e.preventDefault();
    hideAlert('alert-modal');

    const body = {
        date:     document.getElementById('tx-date').value,
        category: document.getElementById('tx-category').value,
        amount:   parseFloat(document.getElementById('tx-amount').value),
        notes:    document.getElementById('tx-notes').value.trim(),
    };

    const res = await apiPost('/transactions', body);
    if (!res) return showAlert('alert-modal', 'Network error');
    const data = await res.json();
    if (!res.ok) return showAlert('alert-modal', data.error || 'Failed to add transaction');

    closeModal('modal-add-tx');
    document.getElementById('form-add-tx').reset();
    document.getElementById('tx-date').value = new Date().toISOString().split('T')[0];
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

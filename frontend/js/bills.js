requireAuth();

document.addEventListener('DOMContentLoaded', () => {
    initSidebar();
    loadBills();
});

async function loadBills() {
    const [billsRes, summaryRes] = await Promise.all([
        apiGet('/bills'),
        apiGet('/summary'),
    ]);
    if (!billsRes || !summaryRes) return;

    const bills   = await billsRes.json();
    const summary = await summaryRes.json();

    // Summary bar
    document.getElementById('sum-balance').textContent = formatMoney(summary.balance);
    document.getElementById('sum-bills').textContent   = formatMoney(summary.billsDue);
    const after = summary.balanceAfterBills;
    const afterEl = document.getElementById('sum-after');
    afterEl.textContent = formatMoney(after);
    afterEl.style.color = after < 0 ? 'var(--red)' : 'var(--green)';

    renderBills(bills);
}

function renderBills(bills) {
    const tbody = document.getElementById('bill-grid');
    if (bills.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:48px;color:var(--subtext);">No bills yet. Add your first one!</td></tr>`;
        return;
    }
    tbody.innerHTML = bills.map(b => `
        <tr style="${b.isPaid ? 'opacity:0.5;' : ''}">
          <td style="font-weight:600;">${b.name}</td>
          <td><span class="badge">${b.category}</span></td>
          <td class="text-sub">${b.dueDate}</td>
          <td class="bill-amount-cell">${formatMoney(b.amountDue)}</td>
          <td>
            <span class="badge ${b.isPaid ? 'badge-paid' : 'badge-unpaid'}">
              <span class="bill-status-dot ${b.isPaid ? 'paid' : 'unpaid'}"></span>${b.isPaid ? 'Paid' : 'Unpaid'}
            </span>
          </td>
          <td>
            <div style="display:flex;gap:6px;justify-content:flex-end;">
              ${b.isPaid
                ? `<button class="btn btn-sm" onclick="markUnpaid(${b.id})">Mark Unpaid</button>`
                : `<button class="btn btn-success btn-sm" onclick="markPaid(${b.id})">Mark Paid</button>`}
              <button class="btn btn-sm" onclick='openEditBill(${JSON.stringify(b)})'>Edit</button>
              <button class="btn btn-danger btn-sm" onclick="deleteBill(${b.id})">Delete</button>
            </div>
          </td>
        </tr>
    `).join('');
}

async function handleAddBill(e) {
    e.preventDefault();
    hideAlert('alert-bill-modal');

    const body = {
        name:      document.getElementById('bill-name').value.trim(),
        category:  document.getElementById('bill-category').value,
        amountDue: parseFloat(document.getElementById('bill-amount').value),
        dueDate:   document.getElementById('bill-due').value,
    };

    const res = await apiPost('/bills', body);
    if (!res) return showAlert('alert-bill-modal', 'Network error');
    const data = await res.json();
    if (!res.ok) return showAlert('alert-bill-modal', data.error || 'Failed to add bill');

    closeModal('modal-add-bill');
    document.getElementById('form-add-bill').reset();
    await loadBills();
}

function openEditBill(b) {
    document.getElementById('edit-bill-id').value       = b.id;
    document.getElementById('edit-bill-name').value     = b.name;
    document.getElementById('edit-bill-category').value = b.category;
    document.getElementById('edit-bill-amount').value   = b.amountDue;
    document.getElementById('edit-bill-due').value      = b.dueDate;
    hideAlert('alert-edit-bill');
    openModal('modal-edit-bill');
}

async function handleEditBill(e) {
    e.preventDefault();
    hideAlert('alert-edit-bill');

    const id   = parseInt(document.getElementById('edit-bill-id').value);
    const body = {
        name:      document.getElementById('edit-bill-name').value.trim(),
        category:  document.getElementById('edit-bill-category').value,
        amountDue: parseFloat(document.getElementById('edit-bill-amount').value),
        dueDate:   document.getElementById('edit-bill-due').value,
    };

    const res = await apiPut(`/bills/${id}`, body);
    if (!res) return showAlert('alert-edit-bill', 'Network error');
    const data = await res.json();
    if (!res.ok) return showAlert('alert-edit-bill', data.error || 'Failed to save');

    closeModal('modal-edit-bill');
    await loadBills();
}

async function markPaid(id) {
    const res = await apiPut(`/bills/${id}/pay`, {});
    if (res && res.ok) await loadBills();
    else showAlert('alert-bills', 'Failed to update bill');
}

async function markUnpaid(id) {
    const res = await apiPut(`/bills/${id}/unpay`, {});
    if (res && res.ok) await loadBills();
    else showAlert('alert-bills', 'Failed to update bill');
}

async function deleteBill(id) {
    if (!confirm('Delete this bill?')) return;
    const res = await apiDelete(`/bills/${id}`);
    if (res && res.ok) await loadBills();
    else showAlert('alert-bills', 'Failed to delete bill');
}

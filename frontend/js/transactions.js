requireAuth();

const TX_CATEGORIES = {
    expense: ['Groceries','Transportation','Dining Out','Entertainment','Utilities',
              'Healthcare','Shopping','Education','Personal Care','Other'],
    income:  ['Salary','Freelance','Investment','Gift','Refund','Bonus','Other'],
};

let txType     = 'expense';
let editTxType = 'expense';

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
              <td style="display:flex;gap:6px;">
                <button class="btn btn-sm" onclick='openEditTx(${JSON.stringify(t)})'>Edit</button>
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

function setEditTxType(type) {
    editTxType = type;
    document.querySelectorAll('#form-edit-tx .type-toggle-btn').forEach(b => {
        b.classList.toggle('active', b.dataset.type === type);
    });
    const select = document.getElementById('edit-tx-category');
    if (select) {
        select.innerHTML = '<option value="">Select…</option>' +
            TX_CATEGORIES[type].map(c => `<option>${c}</option>`).join('');
    }
}

function openEditTx(t) {
    document.getElementById('edit-tx-id').value    = t.id;
    document.getElementById('edit-tx-date').value  = t.date;
    document.getElementById('edit-tx-amount').value = t.amount;
    document.getElementById('edit-tx-notes').value = t.notes || '';
    setEditTxType(t.type || 'expense');
    const select = document.getElementById('edit-tx-category');
    if (select) select.value = t.category;
    hideAlert('alert-edit-tx');
    openModal('modal-edit-tx');
}

async function handleEditTx(e) {
    e.preventDefault();
    hideAlert('alert-edit-tx');

    const id  = parseInt(document.getElementById('edit-tx-id').value);
    const body = {
        date:     document.getElementById('edit-tx-date').value,
        category: document.getElementById('edit-tx-category').value,
        amount:   parseFloat(document.getElementById('edit-tx-amount').value),
        notes:    document.getElementById('edit-tx-notes').value.trim(),
        type:     editTxType,
    };

    const res = await apiPut(`/transactions/${id}`, body);
    if (!res) return showAlert('alert-edit-tx', 'Network error');
    const data = await res.json();
    if (!res.ok) return showAlert('alert-edit-tx', data.error || 'Failed to save');

    closeModal('modal-edit-tx');
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

// ── CSV Import ────────────────────────────────────────────────────────────────
//
// Flow: pick file → Papa Parse → detect bank format → preselect column mapping →
// preview first 5 rows → user confirms → POST array to /transactions/bulk.

let importState = {
    headers:  [],
    rows:     [],
    fileName: '',
    mapping:  { date: '', amount: '', category: '', notes: '' },
    negativeIsExpense: true,
};

// Captured after a successful bulk insert so the calibrate step can reason about
// the current derived balance vs. the user's "actual" bank balance.
let postImportSummary = null;

// Description / category rules: map the raw CSV category name OR merchant
// keywords in the description into one of ExpenseX's standard categories.
// Rules run top-to-bottom; first match wins. The haystack is `${category} ${notes}`.
const CATEGORY_RULES = [
    // Income signals come first so a "payroll deposit" doesn't get caught by a generic keyword.
    { match: /salary|payroll|paycheck|direct\s*deposit/i,                           category: 'Salary',        type: 'income'  },
    { match: /freelance|invoice\s*paid|1099/i,                                       category: 'Freelance',     type: 'income'  },
    { match: /dividend|interest\s*paid|investment\s*income|brokerage/i,             category: 'Investment',    type: 'income'  },
    { match: /refund|return|reimburs/i,                                              category: 'Refund',        type: 'income'  },
    { match: /bonus/i,                                                                category: 'Bonus',         type: 'income'  },
    { match: /gift\s*received|venmo.*from|zelle.*from/i,                            category: 'Gift',          type: 'income'  },

    // Expense merchants — concrete brand names beat generic category text.
    { match: /starbucks|dunkin|coffee|chipotle|mcdonald|subway|panera|chick.fil|doordash|ubereats|grubhub|restaurant|cafe|bar\b/i,
                                                                                      category: 'Dining Out',    type: 'expense' },
    { match: /whole\s*foods|trader\s*joe|kroger|safeway|aldi|publix|costco|sam'?s\s*club|walmart\s+grocery|grocer/i,
                                                                                      category: 'Groceries',     type: 'expense' },
    { match: /uber|lyft|taxi|metro|transit|parking|shell|chevron|exxon|bp\s|mobil|gas\s*station|fuel|airline|delta|united|southwest|amtrak/i,
                                                                                      category: 'Transportation',type: 'expense' },
    { match: /netflix|spotify|hulu|hbo|disney\s*\+?|prime\s*video|youtube\s*premium|apple\s*music|cinema|amc\s|regal\s|movie/i,
                                                                                      category: 'Entertainment', type: 'expense' },
    { match: /electric|water\s*bill|sewer|gas\s*bill|comcast|xfinity|verizon|at&t|t-mobile|spectrum|internet|wifi|utilit/i,
                                                                                      category: 'Utilities',     type: 'expense' },
    { match: /cvs|walgreen|pharmac|hospital|clinic|doctor|dental|optical|medical|health/i,
                                                                                      category: 'Healthcare',    type: 'expense' },
    { match: /amazon|target|best\s*buy|home\s*depot|lowe'?s|macy|nordstrom|nike|adidas|etsy|ebay|retail|shopping/i,
                                                                                      category: 'Shopping',      type: 'expense' },
    { match: /tuition|udemy|coursera|book|library|university|school/i,              category: 'Education',     type: 'expense' },
    { match: /salon|haircut|barber|nails|spa|gym|fitness|yoga/i,                    category: 'Personal Care', type: 'expense' },

    // Generic bank category names — last-resort fallbacks.
    { match: /food\s*(&|and)?\s*drink|dining/i,                                      category: 'Dining Out',    type: 'expense' },
    { match: /travel|transport/i,                                                     category: 'Transportation',type: 'expense' },
    { match: /entertainment/i,                                                        category: 'Entertainment', type: 'expense' },
    { match: /^utilit/i,                                                              category: 'Utilities',     type: 'expense' },
    { match: /^shopping$/i,                                                           category: 'Shopping',      type: 'expense' },
    { match: /^health/i,                                                              category: 'Healthcare',    type: 'expense' },
    { match: /^education$/i,                                                          category: 'Education',     type: 'expense' },
];

// Returns { category, typeHint } based on the CSV's category + notes.
// typeHint is 'income' / 'expense' / undefined (caller falls back to amount sign).
function autoCategorize(rawCategory, notes) {
    const haystack = `${rawCategory || ''} ${notes || ''}`;
    for (const rule of CATEGORY_RULES) {
        if (rule.match.test(haystack)) return { category: rule.category, typeHint: rule.type };
    }
    if (rawCategory && rawCategory.trim()) return { category: rawCategory.trim(), typeHint: undefined };
    return { category: 'Other', typeHint: undefined };
}

// Header signatures used to auto-detect known bank export formats.
const BANK_PROFILES = [
    {
        name: 'Chase',
        match: h => h.includes('Transaction Date') && h.includes('Post Date'),
        map:   { date: 'Transaction Date', amount: 'Amount', category: 'Category', notes: 'Description', type: '' },
    },
    {
        name: 'Apple Card',
        match: h => h.includes('Clearing Date') || h.includes('Merchant'),
        map:   { date: 'Transaction Date', amount: 'Amount (USD)', category: 'Category', notes: 'Description', type: '' },
    },
    {
        name: 'Mint',
        match: h => h.includes('Original Description') && h.includes('Transaction Type'),
        map:   { date: 'Date', amount: 'Amount', category: 'Category', notes: 'Description', type: 'Transaction Type' },
    },
    {
        name: 'Bank of America',
        match: h => h.includes('Running Bal.') || h.includes('Running Balance'),
        map:   { date: 'Date', amount: 'Amount', category: '', notes: 'Description', type: '' },
    },
];

function openImportModal() {
    // Reset state and UI every time.
    importState = { headers: [], rows: [], fileName: '', mapping: {}, negativeIsExpense: true };
    document.getElementById('import-drop').style.display    = '';
    document.getElementById('import-mapping').hidden        = true;
    document.getElementById('import-result').hidden         = true;
    document.getElementById('import-submit').disabled       = true;
    document.getElementById('import-submit').style.display  = '';
    document.getElementById('import-submit').textContent    = 'Import';
    document.getElementById('import-cancel').textContent    = 'Cancel';
    document.getElementById('import-file').value            = '';
    document.getElementById('import-drop-label').textContent = 'Drop a CSV here, or click to browse';
    hideAlert('alert-import');
    openModal('modal-import-tx');
}

document.addEventListener('DOMContentLoaded', () => {
    const drop  = document.getElementById('import-drop');
    const input = document.getElementById('import-file');
    if (!drop || !input) return;

    input.addEventListener('change', e => {
        if (e.target.files && e.target.files[0]) handleImportFile(e.target.files[0]);
    });
    drop.addEventListener('dragover', e => { e.preventDefault(); drop.classList.add('dragover'); });
    drop.addEventListener('dragleave', () => drop.classList.remove('dragover'));
    drop.addEventListener('drop', e => {
        e.preventDefault();
        drop.classList.remove('dragover');
        if (e.dataTransfer.files && e.dataTransfer.files[0]) handleImportFile(e.dataTransfer.files[0]);
    });

    // Re-render preview when any mapping changes.
    ['map-date','map-amount','map-category','map-notes'].forEach(id => {
        document.getElementById(id)?.addEventListener('change', () => {
            importState.mapping[id.replace('map-','')] = document.getElementById(id).value;
            renderImportPreview();
        });
    });
    document.getElementById('map-negative-expense')?.addEventListener('change', e => {
        importState.negativeIsExpense = e.target.checked;
        renderImportPreview();
    });
});

function handleImportFile(file) {
    importState.fileName = file.name;
    document.getElementById('import-drop-label').textContent = file.name;

    if (typeof Papa === 'undefined') {
        return showAlert('alert-import', 'CSV parser failed to load — check your connection');
    }

    Papa.parse(file, {
        header: true,
        skipEmptyLines: 'greedy',
        complete: results => {
            const headers = (results.meta.fields || []).filter(Boolean);
            if (!headers.length) return showAlert('alert-import', 'Could not read columns from this CSV');

            importState.headers = headers;
            importState.rows    = results.data.filter(r => Object.values(r).some(v => v && String(v).trim()));

            // Auto-detect bank
            const profile = BANK_PROFILES.find(p => p.match(headers));
            const detected = profile ? profile.name : 'Custom';
            document.getElementById('import-detected').textContent = `· ${detected}`;
            document.getElementById('import-file-name').textContent = file.name;
            document.getElementById('import-row-count').textContent = `${importState.rows.length} rows`;

            // Build dropdowns with "(none)" + each header
            const fillSelect = (id, selected) => {
                const sel = document.getElementById(id);
                sel.innerHTML = '<option value="">(none)</option>' +
                    headers.map(h => `<option value="${h}"${h === selected ? ' selected' : ''}>${h}</option>`).join('');
            };
            const m = profile ? profile.map : {};
            // Best-effort defaults if no profile match
            const guess = (regex) => headers.find(h => regex.test(h)) || '';
            fillSelect('map-date',     m.date     || guess(/^date|transaction\s*date/i));
            fillSelect('map-amount',   m.amount   || guess(/amount/i));
            fillSelect('map-category', m.category || guess(/category/i));
            fillSelect('map-notes',    m.notes    || guess(/description|memo|payee/i));
            importState.mapping = {
                date:     document.getElementById('map-date').value,
                amount:   document.getElementById('map-amount').value,
                category: document.getElementById('map-category').value,
                notes:    document.getElementById('map-notes').value,
            };

            // Hide the drop zone — the file-info bar at the top of the mapping
            // section already shows the filename + detected format.
            document.getElementById('import-drop').style.display = 'none';
            document.getElementById('import-mapping').hidden = false;
            renderImportPreview();
        },
        error: err => showAlert('alert-import', `CSV error: ${err.message}`),
    });
}

// Convert MM/DD/YYYY, M/D/YY, or YYYY-MM-DD strings to YYYY-MM-DD.
function normalizeDate(raw) {
    if (!raw) return '';
    const s = String(raw).trim();
    let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (m) return `${m[1]}-${m[2].padStart(2,'0')}-${m[3].padStart(2,'0')}`;
    m = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})/);
    if (m) {
        let [_, mo, day, yr] = m;
        if (yr.length === 2) yr = (parseInt(yr) > 50 ? '19' : '20') + yr;
        return `${yr}-${mo.padStart(2,'0')}-${day.padStart(2,'0')}`;
    }
    return '';
}

// Project a single CSV row through the current mapping into a transaction object,
// or null if it's not importable.
function projectRow(row) {
    const { date: dKey, amount: aKey, category: cKey, notes: nKey } = importState.mapping;
    if (!dKey || !aKey) return null;

    const rawDate   = row[dKey];
    const rawAmount = row[aKey];
    const date = normalizeDate(rawDate);
    const num  = parseFloat(String(rawAmount || '').replace(/[$,\s]/g, ''));
    if (!date || isNaN(num) || num === 0) return null;

    const rawCategory = (cKey && row[cKey]) ? String(row[cKey]).trim() : '';
    const notes       = (nKey && row[nKey]) ? String(row[nKey]).trim() : '';

    // Auto-categorize first: gives us both a clean category and (sometimes) a
    // type hint (e.g. "payroll" implies income, regardless of amount sign).
    const { category, typeHint } = autoCategorize(rawCategory, notes);

    let type;
    if (typeHint) {
        type = typeHint;
    } else if (importState.negativeIsExpense) {
        type = num < 0 ? 'expense' : 'income';
    } else {
        type = 'expense';
    }

    return {
        date,
        category,
        amount: Math.abs(num),
        notes,
        type,
    };
}

function renderImportPreview() {
    const previewEl = document.getElementById('import-preview');
    const summaryEl = document.getElementById('import-summary');

    const projected = importState.rows.map(projectRow);
    const valid     = projected.filter(p => p !== null);
    const invalid   = projected.length - valid.length;

    // First 3 valid rows for preview (kept short so modal fits smaller viewports)
    const sample = valid.slice(0, 3);
    if (sample.length === 0) {
        previewEl.innerHTML = '<div style="padding:14px;text-align:center;color:var(--subtext);font-size:11.5px;">' +
            'Map at least Date and Amount to see a preview' + '</div>';
    } else {
        previewEl.innerHTML = `
            <table>
              <thead><tr>
                <th>Date</th><th>Type</th><th>Category</th><th>Notes</th><th class="col-amount">Amount</th>
              </tr></thead>
              <tbody>
                ${sample.map(t => `
                  <tr>
                    <td>${t.date}</td>
                    <td style="color:${t.type === 'income' ? 'var(--green)' : 'var(--red)'};text-transform:uppercase;font-size:10px;letter-spacing:.1em;font-weight:700;">${t.type}</td>
                    <td>${t.category}</td>
                    <td style="color:var(--subtext);max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${t.notes || '—'}</td>
                    <td class="col-amount" style="color:${t.type === 'income' ? 'var(--green)' : 'var(--red)'};">${formatMoney(t.amount)}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>`;
    }

    summaryEl.innerHTML = `
        <span><span class="import-summary-num">${valid.length}</span> ready to import</span>
        ${invalid > 0 ? `<span><span class="import-summary-num invalid">${invalid}</span> unreadable</span>` : ''}
    `;

    document.getElementById('import-submit').disabled = valid.length === 0;
    document.getElementById('import-submit').textContent = valid.length > 0 ? `Import ${valid.length}` : 'Import';
}

async function submitImport() {
    const projected = importState.rows.map(projectRow).filter(p => p !== null);
    if (projected.length === 0) return;

    const btn = document.getElementById('import-submit');
    btn.disabled = true;
    btn.textContent = 'Importing…';

    const res = await apiPost('/transactions/bulk', { transactions: projected });
    if (!res) {
        btn.disabled = false;
        btn.textContent = 'Import';
        return showAlert('alert-import', 'Network error');
    }
    const data = await res.json();
    if (!res.ok) {
        btn.disabled = false;
        btn.textContent = 'Import';
        return showAlert('alert-import', data.error || 'Import failed');
    }

    // Capture fresh summary so the calibrate step can back-calculate starting balance.
    const sumRes = await apiGet('/summary');
    postImportSummary = sumRes ? await sumRes.json() : null;

    // Show result step
    document.getElementById('import-mapping').hidden = true;
    document.getElementById('import-drop').style.display = 'none';
    document.getElementById('import-result').hidden = false;
    document.getElementById('import-result-num').textContent = data.inserted;
    const details = [];
    if (data.skipped) details.push(`${data.skipped} skipped (duplicates)`);
    if (data.invalid) details.push(`${data.invalid} unreadable`);
    document.getElementById('import-result-detail').textContent = details.join(' · ');

    // Reset calibrate UI in case it was used on a previous import.
    document.getElementById('calibrate-amount').value = '';
    document.getElementById('calibrate-amount').disabled = false;
    document.getElementById('calibrate-feedback').textContent = '';
    document.getElementById('calibrate-feedback').className = 'import-calibrate-feedback';

    btn.style.display = 'none';
    document.getElementById('import-cancel').textContent = 'Done';
    document.getElementById('import-cancel').onclick = () => {
        document.getElementById('import-drop').style.display = '';
        btn.style.display = '';
        closeModal('modal-import-tx');
        loadTransactions();
    };
}

async function performCalibration() {
    const fb     = document.getElementById('calibrate-feedback');
    const actual = parseFloat(document.getElementById('calibrate-amount').value);
    if (isNaN(actual)) {
        fb.className = 'import-calibrate-feedback err';
        fb.textContent = 'Enter a number';
        return;
    }
    if (!postImportSummary) {
        fb.className = 'import-calibrate-feedback err';
        fb.textContent = 'Summary unavailable — try reopening the importer';
        return;
    }

    // newStarting = actualBalance - (currentBalance - currentStarting)
    // i.e. shift the starting balance so the derived current balance equals `actual`.
    const newStarting = actual - postImportSummary.balance + postImportSummary.startingBalance;

    fb.className = 'import-calibrate-feedback';
    fb.textContent = 'Calibrating…';

    const res = await apiPut('/user/starting_balance', { startingBalance: newStarting });
    if (res && res.ok) {
        fb.className = 'import-calibrate-feedback ok';
        fb.textContent = '✓ Calibrated';
        document.getElementById('calibrate-amount').disabled = true;
    } else {
        fb.className = 'import-calibrate-feedback err';
        fb.textContent = 'Calibration failed';
    }
}

const API = 'http://localhost:8080/api';

// ── Theme ─────────────────────────────────────────────────────────────────────
function initTheme() {
    const theme = localStorage.getItem('theme') || 'light';
    document.documentElement.setAttribute('data-theme', theme);
}

function toggleTheme() {
    const current = document.documentElement.getAttribute('data-theme') || 'dark';
    const next = current === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('theme', next);
    _updateThemeButtons(next);
}

function _updateThemeButtons(theme) {
    document.querySelectorAll('.theme-toggle').forEach(btn => {
        const label    = btn.querySelector('.theme-label');
        const iconMoon = btn.querySelector('.icon-moon');
        const iconSun  = btn.querySelector('.icon-sun');
        if (label)    label.textContent = theme === 'dark' ? 'Light Mode' : 'Dark Mode';
        if (iconMoon) iconMoon.style.display = theme === 'dark' ? '' : 'none';
        if (iconSun)  iconSun.style.display  = theme === 'dark' ? 'none' : '';
    });
}

// Apply theme immediately on script load to avoid flash of wrong theme.
// Button icon state is set after DOM is ready.
initTheme();
document.addEventListener('DOMContentLoaded', () => {
    const theme = localStorage.getItem('theme') || 'light';
    _updateThemeButtons(theme);
    document.querySelectorAll('.theme-toggle').forEach(btn => {
        if (!btn.dataset.wired) {
            btn.dataset.wired = '1';
            btn.addEventListener('click', toggleTheme);
        }
    });
});

// ── Storage helpers ───────────────────────────────────────────────────────────
function getToken()    { return localStorage.getItem('token'); }
function getUsername() { return localStorage.getItem('username'); }
function getUserId()   { return localStorage.getItem('userId'); }

function saveSession(data) {
    localStorage.setItem('token',    data.token);
    localStorage.setItem('userId',   data.userId);
    localStorage.setItem('username', data.username);
    if (data.balance !== undefined)
        localStorage.setItem('balance', data.balance);
}

function clearSession() { localStorage.clear(); }

// Redirect to login if not authenticated.
function requireAuth() {
    if (!getToken()) window.location.replace('/index.html');
}

// ── Fetch wrapper ─────────────────────────────────────────────────────────────
async function apiFetch(endpoint, options = {}) {
    const token = getToken();
    const headers = {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(options.headers || {}),
    };
    try {
        const res = await fetch(API + endpoint, { ...options, headers });
        if (res.status === 401) {
            clearSession();
            window.location.replace('/index.html');
            return null;
        }
        return res;
    } catch (err) {
        console.error('Network error:', err);
        return null;
    }
}

// ── Convenience wrappers ──────────────────────────────────────────────────────
async function apiGet(endpoint)           { return apiFetch(endpoint); }
async function apiPost(endpoint, body)    { return apiFetch(endpoint, { method: 'POST',   body: JSON.stringify(body) }); }
async function apiPut(endpoint, body)     { return apiFetch(endpoint, { method: 'PUT',    body: JSON.stringify(body) }); }
async function apiDelete(endpoint)        { return apiFetch(endpoint, { method: 'DELETE' }); }

// ── UI helpers ────────────────────────────────────────────────────────────────
function formatMoney(n) {
    return '$' + Number(n).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

function showAlert(elId, msg, type = 'error') {
    const el = document.getElementById(elId);
    if (!el) return;
    el.textContent = msg;
    el.className   = `alert alert-${type} show`;
}

function hideAlert(elId) {
    const el = document.getElementById(elId);
    if (el) el.className = 'alert';
}

function openModal(id)  { document.getElementById(id).classList.add('open'); }
function closeModal(id) { document.getElementById(id).classList.remove('open'); }

// Populate username, wire up logout, theme toggle, and sidebar collapse.
function initSidebar() {
    const nameEl = document.getElementById('sidebar-username');
    if (nameEl) nameEl.textContent = getUsername() || '';

    const currentTheme = localStorage.getItem('theme') || 'light';
    _updateThemeButtons(currentTheme);

    document.getElementById('btn-logout')?.addEventListener('click', async () => {
        await apiPost('/logout', {});
        clearSession();
        window.location.replace('/index.html');
    });

    const sidebar   = document.querySelector('.sidebar');
    const toggleBtn = document.getElementById('sidebar-toggle');
    if (sidebar && toggleBtn) {
        // Auto-collapse logic uses media-query default (≤1100px); user can override.
        const stored = localStorage.getItem('sidebarState');
        if (stored === 'collapsed') sidebar.classList.add('collapsed');
        if (stored === 'expanded')  sidebar.classList.add('expanded');
        _syncToggleArrow(sidebar, toggleBtn);

        toggleBtn.addEventListener('click', () => {
            const wideDefault = window.matchMedia('(min-width: 1101px)').matches;
            if (wideDefault) {
                const nowCollapsed = sidebar.classList.toggle('collapsed');
                localStorage.setItem('sidebarState', nowCollapsed ? 'collapsed' : 'open');
            } else {
                const nowExpanded = sidebar.classList.toggle('expanded');
                localStorage.setItem('sidebarState', nowExpanded ? 'expanded' : 'collapsed');
            }
            _syncToggleArrow(sidebar, toggleBtn);
        });
    }
}

function _syncToggleArrow(sidebar, btn) {
    const wideDefault = window.matchMedia('(min-width: 1101px)').matches;
    const collapsed = wideDefault
        ? sidebar.classList.contains('collapsed')
        : !sidebar.classList.contains('expanded');
    btn.textContent = collapsed ? '›' : '‹';
}

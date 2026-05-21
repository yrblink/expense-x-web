// Redirect if already logged in.
if (getToken()) window.location.replace('/dashboard.html');

function switchTab(tab) {
    document.getElementById('form-login').style.display    = tab === 'login'    ? '' : 'none';
    document.getElementById('form-register').style.display = tab === 'register' ? '' : 'none';
    document.getElementById('tab-login').classList.toggle('active',    tab === 'login');
    document.getElementById('tab-register').classList.toggle('active', tab === 'register');
    hideAlert('alert');
}

async function handleLogin(e) {
    e.preventDefault();
    hideAlert('alert');
    const btn = document.getElementById('btn-login');
    btn.disabled    = true;
    btn.textContent = 'Signing in…';

    const res = await apiPost('/login', {
        username: document.getElementById('login-user').value.trim(),
        password: document.getElementById('login-pass').value,
    });

    btn.disabled    = false;
    btn.textContent = 'Sign In';

    if (!res) return showAlert('alert', 'Could not reach server. Is ExpenseX running?');
    const data = await res.json();
    if (!res.ok) return showAlert('alert', data.error || 'Login failed');

    saveSession(data);
    window.location.replace('/dashboard.html');
}

async function handleRegister(e) {
    e.preventDefault();
    hideAlert('alert');

    const pass  = document.getElementById('reg-pass').value;
    const pass2 = document.getElementById('reg-pass2').value;
    if (pass !== pass2) return showAlert('alert', 'Passwords do not match');

    const btn = document.getElementById('btn-register');
    btn.disabled    = true;
    btn.textContent = 'Creating account…';

    const res = await apiPost('/register', {
        username: document.getElementById('reg-user').value.trim(),
        password: pass,
    });

    btn.disabled    = false;
    btn.textContent = 'Create Account';

    if (!res) return showAlert('alert', 'Could not reach server. Is ExpenseX running?');
    const data = await res.json();
    if (!res.ok) return showAlert('alert', data.error || 'Registration failed');

    saveSession(data);
    window.location.replace('/dashboard.html');
}

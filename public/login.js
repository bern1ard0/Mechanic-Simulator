// Login / first-time password setup.
const $ = (s) => document.querySelector(s);

async function init() {
  const s = await fetch('/api/auth-status').then((r) => r.json());
  if (s.authed) return (location.href = '/');
  if (!s.configured) {
    $('#loginTitle').textContent = 'Set your password';
    $('#loginHint').textContent = 'First time here — pick a password. You’ll use it to get in from now on.';
    $('#pw').setAttribute('autocomplete', 'new-password');
    $('#loginBtn').textContent = 'Set password & enter';
  }
}

async function submit() {
  const password = $('#pw').value;
  $('#loginErr').textContent = '';
  if (!password.trim()) { $('#loginErr').textContent = 'Enter a password.'; return; }
  try {
    const res = await fetch('/api/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ password }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Sign in failed');
    location.href = '/';
  } catch (err) {
    $('#loginErr').textContent = err.message;
  }
}

$('#loginBtn').addEventListener('click', submit);
$('#pw').addEventListener('keydown', (e) => { if (e.key === 'Enter') submit(); });
init();

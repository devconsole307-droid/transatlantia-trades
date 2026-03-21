/* ============================================================
   GLOBAL JS UTILITIES
   ============================================================ */

const API_BASE = '/api';

const api = {
  getToken: () => localStorage.getItem('auth_token'),
  getUser: () => JSON.parse(localStorage.getItem('auth_user') || 'null'),
  headers(extra = {}) {
    const h = { 'Content-Type': 'application/json', ...extra };
    const token = this.getToken();
    if (token) h['Authorization'] = `Bearer ${token}`;
    return h;
  },
  async get(endpoint) {
    const res = await fetch(API_BASE + endpoint, { headers: this.headers() });
    return res.json();
  },
  async post(endpoint, data) {
    const res = await fetch(API_BASE + endpoint, { method: 'POST', headers: this.headers(), body: JSON.stringify(data) });
    return res.json();
  },
  async put(endpoint, data) {
    const res = await fetch(API_BASE + endpoint, { method: 'PUT', headers: this.headers(), body: JSON.stringify(data) });
    return res.json();
  },
  async patch(endpoint, data = {}) {
    const res = await fetch(API_BASE + endpoint, { method: 'PATCH', headers: this.headers(), body: JSON.stringify(data) });
    return res.json();
  },
  async postForm(endpoint, formData) {
    const token = this.getToken();
    const headers = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const res = await fetch(API_BASE + endpoint, { method: 'POST', headers, body: formData });
    return res.json();
  },
};

function requireAuth() {
  if (!api.getToken() || !api.getUser()) {
    window.location.href = '/login.html?redirect=' + encodeURIComponent(window.location.pathname);
    return false;
  }
  return true;
}

function requireAdmin() {
  const user = api.getUser();
  if (!user || !user.is_admin) { window.location.href = '/dashboard.html'; return false; }
  return true;
}

function requireGuest() {
  if (api.getToken()) {
    const user = api.getUser();
    window.location.href = user?.is_admin ? '/admin/index.html' : '/dashboard.html';
    return false;
  }
  return true;
}

function showToast(message, type = 'info', duration = 4000) {
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    container.className = 'toast-container';
    document.body.appendChild(container);
  }
  const icons = { success: '✅', error: '❌', warning: '⚠️', info: 'ℹ️' };
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `<span class="toast-icon">${icons[type]||'ℹ️'}</span><span>${message}</span><span class="toast-close" onclick="this.parentElement.remove()">✕</span>`;
  container.appendChild(toast);
  setTimeout(() => toast.remove(), duration);
}

function formatCurrency(amount, symbol = '$') {
  const n = parseFloat(amount) || 0;
  return symbol + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatDate(dateStr) {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

function formatDateTime(dateStr) {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleString('en-US', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function timeAgo(dateStr) {
  const seconds = Math.floor((new Date() - new Date(dateStr)) / 1000);
  if (seconds < 60) return 'just now';
  if (seconds < 3600) return Math.floor(seconds/60) + 'm ago';
  if (seconds < 86400) return Math.floor(seconds/3600) + 'h ago';
  return Math.floor(seconds/86400) + 'd ago';
}

function statusBadge(status) {
  const map = { pending:'warning', confirmed:'success', approved:'success', rejected:'danger', active:'success', completed:'info', submitted:'warning', processing:'warning' };
  return `<span class="badge badge-${map[status]||'muted'}">${status}</span>`;
}

function copyToClipboard(text, btn) {
  navigator.clipboard.writeText(text).then(() => {
    if (btn) { const orig=btn.textContent; btn.textContent='✓ Copied'; btn.classList.add('copied'); setTimeout(()=>{btn.textContent=orig;btn.classList.remove('copied');},2000); }
    showToast('Copied to clipboard!', 'success', 2000);
  });
}

function setLoading(btn, loading) {
  if (loading) { btn.disabled=true; btn.dataset.origText=btn.innerHTML; btn.innerHTML='Processing...'; btn.classList.add('btn-loading'); }
  else { btn.disabled=false; btn.innerHTML=btn.dataset.origText||btn.innerHTML; btn.classList.remove('btn-loading'); }
}

function showFieldError(fieldId, message) {
  const field = document.getElementById(fieldId);
  if (!field) return;
  field.classList.add('error');
  let errEl = field.nextElementSibling;
  if (!errEl || !errEl.classList.contains('form-error')) { errEl=document.createElement('p'); errEl.className='form-error'; field.parentNode.insertBefore(errEl, field.nextSibling); }
  errEl.textContent = message;
}

function clearFieldErrors(formEl) {
  if (!formEl) return;
  formEl.querySelectorAll('.error').forEach(el=>el.classList.remove('error'));
  formEl.querySelectorAll('.form-error').forEach(el=>el.remove());
}

function openModal(id) { const m=document.getElementById(id); if(m) m.classList.add('active'); }
function closeModal(id) { const m=document.getElementById(id); if(m) m.classList.remove('active'); }
document.addEventListener('click', (e) => { if(e.target.classList.contains('modal-overlay')) e.target.classList.remove('active'); });

function logout() { localStorage.removeItem('auth_token'); localStorage.removeItem('auth_user'); window.location.href='/login.html'; }

document.addEventListener('DOMContentLoaded', () => {
  const toggle = document.getElementById('sidebarToggle');
  const sidebar = document.getElementById('sidebar');
  if (toggle && sidebar) toggle.addEventListener('click', () => sidebar.classList.toggle('open'));
  const current = window.location.pathname.split('/').pop() || 'index.html';
  document.querySelectorAll('.sidebar-link').forEach(link => {
    const href = link.getAttribute('href') || '';
    if (href === current || href.endsWith(current)) link.classList.add('active');
  });
  const userDisplay = document.querySelectorAll('.user-name-display');
  const user = api.getUser();
  if (user) userDisplay.forEach(el => el.textContent = user.first_name + ' ' + user.last_name);
});

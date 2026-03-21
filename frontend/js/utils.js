/* ============================================================
   TransAtlantia Trades — Platform Utilities
   ============================================================ */

const API_BASE = '/api';

// ---- TOKEN MANAGEMENT ----
const Auth = {
  getToken: () => localStorage.getItem('tt_token'),
  setToken: (t) => localStorage.setItem('tt_token', t),
  removeToken: () => { localStorage.removeItem('tt_token'); localStorage.removeItem('tt_user'); },
  getUser: () => { try { return JSON.parse(localStorage.getItem('tt_user')); } catch { return null; } },
  setUser: (u) => localStorage.setItem('tt_user', JSON.stringify(u)),
  removeUser: () => localStorage.removeItem('tt_user'),
  isLoggedIn: () => !!localStorage.getItem('tt_token'),
  isAdmin: () => { const u = Auth.getUser(); return !!(u && u.is_admin); },

  logout: () => {
    // Clear all storage
    localStorage.removeItem('tt_token');
    localStorage.removeItem('tt_user');
    localStorage.removeItem('platform_token');
    localStorage.removeItem('platform_user');
    sessionStorage.clear();
    // Hard navigate — no back button
    window.location.href = '/login.html?t=' + Date.now();
  },

  requireAuth: () => {
    if (!Auth.isLoggedIn()) {
      window.location.href = '/login.html';
      return false;
    }
    return true;
  },

  requireAdmin: () => {
    if (!Auth.isLoggedIn()) {
      window.location.href = '/login.html';
      return false;
    }
    if (!Auth.isAdmin()) {
      window.location.href = '/dashboard.html';
      return false;
    }
    return true;
  },

  requireGuest: () => {
    if (Auth.isLoggedIn()) {
      window.location.href = Auth.isAdmin() ? '/admin/dashboard.html' : '/dashboard.html';
      return false;
    }
    return true;
  }
};

// ---- API HELPER ----
const api = {
  _request: async (method, path, data = null, isForm = false) => {
    const headers = {};
    const token = Auth.getToken();
    if (token) headers['Authorization'] = `Bearer ${token}`;
    if (!isForm) headers['Content-Type'] = 'application/json';

    const opts = { method, headers };
    if (data) opts.body = isForm ? data : JSON.stringify(data);

    const res = await fetch(`${API_BASE}${path}`, opts);
    const json = await res.json();

    if (res.status === 401) {
      Auth.logout();
      throw new Error('Session expired');
    }

    return { ok: res.ok, status: res.status, ...json };
  },
  get:   (path)             => api._request('GET',    path),
  post:  (path, data, form) => api._request('POST',   path, data, form),
  put:   (path, data)       => api._request('PUT',    path, data),
  patch: (path, data)       => api._request('PATCH',  path, data),
  del:   (path)             => api._request('DELETE', path),
};

// ---- TOAST NOTIFICATIONS ----
const Toast = {
  container: null,
  init() {
    if (!this.container) {
      this.container = document.getElementById('toastContainer') || document.createElement('div');
      this.container.id = 'toastContainer';
      this.container.className = 'toast-container';
      document.body.appendChild(this.container);
    }
  },
  show(message, type = 'info', duration = 4000) {
    if (!this.container) this.init();
    const icons = { success: '✅', error: '❌', warning: '⚠️', info: 'ℹ️' };
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.innerHTML = `
      <span class="toast-icon">${icons[type] || icons.info}</span>
      <span class="toast-msg">${message}</span>
      <button class="toast-close" onclick="this.parentElement.remove()">×</button>
    `;
    this.container.appendChild(toast);
    setTimeout(() => {
      toast.style.animation = 'fadeOut 0.3s ease forwards';
      setTimeout(() => toast.remove(), 300);
    }, duration);
  },
  success: (msg, dur) => Toast.show(msg, 'success', dur),
  error:   (msg, dur) => Toast.show(msg, 'error',   dur),
  warning: (msg, dur) => Toast.show(msg, 'warning', dur),
  info:    (msg, dur) => Toast.show(msg, 'info',    dur),
};

// ---- FORMATTERS ----
const fmt = {
  money: (n, d = 2) => '$' + (parseFloat(n) || 0).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d }),
  date: (d) => d ? new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }) : '—',
  datetime: (d) => d ? new Date(d).toLocaleString('en-US', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—',
  percent: (n) => (parseFloat(n) || 0).toFixed(2) + '%',
  badge: (s) => `<span class="badge badge-${s}">${s}</span>`,
  timeAgo: (d) => {
    const s = Math.floor((Date.now() - new Date(d)) / 1000);
    if (s < 60) return 'just now';
    for (const [sec, lbl] of [[31536000,'y'],[2592000,'mo'],[86400,'d'],[3600,'h'],[60,'m']]) {
      const n = Math.floor(s / sec);
      if (n >= 1) return `${n}${lbl} ago`;
    }
    return 'just now';
  },
  progress: (start, end) => {
    const total = new Date(end) - new Date(start);
    const elapsed = Date.now() - new Date(start);
    return Math.min(100, Math.max(0, Math.round((elapsed / total) * 100)));
  },
  daysLeft: (end) => Math.max(0, Math.ceil((new Date(end) - Date.now()) / 86400000)),
};

// ---- UI HELPERS ----
const UI = {
  setLoading: (btn, loading, text = 'Loading...') => {
    if (!btn) return;
    if (loading) { btn._orig = btn.innerHTML; btn.innerHTML = `<span class="spinner"></span> ${text}`; btn.disabled = true; }
    else { btn.innerHTML = btn._orig || text; btn.disabled = false; }
  },
  showAlert: (el, message, type = 'error') => {
    const icons = { success: '✅', error: '❌', warning: '⚠️', info: 'ℹ️' };
    el.innerHTML = `<div class="alert alert-${type}">${icons[type]} ${message}</div>`;
    el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  },
  openModal:  (id) => { const m = document.getElementById(id); if (m) m.classList.add('open'); },
  closeModal: (id) => { const m = document.getElementById(id); if (m) m.classList.remove('open'); },
  copyText: async (text) => {
    try { await navigator.clipboard.writeText(text); Toast.success('Copied!', 2000); }
    catch { Toast.error('Copy failed'); }
  },

  initSidebar: () => {
    const hamburger = document.getElementById('hamburger');
    const sidebar   = document.getElementById('sidebar');
    const overlay   = document.getElementById('sidebarOverlay');
    if (!hamburger || !sidebar) return;

    const open  = () => { sidebar.classList.add('open');    if (overlay) overlay.classList.add('open'); };
    const close = () => { sidebar.classList.remove('open'); if (overlay) overlay.classList.remove('open'); };
    const toggle = () => sidebar.classList.contains('open') ? close() : open();

    // Both click and touchend so mobile works instantly
    hamburger.addEventListener('click', toggle);
    hamburger.addEventListener('touchend', (e) => { e.preventDefault(); toggle(); }, { passive: false });

    if (overlay) {
      overlay.addEventListener('click', close);
      overlay.addEventListener('touchend', (e) => { e.preventDefault(); close(); }, { passive: false });
    }

    // Close when nav link tapped on mobile
    sidebar.querySelectorAll('.sidebar-link').forEach(link => {
      link.addEventListener('click', () => { if (window.innerWidth <= 768) close(); });
    });
  },

  populateSidebarUser: () => {
    const user = Auth.getUser();
    if (!user) return;
    const n  = document.getElementById('sidebarUserName');
    const e  = document.getElementById('sidebarUserEmail');
    const av = document.getElementById('sidebarUserAvatar');
    if (n)  n.textContent  = `${user.first_name} ${user.last_name}`;
    if (e)  e.textContent  = user.email;
    if (av) av.textContent = ((user.first_name||'?')[0] + (user.last_name||'?')[0]).toUpperCase();
  },
};

// ---- CLOSE MODALS ON OVERLAY CLICK ----
document.addEventListener('click', (e) => {
  if (e.target.classList.contains('modal-overlay')) e.target.classList.remove('open');
});

// ---- INIT ----
document.addEventListener('DOMContentLoaded', () => {
  Toast.init();

  // Support old token key (platform_token) for backwards compat
  const oldToken = localStorage.getItem('platform_token');
  const oldUser  = localStorage.getItem('platform_user');
  if (oldToken && !localStorage.getItem('tt_token')) {
    localStorage.setItem('tt_token', oldToken);
    localStorage.setItem('tt_user',  oldUser || '{}');
    localStorage.removeItem('platform_token');
    localStorage.removeItem('platform_user');
  }
});

// ---- GOOGLE TRANSLATE HELPER ----
// Suppresses the Google Translate feedback bar and top banner
(function () {
  // Hide the iframe feedback bar Google injects
  const hideGoogleBar = () => {
    const style = document.getElementById('_gt_suppress') || document.createElement('style');
    style.id = '_gt_suppress';
    style.textContent = `
      .goog-te-banner-frame, .goog-te-ftab-frame, #goog-gt-votingFrame,
      .goog-te-balloon-frame, .goog-tooltip-card, .goog-te-menu-frame,
      body > .skiptranslate:not(#google_translate_element):not(#google_translate_element2) {
        display: none !important; height: 0 !important; visibility: hidden !important;
      }
      body { top: 0 !important; }
      .goog-te-gadget { color: transparent !important; font-size: 0 !important; }
      .goog-te-gadget > span > a { display: none !important; }
      .goog-te-gadget img { display: none !important; }
    `;
    document.head.appendChild(style);
  };
  hideGoogleBar();
  // Re-apply after translate loads (it re-injects elements)
  window.addEventListener('load', hideGoogleBar);
  setInterval(hideGoogleBar, 2000);
})();

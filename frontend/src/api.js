// ─── Token storage ────────────────────────────────────────────────────────────
const store = {
  get: (k) => localStorage.getItem(k),
  set: (k, v) => localStorage.setItem(k, v),
  del: (k) => localStorage.removeItem(k),
};

// ─── Base fetch with auth + auto-refresh ─────────────────────────────────────
async function request(path, options = {}) {
  const headers = { 'Content-Type': 'application/json', ...options.headers };
  const token = store.get('accessToken');
  if (token) headers['Authorization'] = `Bearer ${token}`;

  let res = await fetch(`/api${path}`, { ...options, headers });

  // Try token refresh on 401
  if (res.status === 401 && store.get('refreshToken')) {
    const refreshed = await fetch('/api/auth/refresh', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: store.get('refreshToken') }),
    });
    if (refreshed.ok) {
      const { data } = await refreshed.json();
      store.set('accessToken', data.accessToken);
      store.set('refreshToken', data.refreshToken);
      headers['Authorization'] = `Bearer ${data.accessToken}`;
      res = await fetch(`/api${path}`, { ...options, headers });
    } else {
      // Refresh failed — clear tokens
      store.del('accessToken');
      store.del('refreshToken');
      store.del('user');
      window.location.reload();
      return;
    }
  }

  return res.json();
}

// ─── API methods ──────────────────────────────────────────────────────────────
export const api = {
  // Auth
  login: async (email, password) => {
    const res = await request('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    if (res.success) {
      store.set('accessToken', res.data.accessToken);
      store.set('refreshToken', res.data.refreshToken);
      store.set('user', JSON.stringify(res.data.user));
    }
    return res;
  },

  register: async (name, email, password, role) => {
    const res = await request('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ name, email, password, role }),
    });
    if (res.success) {
      // Auto-login after register
      return api.login(email, password);
    }
    return res;
  },

  logout: async () => {
    const refreshToken = store.get('refreshToken');
    if (refreshToken) {
      await request('/auth/logout', {
        method: 'POST',
        body: JSON.stringify({ refreshToken }),
      }).catch(() => {});
    }
    store.del('accessToken');
    store.del('refreshToken');
    store.del('user');
  },

  getStoredUser: () => {
    try { return JSON.parse(store.get('user')); } catch { return null; }
  },

  // Issues
  getIssues: (filters = {}) => {
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([k, v]) => { if (v !== '' && v != null) params.set(k, v); });
    const qs = params.toString();
    return request(`/issues${qs ? `?${qs}` : ''}`);
  },

  getIssue: (id) => request(`/issues/${id}`),

  createIssue: (data) =>
    request('/issues', { method: 'POST', body: JSON.stringify(data) }),

  updateStatus: (id, status, note) =>
    request(`/issues/${id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status, note }),
    }),

  assignIssue: (id, officialId, note) =>
    request(`/issues/${id}/assign`, {
      method: 'POST',
      body: JSON.stringify({ officialId, note }),
    }),

  getHistory: (id) => request(`/issues/${id}/history`),

  // Analytics (public)
  getAnalytics: async () => {
    const [summary, byCategory, byStatus] = await Promise.all([
      request('/analytics/summary'),
      request('/analytics/by-category'),
      request('/analytics/by-status'),
    ]);
    if (!summary.success) return summary;
    return {
      success: true,
      data: {
        ...summary.data,
        by_category: byCategory.data || [],
        by_status: byStatus.data || [],
      },
    };
  },
};

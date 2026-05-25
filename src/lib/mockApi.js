// Lightweight client-side mock API for Netlify/static deployments.
// Intercepts fetch calls to `/api/*` when `VITE_API_BASE` is empty
// and uses `db_fallback.json` as the data source.

export async function initMockApi() {
  let originalFetch = window.fetch.bind(window);
  let db = { users: [], diagnoses: [], rooms: [] };

  try {
    const res = await originalFetch('/db_fallback.json');
    if (res && res.ok) db = await res.json();
  } catch (e) {
    console.warn('mockApi: failed to load db_fallback.json, using defaults');
  }

  function findUserByLogin(val) {
    if (!val) return null;
    const v = String(val).trim();
    if (v.includes('@')) {
      return db.users.find(u => u.email && String(u.email).trim().toLowerCase() === v.toLowerCase()) || null;
    }
    const digits = v.replace(/\D/g, '');
    if (!digits) return null;
    return db.users.find(u => {
      if (!u.phone) return false;
      const uDigits = String(u.phone).replace(/\D/g, '');
      return uDigits === digits || (uDigits.length >= 9 && digits.length >= 9 && uDigits.slice(-9) === digits.slice(-9));
    }) || null;
  }

  window.fetch = async function(input, init) {
    try {
      const url = typeof input === 'string' ? input : input.url || '';
      const method = (init && init.method) || (typeof input !== 'string' && input.method) || 'GET';
      // Only intercept same-origin /api/* paths
      const u = new URL(url, window.location.origin);
      if (u.origin === window.location.origin && u.pathname.startsWith('/api/')) {
        // health
        if (u.pathname === '/api/health' && method.toUpperCase() === 'GET') {
          return new Response(JSON.stringify({ status: 'ok', database: 'memory' }), { status: 200, headers: { 'Content-Type': 'application/json' } });
        }

        // auth login
        if (u.pathname === '/api/auth/login' && method.toUpperCase() === 'POST') {
          const bodyText = init && init.body ? init.body : (typeof input !== 'string' && input.body) || null;
          let payload = {};
          try { payload = JSON.parse(bodyText); } catch (e) { payload = {}; }
          const { email, password } = payload || {};
          const user = findUserByLogin(email);
          if (!user || String(user.password).trim() !== String(password || '').trim()) {
            return new Response(JSON.stringify({ error: "Email/telefon yoki parol noto'g'ri." }), { status: 401, headers: { 'Content-Type': 'application/json' } });
          }
          // return a sanitized user object
          const uout = { ...user };
          return new Response(JSON.stringify({ user: uout }), { status: 200, headers: { 'Content-Type': 'application/json' } });
        }

        // basic users list
        if (u.pathname === '/api/users' && method.toUpperCase() === 'GET') {
          const params = Object.fromEntries(u.searchParams.entries());
          let results = db.users || [];
          if (params.role) results = results.filter(r => r.role === params.role);
          if (params.id) results = results.filter(r => r.id === params.id);
          return new Response(JSON.stringify(results), { status: 200, headers: { 'Content-Type': 'application/json' } });
        }

        // fallback: return 404 HTML similar to a static host
        return new Response('<!DOCTYPE html><html><body>Not Found</body></html>', { status: 404, headers: { 'Content-Type': 'text/html' } });
      }
    } catch (e) {
      console.warn('mockApi handler error', e);
    }
    return originalFetch(input, init);
  };

  console.log('mockApi: initialized (API_BASE empty) — intercepting /api/* requests');
}

export default initMockApi;

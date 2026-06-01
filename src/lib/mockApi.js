// Lightweight client-side mock API for Netlify/static deployments.
// Intercepts fetch calls to `/api/*` when `VITE_API_BASE` is empty
// and uses `db_fallback.json` as the data source.

const STORAGE_KEY = "clinica_mock_db";

function nowIso() {
  return new Date().toISOString();
}

function createId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return `mock-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}

function textResponse(text, status = 200, contentType = "text/plain") {
  return new Response(text, {
    status,
    headers: { "Content-Type": contentType }
  });
}

function cloneDb(source) {
  return {
    users: Array.isArray(source?.users) ? [...source.users] : [],
    diagnoses: Array.isArray(source?.diagnoses) ? [...source.diagnoses] : [],
    rooms: Array.isArray(source?.rooms) ? [...source.rooms] : []
  };
}

function parseBody(input, init) {
  const body = (init && init.body) || (typeof input !== "string" && input.body) || null;
  if (!body || typeof body !== "string") return {};
  try {
    return JSON.parse(body);
  } catch (err) {
    return {};
  }
}

function matchesPath(pathname, basePath) {
  if (pathname === basePath) return true;
  return pathname.startsWith(`${basePath}/`);
}

function getPathId(pathname, basePath) {
  if (!matchesPath(pathname, basePath)) return null;
  const parts = pathname.slice(basePath.length).split("/").filter(Boolean);
  return parts[0] || null;
}

export async function initMockApi() {
  const originalFetch = window.fetch.bind(window);
  let db = { users: [], diagnoses: [], rooms: [] };

  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored) {
      db = cloneDb(JSON.parse(stored));
    } else {
      const res = await originalFetch("/db_fallback.json");
      if (res && res.ok) db = cloneDb(await res.json());
    }
  } catch (e) {
    console.warn('mockApi: failed to load db_fallback.json, using defaults');
  }

  const persist = () => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
    } catch (err) {
      // Storage is best-effort only.
    }
  };

  const findUserByLogin = (val) => {
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
  };

  const upsertById = (collection, id, patch) => {
    const index = db[collection].findIndex(item => item.id === id);
    if (index === -1) return null;
    db[collection][index] = { ...db[collection][index], ...patch };
    persist();
    return db[collection][index];
  };

  window.fetch = async function(input, init) {
    try {
      const url = typeof input === 'string' ? input : input.url || '';
      const method = ((init && init.method) || (typeof input !== 'string' && input.method) || 'GET').toUpperCase();
      const u = new URL(url, window.location.origin);

      if (u.origin !== window.location.origin || !u.pathname.startsWith('/api/')) {
        return originalFetch(input, init);
      }

      if (u.pathname === '/api/health' && method === 'GET') {
        return jsonResponse({ status: 'ok', database: 'memory' });
      }

      if (u.pathname === '/api/auth/login' && method === 'POST') {
        const payload = parseBody(input, init);
        const { email, password } = payload || {};
        const user = findUserByLogin(email);
        if (!user || String(user.password).trim() !== String(password || '').trim()) {
          return jsonResponse({ error: "Email/telefon yoki parol noto'g'ri." }, 401);
        }
        return jsonResponse({ user: { ...user } });
      }

      if (u.pathname === '/api/users' && method === 'GET') {
        const params = Object.fromEntries(u.searchParams.entries());
        let results = [...db.users];
        if (params.role) results = results.filter(r => r.role === params.role);
        if (params.id) results = results.filter(r => r.id === params.id);
        return jsonResponse(results);
      }

      if (u.pathname === '/api/users' && method === 'POST') {
        const payload = parseBody(input, init);
        const next = {
          id: payload.id || createId(),
          created_at: payload.created_at || nowIso(),
          ...payload
        };
        db.users = [next, ...db.users.filter(user => user.id !== next.id)];
        persist();
        return jsonResponse(next, 201);
      }

      if (matchesPath(u.pathname, '/api/users')) {
        const id = getPathId(u.pathname, '/api/users');
        if (!id) return textResponse('Not Found', 404);
        if (method === 'GET') {
          const user = db.users.find(item => item.id === id);
          return user ? jsonResponse(user) : textResponse('Not Found', 404);
        }
        if (method === 'PUT' || method === 'PATCH') {
          const payload = parseBody(input, init);
          const updated = upsertById('users', id, payload);
          return updated ? jsonResponse(updated) : textResponse('Not Found', 404);
        }
        if (method === 'DELETE') {
          const before = db.users.length;
          db.users = db.users.filter(user => user.id !== id);
          if (db.users.length !== before) {
            persist();
            return new Response(null, { status: 204 });
          }
          return textResponse('Not Found', 404);
        }
      }

      if (u.pathname === '/api/diagnoses' && method === 'GET') {
        const params = Object.fromEntries(u.searchParams.entries());
        let results = [...db.diagnoses];
        if (params.doctor_id) results = results.filter(r => r.doctor_id === params.doctor_id);
        if (params.patient_id) results = results.filter(r => r.patient_id === params.patient_id);
        if (params.id) results = results.filter(r => r.id === params.id);
        return jsonResponse(results);
      }

      if (u.pathname === '/api/diagnoses' && method === 'POST') {
        const payload = parseBody(input, init);
        const next = {
          id: payload.id || createId(),
          created_at: payload.created_at || nowIso(),
          updated_at: payload.updated_at || nowIso(),
          ...payload
        };
        db.diagnoses = [next, ...db.diagnoses.filter(item => item.id !== next.id)];
        persist();
        return jsonResponse(next, 201);
      }

      if (matchesPath(u.pathname, '/api/diagnoses')) {
        const id = getPathId(u.pathname, '/api/diagnoses');
        if (!id) return textResponse('Not Found', 404);
        if (method === 'GET') {
          const diagnosis = db.diagnoses.find(item => item.id === id);
          return diagnosis ? jsonResponse(diagnosis) : textResponse('Not Found', 404);
        }
        if (method === 'PUT' || method === 'PATCH') {
          const payload = parseBody(input, init);
          const updated = upsertById('diagnoses', id, { ...payload, updated_at: nowIso() });
          return updated ? jsonResponse(updated) : textResponse('Not Found', 404);
        }
        if (method === 'DELETE') {
          const before = db.diagnoses.length;
          db.diagnoses = db.diagnoses.filter(item => item.id !== id);
          if (db.diagnoses.length !== before) {
            persist();
            return new Response(null, { status: 204 });
          }
          return textResponse('Not Found', 404);
        }
      }

      if (u.pathname === '/api/rooms' && method === 'GET') {
        return jsonResponse([...db.rooms]);
      }

      if (u.pathname === '/api/rooms' && method === 'POST') {
        const payload = parseBody(input, init);
        const next = { id: payload.id || createId(), ...payload };
        db.rooms = [next, ...db.rooms.filter(room => room.id !== next.id)];
        persist();
        return jsonResponse(next, 201);
      }

      if (matchesPath(u.pathname, '/api/rooms')) {
        const id = getPathId(u.pathname, '/api/rooms');
        if (!id) return textResponse('Not Found', 404);
        if (method === 'GET') {
          const room = db.rooms.find(item => item.id === id);
          return room ? jsonResponse(room) : textResponse('Not Found', 404);
        }
        if (method === 'PUT' || method === 'PATCH') {
          const payload = parseBody(input, init);
          const updated = upsertById('rooms', id, payload);
          return updated ? jsonResponse(updated) : textResponse('Not Found', 404);
        }
        if (method === 'DELETE') {
          const before = db.rooms.length;
          db.rooms = db.rooms.filter(room => room.id !== id);
          if (db.rooms.length !== before) {
            persist();
            return new Response(null, { status: 204 });
          }
          return textResponse('Not Found', 404);
        }
      }

      if (u.pathname === '/api/ai/generate-bio' && method === 'POST') {
        const payload = parseBody(input, init);
        const name = payload.name || 'Xodim';
        const specialty = payload.specialty || 'mutaxassis';
        const resume = payload.raw_resume || payload.existing_bio || '';
        const text = `Avtomatik tavsif: ${name} ${specialty} yo'nalishida tajribali mutaxassis. ${resume}`.trim();
        return jsonResponse({ text });
      }

      if (u.pathname === '/api/uploads' && method === 'POST') {
        return jsonResponse({ ok: true, url: '/uploads/mock-upload' }, 201);
      }

      if (u.pathname === '/api/spravka' && method === 'GET') {
        return jsonResponse({ error: "Spravka PDF faqat to'liq backendda mavjud." }, 501);
      }

      return textResponse('Not Found', 404, 'text/html');
    } catch (e) {
      console.warn('mockApi handler error', e);
      return originalFetch(input, init);
    }
  };

  console.log('mockApi: initialized (API_BASE empty) — intercepting /api/* requests');
}

export default initMockApi;

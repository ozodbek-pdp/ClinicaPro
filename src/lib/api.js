export const API_BASE = import.meta.env.VITE_API_BASE || '';

export async function safeJson(res) {
  if (!res || typeof res.text !== 'function') return null;
  // No content
  if (res.status === 204) return null;
  const ct = (res.headers && (res.headers.get && res.headers.get('content-type'))) || '';
  try {
    const txt = await res.text();
    if (!txt) return {};
    if (ct && ct.indexOf('application/json') !== -1) {
      try { return JSON.parse(txt); } catch (e) { return {}; }
    }
    try { return JSON.parse(txt); } catch (e) { return txt; }
  } catch (e) {
    return null;
  }
}

export async function parseOrText(res) {
  if (!res) return null;
  const ct = (res.headers && (res.headers.get && res.headers.get('content-type'))) || '';
  try {
    if (ct && ct.indexOf('application/json') !== -1) return await safeJson(res);
    return await res.text();
  } catch (e) {
    return null;
  }
}

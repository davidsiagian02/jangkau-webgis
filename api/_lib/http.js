// Utilitas HTTP kecil untuk Vercel Functions (juga dipakai server lokal & tes).
export class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

export function send(res, status, body, headers = {}) {
  res.statusCode = status;
  for (const [k, v] of Object.entries(headers)) res.setHeader(k, v);
  if (body === null || body === undefined) return res.end();
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(body));
}

export function params(req) {
  return new URL(req.url, 'http://localhost').searchParams;
}

export async function readJson(req) {
  let raw = req.body;
  if (raw === undefined && typeof req.on === 'function') {
    raw = await new Promise((resolve, reject) => {
      let s = '';
      req.on('data', (c) => { s += c; if (s.length > 1e5) reject(new HttpError(413, 'Data terlalu besar')); });
      req.on('end', () => resolve(s));
      req.on('error', reject);
    });
  }
  if (raw === undefined || raw === null || raw === '') return {};
  if (typeof raw === 'object' && !Buffer.isBuffer(raw)) return raw;
  try { return JSON.parse(String(raw)); } catch { throw new HttpError(400, 'Format data harus JSON yang valid'); }
}

export function isAdmin(req) {
  const key = process.env.ADMIN_PASSWORD;
  const given = req.headers && (req.headers['x-admin-key'] || req.headers['X-Admin-Key']);
  return Boolean(key) && given === key;
}

export function requireAdmin(req) {
  if (!isAdmin(req)) throw new HttpError(401, 'Kata sandi pengelola salah atau belum diisi');
}

export function allow(req, methods) {
  if (!methods.includes(req.method || 'GET')) throw new HttpError(405, `Method ${req.method} tidak didukung`);
}

// Bungkus handler: semua error dikirim sebagai JSON {error} dengan pesan Bahasa Indonesia.
export function handle(fn) {
  return async (req, res) => {
    try {
      await fn(req, res);
    } catch (e) {
      if (e instanceof HttpError) return send(res, e.status, { error: e.message });
      console.error(e);
      return send(res, 500, { error: 'Terjadi kesalahan di server' });
    }
  };
}

// Tanpa cache CDN: perubahan dari halaman Admin harus langsung terlihat di peta dan analisis.
export const cacheGet = { 'Cache-Control': 'no-store', 'X-Sumber-Data': 'database' };

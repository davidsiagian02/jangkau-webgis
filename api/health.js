import { handle, send, isAdmin } from './_lib/http.js';
import { q } from './_lib/db.js';

export default handle(async (req, res) => {
  let db = false;
  try { await q('SELECT 1'); db = true; } catch { db = false; }
  send(res, 200, { ok: true, db, admin: isAdmin(req) }, { 'Cache-Control': 'no-store' });
});

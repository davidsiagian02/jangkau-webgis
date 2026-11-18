import { handle, send, params, allow, requireAdmin, readJson, HttpError } from './_lib/http.js';
import { q } from './_lib/db.js';
import { LAYER, TITIK_ONE, TITIK_INSERT, TITIK_UPDATE, TITIK_DELETE } from './_lib/sql.js';
import { titikBody, id as parseId, kategoriList } from './_lib/validate.js';

const noCache = { 'Cache-Control': 'no-store', 'X-Sumber-Data': 'database' };

export default handle(async (req, res) => {
  allow(req, ['GET', 'POST', 'PUT', 'DELETE']);
  const p = params(req);
  if (req.method === 'GET' || !req.method) {
    const [row] = await q(LAYER.titik, [kategoriList(p.get('kategori')), null]);
    return send(res, 200, row.fc, noCache);
  }
  requireAdmin(req);
  if (req.method === 'DELETE') {
    const rows = await q(TITIK_DELETE, [parseId(p.get('id'))]);
    if (!rows.length) throw new HttpError(404, 'Titik tidak ditemukan');
    return send(res, 204, null, noCache);
  }
  const b = titikBody(await readJson(req));
  let rowId;
  if (req.method === 'POST') {
    [{ id: rowId }] = await q(TITIK_INSERT, [b.nama, b.kategori, b.jenjang, b.deskripsi, b.lon, b.lat]);
  } else {
    const rows = await q(TITIK_UPDATE, [parseId(p.get('id')), b.nama, b.kategori, b.jenjang, b.deskripsi, b.lon, b.lat]);
    if (!rows.length) throw new HttpError(404, 'Titik tidak ditemukan');
    rowId = rows[0].id;
  }
  const [{ f }] = await q(TITIK_ONE, [rowId]);
  send(res, req.method === 'POST' ? 201 : 200, f, noCache);
});

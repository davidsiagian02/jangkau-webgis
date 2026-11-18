import { handle, send, params, allow, HttpError, cacheGet } from './_lib/http.js';
import { q } from './_lib/db.js';
import { LAYER } from './_lib/sql.js';
import { kategoriList, sumber } from './_lib/validate.js';

export default handle(async (req, res) => {
  allow(req, ['GET']);
  const p = params(req);
  const layer = p.get('layer') || 'titik';
  if (!LAYER[layer]) throw new HttpError(400, `Layer tidak dikenal: ${layer}. Pilihan: ${Object.keys(LAYER).join(', ')}`);
  const kat = kategoriList(p.get('kategori'));
  const src = sumber(p.get('sumber'));
  const [row] = await q(LAYER[layer], [kat, src]);
  send(res, 200, row.fc, cacheGet);
});

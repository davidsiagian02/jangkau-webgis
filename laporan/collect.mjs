// Mengumpulkan angka hasil analisis dari database untuk laporan → laporan/hasil.json
import { writeFileSync } from 'node:fs';
import layers from '../api/layers.js';
import analysis from '../api/analysis.js';
import stats from '../api/stats.js';
import { _resetPool } from '../api/_lib/db.js';

process.env.DATABASE_URL ||= 'postgresql://root@/jangkau_test?host=/var/run/postgresql';
async function call(h, url) {
  const res = { statusCode: 200, headers: {}, setHeader(k, v) { this.headers[k] = v; }, end(b) { this.body = b; } };
  await h({ method: 'GET', url, headers: {} }, res);
  if (res.statusCode !== 200) throw new Error(`${url} → ${res.statusCode} ${res.body}`);
  return JSON.parse(res.body);
}
const out = { stats: await call(stats, '/api/stats'), buffer: {}, overlay: await call(analysis, '/api/analysis?type=overlay') };
for (const r of [300, 500, 1000]) {
  const b = await call(analysis, `/api/analysis?type=buffer&radius=${r}`);
  out.buffer[r] = { ringkasan: b.ringkasan, terjauh: b.sekolah.features.map((f) => f.properties).filter((p) => !p.terlayani).sort((a, c) => c.jarak_halte_m - a.jarak_halte_m).slice(0, 10),
    terdekat: b.sekolah.features.map((f) => f.properties).filter((p) => p.terlayani).sort((a, c) => a.jarak_halte_m - c.jarak_halte_m) };
}
out.recommend = await call(analysis, '/api/analysis?type=recommend&radius=500');
const all500 = await call(analysis, '/api/analysis?type=buffer&radius=500');
out.sekolah500 = all500.sekolah.features.map((f) => f.properties);
const { q } = await import('../api/_lib/db.js');
out.kandidatJalan = [];
for (const f of out.recommend.kandidat.features) {
  const [lon, lat] = f.geometry.coordinates;
  const [r] = await q(`SELECT nama, jenis, d FROM (
      SELECT nama, kelas AS jenis, ST_Distance(geom::geography, ST_SetSRID(ST_MakePoint($1,$2),4326)::geography) d FROM jalan
      UNION ALL SELECT nama, 'jalur survei', ST_Distance(geom::geography, ST_SetSRID(ST_MakePoint($1,$2),4326)::geography) FROM jalur) x
    ORDER BY d LIMIT 1`, [lon, lat]);
  out.kandidatJalan.push(r);
}
const halte = await call(layers, '/api/layers?layer=halte');
out.halte = halte.features.map((f) => ({ ...f.properties, coord: f.geometry.coordinates }));
writeFileSync(new URL('./hasil.json', import.meta.url), JSON.stringify(out, null, 1));
await _resetPool();
console.log('ok', Object.keys(out), out.buffer[500].ringkasan.terlayani, out.recommend.kandidat.features.length);

import { handle, send, params, allow, HttpError, cacheGet } from './_lib/http.js';
import { q } from './_lib/db.js';
import * as SQL from './_lib/sql.js';
import { radius as parseRadius, lonLat } from './_lib/validate.js';
import { KECEPATAN, SNAP_M, TOP_N } from '../src/lib/config.js';

const r1 = (x) => (x === null || x === undefined ? null : Math.round(Number(x) * 10) / 10);
const fc = (features = []) => ({ type: 'FeatureCollection', features });

async function buffer(r) {
  const rows = await q(SQL.BUFFER_SEKOLAH);
  const [u] = await q(SQL.BUFFER_UNION, [r]);
  const per = {};
  let terlayani = 0;
  const features = rows.map((s) => {
    const ok = s.jarak !== null && s.jarak <= r;
    const j = s.jenjang || 'Tidak diketahui';
    per[j] = per[j] || { total: 0, terlayani: 0 };
    per[j].total += 1;
    if (ok) { per[j].terlayani += 1; terlayani += 1; }
    return { type: 'Feature', properties: { uid: s.uid, nama: s.nama, jenjang: s.jenjang, sumber: s.sumber,
      jarak_halte_m: r1(s.jarak), halte_terdekat: s.halte_terdekat, terlayani: ok }, geometry: s.geom };
  });
  const total = features.length;
  return { radius: r, buffer: u && u.geom ? fc([{ type: 'Feature', properties: { radius: r }, geometry: u.geom }]) : fc(),
    sekolah: fc(features), ringkasan: { total, terlayani, persen: total ? r1((terlayani / total) * 100) : 0, per_jenjang: per } };
}

async function recommend(r) {
  const rows = await q(SQL.RECOMMEND, [r, SNAP_M, TOP_N]);
  const terisolasi = rows.length ? rows[0].terisolasi : (await q(SQL.ISOLATED, [r]))[0].n;
  return { radius: r, terisolasi, kandidat: fc(rows.map((k, i) => ({ type: 'Feature',
    geometry: { type: 'Point', coordinates: [k.lon, k.lat] },
    properties: { rank: i + 1, jumlah_sekolah: k.jumlah_sekolah, sekolah: k.sekolah, snap: k.snap, jarak_rata_m: k.jarak_rata_m } }))) };
}

async function nearest(lon, lat, r) {
  const [h] = await q(SQL.NEAREST_HALTE, [lon, lat]);
  const s = await q(SQL.NEAREST_SEKOLAH, [lon, lat, r]);
  const menit = (m) => r1(m / ((KECEPATAN.jalan_kmh * 1000) / 60));
  return { titik: [lon, lat], halte: h ? { nama: h.nama, jarak_m: r1(h.jarak), waktu_menit: menit(h.jarak) } : null,
    sekolah: s.map((x) => ({ nama: x.nama, jenjang: x.jenjang, jarak_m: r1(x.jarak) })) };
}

async function overlay() {
  const b = await q(SQL.OVERLAY_BANDING);
  const f = await q(SQL.OVERLAY_FASILITAS);
  return {
    banding: b.map((x) => ({ nama_survei: x.nama_survei, nama_osm: x.nama_osm, luas_survei_m2: r1(x.ls), luas_osm_m2: r1(x.lo),
      luas_irisan_m2: r1(x.li), iou: x.lo ? Math.round((x.li / (x.ls + x.lo - x.li)) * 1000) / 1000 : 0 })),
    fasilitas_dalam_area: f.map((x) => ({ area: x.area, sumber: x.sumber, jumlah: x.jumlah, daftar: x.daftar })),
  };
}

export default handle(async (req, res) => {
  allow(req, ['GET']);
  const p = params(req);
  const type = p.get('type');
  let data;
  if (type === 'buffer') data = await buffer(parseRadius(p.get('radius')));
  else if (type === 'recommend') data = await recommend(parseRadius(p.get('radius')));
  else if (type === 'nearest') {
    const [lon, lat] = lonLat(p.get('lon'), p.get('lat'));
    data = await nearest(lon, lat, parseRadius(p.get('radius')));
  } else if (type === 'overlay') data = await overlay();
  else throw new HttpError(400, 'Parameter type harus salah satu dari: buffer, recommend, nearest, overlay');
  send(res, 200, data, cacheGet);
});

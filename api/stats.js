import { handle, send, allow, cacheGet } from './_lib/http.js';
import { q } from './_lib/db.js';
import { STATS, STATS_KATEGORI, STATS_JENJANG, STATS_JALUR } from './_lib/sql.js';
import { KECEPATAN } from '../src/lib/config.js';

const r1 = (x) => Math.round(x * 10) / 10;
const toObj = (rows) => Object.fromEntries(rows.map((r) => [r.k, r.n]));

export default handle(async (req, res) => {
  allow(req, ['GET']);
  const [[jumlah], kat, jen, jalur] = await Promise.all([q(STATS), q(STATS_KATEGORI), q(STATS_JENJANG), q(STATS_JALUR)]);
  send(res, 200, {
    jumlah, per_kategori: toObj(kat), per_jenjang: toObj(jen),
    jalur: jalur.map((j) => ({ nama: j.nama, jenis: j.jenis, panjang_m: r1(j.m),
      jalan_menit: r1(j.m / ((KECEPATAN.jalan_kmh * 1000) / 60)), sepeda_menit: r1(j.m / ((KECEPATAN.sepeda_kmh * 1000) / 60)) })),
  }, cacheGet);
});

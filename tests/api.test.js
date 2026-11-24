import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { setupDb } from '../scripts/setup-db.js';
import * as local from '../src/lib/local.js';
import layers from '../api/layers.js';
import analysis from '../api/analysis.js';
import stats from '../api/stats.js';
import titik from '../api/titik.js';
import health from '../api/health.js';
import { _resetPool } from '../api/_lib/db.js';

const DB_URL = process.env.TEST_DATABASE_URL || 'postgresql://root@/jangkau_test?host=/var/run/postgresql';
const KEY = 'rahasia-uji';
const file = (n) => JSON.parse(readFileSync(new URL(`../public/data/${n}.geojson`, import.meta.url)));

async function call(handler, { method = 'GET', url, headers = {}, body } = {}) {
  const req = { method, url, headers, body };
  const res = {
    statusCode: 200, headers: {}, payload: '',
    setHeader(k, v) { this.headers[k.toLowerCase()] = v; },
    end(b) { this.payload = b || ''; this.done = true; },
  };
  await handler(req, res);
  return { status: res.statusCode, headers: res.headers, body: res.payload ? JSON.parse(res.payload) : null };
}

before(async () => {
  await setupDb(DB_URL);
  process.env.DATABASE_URL = DB_URL;
  process.env.ADMIN_PASSWORD = KEY;
});
after(async () => { await _resetPool(); });

const halteFC = () => ({ type: 'FeatureCollection', features: file('titik').features.filter((f) => f.properties.kategori === 'halte') });

test('layers: titik survei berjumlah 31 dan berbentuk FeatureCollection', async () => {
  const r = await call(layers, { url: '/api/layers?layer=titik&sumber=survei' });
  assert.equal(r.status, 200);
  assert.equal(r.body.type, 'FeatureCollection');
  assert.equal(r.body.features.length, 31);
  assert.equal(r.headers['x-sumber-data'], 'database');
});

test('layers: filter kategori halte', async () => {
  const r = await call(layers, { url: '/api/layers?layer=titik&kategori=halte' });
  assert.ok(r.body.features.length >= 4);
  assert.ok(r.body.features.every((f) => f.properties.kategori === 'halte'));
});

test('layers: area, jalur, sekolah, halte tersedia', async () => {
  for (const [layer, n] of [['area', file('area').features.length], ['jalur', 6], ['jalan', file('jalan').features.length], ['sekolah', file('sekolah_analisis').features.length], ['halte', halteFC().features.length]]) {
    const r = await call(layers, { url: `/api/layers?layer=${layer}` });
    assert.equal(r.status, 200, layer);
    assert.equal(r.body.features.length, n, layer);
  }
});

test('analysis buffer: hasil sama dengan analisis cadangan (parity)', async () => {
  const r = await call(analysis, { url: '/api/analysis?type=buffer&radius=500' });
  assert.equal(r.status, 200);
  const l = local.buffer(file('sekolah_analisis'), halteFC(), 500);
  assert.equal(r.body.ringkasan.total, l.ringkasan.total);
  const byUid = new Map(l.sekolah.features.map((f) => [f.properties.uid, f.properties]));
  for (const f of r.body.sekolah.features) {
    const p = f.properties;
    const q = byUid.get(p.uid);
    assert.ok(q, `uid ${p.uid} ada di cadangan`);
    assert.ok(Math.abs(p.jarak_halte_m - q.jarak_halte_m) <= Math.max(3, q.jarak_halte_m * 0.007), `${p.nama}: ${p.jarak_halte_m} vs ${q.jarak_halte_m}`);
    if (Math.abs(q.jarak_halte_m - 500) > 4) assert.equal(p.terlayani, q.terlayani, p.nama);
  }
  for (const f of r.body.sekolah.features) {
    assert.equal(f.geometry.type, 'Point');
    assert.equal(f.geometry.coordinates.length, 2);
  }
  assert.equal(r.body.buffer.features.length, 1);
  assert.ok(['Polygon', 'MultiPolygon'].includes(r.body.buffer.features[0].geometry.type));
  assert.deepEqual(Object.keys(r.body.ringkasan).sort(), ['per_jenjang', 'persen', 'terlayani', 'total']);
});

test('analysis recommend: maksimal 10 kandidat terurut menurun', async () => {
  const r = await call(analysis, { url: '/api/analysis?type=recommend&radius=500' });
  assert.equal(r.status, 200);
  const k = r.body.kandidat.features.map((f) => f.properties);
  assert.ok(k.length > 0 && k.length <= 10);
  k.forEach((p, i) => { assert.equal(p.rank, i + 1); if (i) assert.ok(k[i - 1].jumlah_sekolah >= p.jumlah_sekolah); });
  assert.equal(typeof r.body.terisolasi, 'number');
  const garis = { type: 'FeatureCollection', features: [...file('jalur').features, ...file('jalan').features] };
  const l = local.recommend(file('sekolah_analisis'), halteFC(), garis, 500);
  assert.equal(k[0].jumlah_sekolah, l.kandidat.features[0].properties.jumlah_sekolah);
  assert.equal(k.filter((p) => p.snap).length, l.kandidat.features.filter((f) => f.properties.snap).length);
  assert.ok(k.some((p) => p.snap), 'ada usulan yang ditempel ke jalan');
});

test('analysis nearest: klik tepat di Halte Smpn 14', async () => {
  const h = file('titik').features.find((f) => f.properties.nama === 'Halte Smpn 14').geometry.coordinates;
  const r = await call(analysis, { url: `/api/analysis?type=nearest&lon=${h[0]}&lat=${h[1]}&radius=500` });
  assert.equal(r.status, 200);
  assert.ok(r.body.halte.jarak_m < 1);
  assert.ok(r.body.sekolah.length > 0);
  for (let i = 1; i < r.body.sekolah.length; i++) assert.ok(r.body.sekolah[i - 1].jarak_m <= r.body.sekolah[i].jarak_m);
});

test('analysis overlay: 5 baris banding, IoU SMP 10 antara 0,80 dan 0,90', async () => {
  const r = await call(analysis, { url: '/api/analysis?type=overlay' });
  assert.equal(r.body.banding.length, 5);
  const smp10 = r.body.banding.find((b) => b.nama_survei === 'SMP 10');
  assert.ok(smp10.iou >= 0.8 && smp10.iou <= 0.9, `iou ${smp10.iou}`);
  const l = local.overlay(file('area'), file('titik'));
  assert.deepEqual(r.body.fasilitas_dalam_area.map((x) => [x.area, x.jumlah]), l.fasilitas_dalam_area.map((x) => [x.area, x.jumlah]));
});

test('stats: 6 jalur dengan waktu tempuh', async () => {
  const r = await call(stats, { url: '/api/stats' });
  assert.equal(r.status, 200);
  assert.equal(r.body.jalur.length, 6);
  for (const j of r.body.jalur) {
    assert.equal(j.jalan_menit, Math.round((j.panjang_m / (5000 / 60)) * 10) / 10);
    assert.equal(j.sepeda_menit, Math.round((j.panjang_m / (15000 / 60)) * 10) / 10);
  }
  assert.equal(r.body.jumlah.titik_survei, 31);
  assert.equal(r.body.jumlah.sekolah_analisis, file('sekolah_analisis').features.length);
});

// ---- Review Focus 2: parameter rusak → 400
for (const url of ['/api/analysis?type=buffer&radius=abc', '/api/analysis?type=buffer&radius=5000',
  '/api/analysis?type=nearest&lon=999&lat=0.5', '/api/analysis?type=nearest&lat=0.5', '/api/analysis?type=xyz',
  '/api/layers?layer=rahasia', '/api/layers?layer=titik&kategori=warung']) {
  test(`400 untuk parameter rusak: ${url}`, async () => {
    const r = await call(url.startsWith('/api/layers') ? layers : analysis, { url });
    assert.equal(r.status, 400);
    assert.match(r.body.error, /\w/);
  });
}

// ---- CRUD + Review Focus 3 & 4
const count = async () => (await call(titik, { url: '/api/titik' })).body.features.length;
const valid = { nama: 'Halte Uji', kategori: 'halte', deskripsi: 'dibuat oleh tes', lon: 101.45, lat: 0.51 };

test('POST tanpa password / password salah → 401 dan data tidak berubah', async () => {
  const n = await count();
  for (const headers of [{}, { 'x-admin-key': 'salah' }]) {
    const r = await call(titik, { method: 'POST', url: '/api/titik', headers, body: valid });
    assert.equal(r.status, 401);
  }
  assert.equal(await count(), n);
});

for (const [label, body] of [
  ['nama kosong', { ...valid, nama: '   ' }],
  ['kategori di luar daftar', { ...valid, kategori: 'warung' }],
  ['lat di luar Pekanbaru', { ...valid, lat: 2.0 }],
  ['lon bukan angka', { ...valid, lon: 'abc' }],
  ['jenjang tidak dikenal', { ...valid, kategori: 'sekolah', jenjang: 'Kuliah' }],
]) {
  test(`POST input tidak valid (${label}) → 400`, async () => {
    const r = await call(titik, { method: 'POST', url: '/api/titik', headers: { 'x-admin-key': KEY }, body });
    assert.equal(r.status, 400);
  });
}

test('POST body string JSON rusak → 400', async () => {
  const r = await call(titik, { method: 'POST', url: '/api/titik', headers: { 'x-admin-key': KEY }, body: '{rusak' });
  assert.equal(r.status, 400);
});

test('CRUD lengkap dengan password benar', async () => {
  const n = await count();
  const c = await call(titik, { method: 'POST', url: '/api/titik', headers: { 'x-admin-key': KEY }, body: valid });
  assert.equal(c.status, 201);
  const id = c.body.properties.id;
  assert.equal(c.body.properties.sumber, 'admin');
  assert.equal(await count(), n + 1);
  const u = await call(titik, { method: 'PUT', url: `/api/titik?id=${id}`, headers: { 'x-admin-key': KEY }, body: { ...valid, nama: 'Halte Uji 2' } });
  assert.equal(u.status, 200);
  assert.equal(u.body.properties.nama, 'Halte Uji 2');
  const d = await call(titik, { method: 'DELETE', url: `/api/titik?id=${id}`, headers: { 'x-admin-key': KEY } });
  assert.equal(d.status, 204);
  assert.equal(await count(), n);
  const d2 = await call(titik, { method: 'DELETE', url: `/api/titik?id=${id}`, headers: { 'x-admin-key': KEY } });
  assert.equal(d2.status, 404);
});

test('nama berisi HTML disimpan apa adanya (escape dilakukan di tampilan)', async () => {
  const c = await call(titik, { method: 'POST', url: '/api/titik', headers: { 'x-admin-key': KEY }, body: { ...valid, nama: '<b>x</b>' } });
  assert.equal(c.body.properties.nama, '<b>x</b>');
  await call(titik, { method: 'DELETE', url: `/api/titik?id=${c.body.properties.id}`, headers: { 'x-admin-key': KEY } });
});

test('method tidak didukung → 405', async () => {
  const r = await call(layers, { method: 'DELETE', url: '/api/layers?layer=titik' });
  assert.equal(r.status, 405);
});

test('health: melaporkan status database dan admin', async () => {
  const ok = await call(health, { url: '/api/health', headers: { 'x-admin-key': KEY } });
  assert.deepEqual(ok.body, { ok: true, db: true, admin: true });
  const no = await call(health, { url: '/api/health', headers: { 'x-admin-key': 'salah' } });
  assert.equal(no.body.admin, false);
});

test('GET data publik di-cache sebentar di CDN Vercel (hemat fungsi & database)', async () => {
  for (const [h, url] of [[layers, '/api/layers?layer=titik'], [analysis, '/api/analysis?type=buffer&radius=500'], [stats, '/api/stats']]) {
    const r = await call(h, { url });
    assert.match(r.headers['cache-control'], /public, s-maxage=60, stale-while-revalidate=600/, url);
  }
});

test('data titik untuk pengelola tetap tidak di-cache', async () => {
  const r = await call(titik, { url: '/api/titik' });
  assert.equal(r.headers['cache-control'], 'no-store');
});

test('buffer tanpa geometri (geom=0) untuk Beranda & Data: isi sama, ukuran sekitar separuhnya', async () => {
  const penuh = await call(analysis, { url: '/api/analysis?type=buffer&radius=500' });
  const ringan = await call(analysis, { url: '/api/analysis?type=buffer&radius=500&geom=0' });
  assert.deepEqual(ringan.body.ringkasan, penuh.body.ringkasan);
  assert.equal(ringan.body.sekolah.features.length, penuh.body.sekolah.features.length);
  assert.ok(ringan.body.sekolah.features.every((f) => f.geometry === null));
  assert.equal(ringan.body.buffer.features.length, 0);
  assert.ok(JSON.stringify(ringan.body).length < JSON.stringify(penuh.body).length * 0.6);
});

test('koordinat dibulatkan 6 desimal (±10 cm) agar data lebih kecil', async () => {
  const r = await call(layers, { url: '/api/layers?layer=sekolah' });
  const desimal = (n) => (String(n).split('.')[1] || '').length;
  const [lon, lat] = r.body.features[0].geometry.coordinates;
  assert.ok(desimal(lon) <= 6 && desimal(lat) <= 6, `${lon}, ${lat}`);
});

test('database kosong (tabel belum dibuat) → 503 dengan petunjuk db:setup', async () => {
  await _resetPool();
  process.env.DATABASE_URL = DB_URL.replace('jangkau_test', 'jangkau_kosong');
  const r = await call(layers, { url: '/api/layers?layer=titik' });
  assert.equal(r.status, 503);
  assert.match(r.body.error, /db:setup/);
  await _resetPool();
  process.env.DATABASE_URL = DB_URL;
});

// ---- Review Focus 1: database tidak tersedia → 503 (dijalankan terakhir)
test('tanpa DATABASE_URL → 503 JSON dan health db:false', async () => {
  await _resetPool();
  delete process.env.DATABASE_URL;
  delete process.env.POSTGRES_URL;
  const r = await call(layers, { url: '/api/layers?layer=titik' });
  assert.equal(r.status, 503);
  assert.match(r.body.error, /Database/);
  const h = await call(health, { url: '/api/health' });
  assert.equal(h.status, 200);
  assert.equal(h.body.db, false);
});

test('DATABASE_URL salah (server mati) → 503', async () => {
  await _resetPool();
  process.env.DATABASE_URL = 'postgresql://x:y@127.0.0.1:1/tidakada';
  const r = await call(analysis, { url: '/api/analysis?type=buffer&radius=500' });
  assert.equal(r.status, 503);
  await _resetPool();
});

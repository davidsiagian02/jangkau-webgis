import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as api from '../src/lib/api.js';

const file = (n) => JSON.parse(readFileSync(new URL(`../public/data/${n}.geojson`, import.meta.url)));
const res = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body });

// fetch tiruan: /api/* membalas sesuai `apiStatus`, /data/* membaca file GeoJSON cadangan
let apiStatus, calls;
const fakeFetch = async (url) => {
  calls.push(url);
  if (url.startsWith('/api/')) {
    if (apiStatus === 'down') throw new TypeError('fetch failed');
    if (apiStatus !== 200) return res(apiStatus, { error: 'Database tidak tersedia' });
    return res(200, { type: 'FeatureCollection', features: [{ type: 'Feature', properties: { nama: 'dari-db' }, geometry: null }] });
  }
  const m = url.match(/\/data\/(\w+)\.geojson/);
  return res(200, file(m[1]));
};

beforeEach(() => {
  calls = [];
  api._reset();
  api._setFetch(fakeFetch);
});

test('getLayer memakai database bila API sehat', async () => {
  apiStatus = 200;
  const r = await api.getLayer('titik');
  assert.equal(r.sumber, 'database');
  assert.equal(r.data.features[0].properties.nama, 'dari-db');
});

test('getLayer jatuh ke data cadangan saat API 503', async () => {
  apiStatus = 503;
  const r = await api.getLayer('titik');
  assert.equal(r.sumber, 'cadangan');
  assert.equal(r.data.features.length, file('titik').features.length);
  assert.ok(calls.includes('/data/titik.geojson'));
});

test('getLayer cadangan saat jaringan putus + filter kategori', async () => {
  apiStatus = 'down';
  const r = await api.getLayer('titik', { kategori: 'halte' });
  assert.equal(r.sumber, 'cadangan');
  assert.ok(r.data.features.length > 0);
  assert.ok(r.data.features.every((f) => f.properties.kategori === 'halte'));
});

test('getLayer halte diturunkan dari titik pada mode cadangan', async () => {
  apiStatus = 503;
  const r = await api.getLayer('halte');
  assert.ok(r.data.features.every((f) => f.properties.kategori === 'halte'));
});

test('getAnalysis buffer cadangan menghasilkan bentuk yang sama dengan API', async () => {
  apiStatus = 503;
  const r = await api.getAnalysis('buffer', { radius: 500 });
  assert.equal(r.sumber, 'cadangan');
  assert.equal(r.data.radius, 500);
  assert.equal(r.data.sekolah.features.length, file('sekolah_analisis').features.length);
  assert.ok('persen' in r.data.ringkasan);
});

test('getAnalysis recommend cadangan memakai jalur + jalan untuk menempel kandidat', async () => {
  apiStatus = 503;
  const r = await api.getAnalysis('recommend', { radius: 500 });
  assert.equal(r.sumber, 'cadangan');
  assert.ok(calls.includes('/data/jalan.geojson'));
  assert.ok(r.data.kandidat.features.some((f) => f.properties.snap));
});

test('getLayer jalan tersedia pada mode cadangan', async () => {
  apiStatus = 503;
  const r = await api.getLayer('jalan');
  assert.equal(r.data.features.length, file('jalan').features.length);
});

test('setelah API gagal sekali, permintaan berikutnya langsung ke cadangan', async () => {
  apiStatus = 'down';
  await api.getLayer('titik');
  calls = [];
  await api.getLayer('area');
  assert.ok(!calls.some((u) => u.startsWith('/api/')));
});

test('mode paksa cadangan tidak memanggil API', async () => {
  apiStatus = 200;
  api.setForceFallback(true);
  const r = await api.getStats();
  assert.equal(r.sumber, 'cadangan');
  assert.ok(!calls.some((u) => u.startsWith('/api/')));
});

test('createTitik melempar pesan error dari server', async () => {
  api._setFetch(async () => res(401, { error: 'Password admin salah' }));
  await assert.rejects(api.createTitik('salah', { nama: 'x' }), /Password admin salah/);
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as local from '../src/lib/local.js';
import { escapeHtml, fmtMeter, fmtMenit } from '../src/lib/util.js';

// 1 derajat bujur di dekat ekuator ≈ 111,32 km → 0.001° ≈ 111 m
const pt = (lon, lat, props = {}) => ({ type: 'Feature', properties: props, geometry: { type: 'Point', coordinates: [lon, lat] } });
const fc = (features) => ({ type: 'FeatureCollection', features });
const sq = (lon, lat, d, props) => ({ type: 'Feature', properties: props, geometry: { type: 'Polygon', coordinates: [[[lon, lat], [lon + d, lat], [lon + d, lat + d], [lon, lat + d], [lon, lat]]] } });

const halte = fc([pt(101.45, 0.51, { nama: 'Halte A' })]);
const sekolah = fc([
  pt(101.45, 0.51, { uid: 's1', nama: 'Tepat di halte', jenjang: 'SD/MI', sumber: 'osm' }),
  pt(101.4572, 0.51, { uid: 's2', nama: 'Jauh 800 m', jenjang: 'SMP/MTs', sumber: 'osm' }),
  pt(101.459, 0.51, { uid: 's3', nama: 'Jauh 1000 m', jenjang: 'SMP/MTs', sumber: 'osm' }),
]);

test('buffer: sekolah tepat di halte terlayani dengan jarak 0', () => {
  const r = local.buffer(sekolah, halte, 500);
  const s1 = r.sekolah.features.find((f) => f.properties.uid === 's1').properties;
  assert.equal(s1.terlayani, true);
  assert.equal(s1.jarak_halte_m, 0);
  assert.equal(s1.halte_terdekat, 'Halte A');
});

test('buffer: sekolah 800 m tidak terlayani pada radius 500', () => {
  const r = local.buffer(sekolah, halte, 500);
  const s2 = r.sekolah.features.find((f) => f.properties.uid === 's2').properties;
  assert.equal(s2.terlayani, false);
  assert.ok(Math.abs(s2.jarak_halte_m - 801) < 5, `jarak ${s2.jarak_halte_m}`);
  assert.deepEqual(r.ringkasan.per_jenjang['SMP/MTs'], { total: 2, terlayani: 0 });
  assert.equal(r.ringkasan.total, 3);
  assert.equal(r.ringkasan.terlayani, 1);
  assert.equal(r.ringkasan.persen, 33.3);
  assert.equal(r.buffer.features.length, 1);
});

test('buffer: tanpa halte semua sekolah tidak terlayani dan jarak null', () => {
  const r = local.buffer(sekolah, fc([]), 500);
  assert.ok(r.sekolah.features.every((f) => f.properties.terlayani === false && f.properties.jarak_halte_m === null));
  assert.equal(r.buffer.features.length, 0);
});

test('recommend: dua sekolah tak terlayani berdekatan menghasilkan satu kandidat', () => {
  const r = local.recommend(sekolah, halte, fc([]), 500);
  assert.equal(r.kandidat.features.length, 1);
  const k = r.kandidat.features[0].properties;
  assert.equal(k.rank, 1);
  assert.equal(k.jumlah_sekolah, 2);
  assert.deepEqual(k.sekolah.sort(), ['Jauh 1000 m', 'Jauh 800 m']);
  assert.equal(k.snap, false);
  assert.equal(r.terisolasi, 0);
});

test('recommend: kandidat di-snap ke jalur bila <= 150 m', () => {
  const jalur = fc([{ type: 'Feature', properties: { nama: 'J' }, geometry: { type: 'LineString', coordinates: [[101.455, 0.5105], [101.462, 0.5105]] } }]);
  const r = local.recommend(sekolah, halte, jalur, 500);
  const k = r.kandidat.features[0];
  assert.equal(k.properties.snap, true);
  assert.ok(Math.abs(k.geometry.coordinates[1] - 0.5105) < 1e-6);
});

test('recommend: tidak ada sekolah tak terlayani → kandidat kosong', () => {
  const r = local.recommend(fc([sekolah.features[0]]), halte, fc([]), 500);
  assert.equal(r.kandidat.features.length, 0);
  assert.equal(r.terisolasi, 0);
});

test('recommend: sekolah tak terlayani yang sendirian dihitung terisolasi', () => {
  const r = local.recommend(fc([sekolah.features[0], pt(101.47, 0.53, { uid: 'x', nama: 'Sendiri', jenjang: 'SD/MI' })]), halte, fc([]), 500);
  assert.equal(r.kandidat.features.length, 0);
  assert.equal(r.terisolasi, 1);
});

test('nearest: halte terdekat dan sekolah dalam radius urut jarak menaik', () => {
  const r = local.nearest(sekolah, halte, 101.4585, 0.51, 500);
  assert.equal(r.halte.nama, 'Halte A');
  assert.ok(Math.abs(r.halte.jarak_m - 946) < 5);
  assert.equal(r.halte.waktu_menit, Math.round((r.halte.jarak_m / (5000 / 60)) * 10) / 10);
  assert.deepEqual(r.sekolah.map((s) => s.nama), ['Jauh 1000 m', 'Jauh 800 m']);
  assert.ok(r.sekolah[0].jarak_m <= r.sekolah[1].jarak_m);
});

test('nearest: tanpa halte mengembalikan null', () => {
  assert.equal(local.nearest(sekolah, fc([]), 101.45, 0.51, 500).halte, null);
});

test('overlay: IoU poligon survei vs OSM', () => {
  const area = fc([
    sq(101.45, 0.51, 0.001, { id: 1, nama: 'Survei A', sumber: 'survei' }),
    sq(101.4505, 0.51, 0.001, { id: 2, nama: 'OSM A', sumber: 'osm' }),
  ]);
  const titik = fc([pt(101.4502, 0.5102, { nama: 'Kantin', kategori: 'fasilitas', sumber: 'survei' })]);
  const r = local.overlay(area, titik);
  assert.equal(r.banding.length, 1);
  const b = r.banding[0];
  assert.equal(b.nama_osm, 'OSM A');
  assert.ok(Math.abs(b.iou - 1 / 3) < 0.01, `iou ${b.iou}`);
  const f = r.fasilitas_dalam_area.find((x) => x.area === 'Survei A');
  assert.equal(f.jumlah, 1);
  assert.deepEqual(f.daftar, ['Kantin']);
});

test('stats: panjang & waktu tempuh jalur', () => {
  const jalur = fc([{ type: 'Feature', properties: { nama: 'J', jenis: 'jalur' }, geometry: { type: 'LineString', coordinates: [[101.45, 0.51], [101.459, 0.51]] } }]);
  const r = local.stats(fc([pt(101.45, 0.51, { kategori: 'halte', sumber: 'survei' })]), fc([]), jalur, sekolah);
  assert.equal(r.jalur.length, 1);
  const j = r.jalur[0];
  assert.ok(Math.abs(j.panjang_m - 1002) < 5);
  assert.equal(j.jalan_menit, Math.round((j.panjang_m / (5000 / 60)) * 10) / 10);
  assert.equal(j.sepeda_menit, Math.round((j.panjang_m / (15000 / 60)) * 10) / 10);
  assert.equal(r.jumlah.halte, 1);
  assert.equal(r.jumlah.sekolah_analisis, 3);
  assert.equal(r.per_jenjang['SMP/MTs'], 2);
});

test('escapeHtml menetralkan tag HTML', () => {
  const s = escapeHtml('<script>alert("x")</script> & \'');
  assert.ok(!s.includes('<') && !s.includes('>'));
  assert.ok(s.includes('&amp;'));
  assert.equal(escapeHtml(null), '');
});

test('format angka gaya Indonesia', () => {
  assert.equal(fmtMeter(750.4), '750 m');
  assert.equal(fmtMeter(1250), '1,25 km');
  assert.equal(fmtMeter(null), '–');
  assert.equal(fmtMenit(9.04), '9 menit');
  assert.equal(fmtMenit(0.4), '< 1 menit');
});

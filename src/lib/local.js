// Analisis spasial versi browser (Turf.js). Dipakai saat API/database tidak tersedia.
// Bentuk output SAMA PERSIS dengan /api/analysis dan /api/stats.
import * as turf from '@turf/turf';
import { KECEPATAN, SNAP_M, TOP_N } from './config.js';

const fc = (features = []) => ({ type: 'FeatureCollection', features });
const meter = (a, b) => turf.distance(a, b, { units: 'kilometers' }) * 1000;
const r1 = (x) => Math.round(x * 10) / 10;
const menitJalan = (m) => r1(m / ((KECEPATAN.jalan_kmh * 1000) / 60));
const menitSepeda = (m) => r1(m / ((KECEPATAN.sepeda_kmh * 1000) / 60));

function terdekat(point, halteFC) {
  let best = null;
  for (const h of halteFC.features) {
    const d = meter(point, h);
    if (!best || d < best.d) best = { d, h };
  }
  return best;
}

export function buffer(sekolahFC, halteFC, radius) {
  const halte = halteFC.features;
  let buf = fc();
  if (halte.length) {
    const circles = halte.map((h) => turf.buffer(h, radius / 1000, { units: 'kilometers', steps: 16 }));
    const u = circles.length === 1 ? circles[0] : turf.union(fc(circles));
    buf = fc([{ type: 'Feature', properties: { radius }, geometry: u.geometry }]);
  }
  const per = {};
  let terlayani = 0;
  const sekolah = sekolahFC.features.map((s) => {
    const best = terdekat(s, halteFC);
    const jarak = best ? r1(best.d) : null;
    const ok = best ? best.d <= radius : false;
    const j = s.properties.jenjang || 'Tidak diketahui';
    per[j] = per[j] || { total: 0, terlayani: 0 };
    per[j].total += 1;
    if (ok) { per[j].terlayani += 1; terlayani += 1; }
    const { uid, nama, jenjang, sumber } = s.properties;
    return { type: 'Feature', properties: { uid, nama, jenjang, sumber, jarak_halte_m: jarak,
      halte_terdekat: best ? best.h.properties.nama : null, terlayani: ok }, geometry: s.geometry };
  });
  const total = sekolah.length;
  return { radius, buffer: buf, sekolah: fc(sekolah),
    ringkasan: { total, terlayani, persen: total ? r1((terlayani / total) * 100) : 0, per_jenjang: per } };
}

export function recommend(sekolahFC, halteFC, jalurFC, radius) {
  const { sekolah } = buffer(sekolahFC, halteFC, radius);
  const tak = sekolah.features.filter((f) => !f.properties.terlayani);
  if (!tak.length) return { radius, kandidat: fc(), terisolasi: 0 };
  const clustered = turf.clustersDbscan(fc(tak.map((f) => turf.point(f.geometry.coordinates, { ...f.properties }))),
    radius / 1000, { units: 'kilometers', minPoints: 2 });
  const groups = new Map();
  let terisolasi = 0;
  for (const f of clustered.features) {
    if (f.properties.dbscan === 'noise' || f.properties.cluster === undefined) { terisolasi += 1; continue; }
    if (!groups.has(f.properties.cluster)) groups.set(f.properties.cluster, []);
    groups.get(f.properties.cluster).push(f);
  }
  const kandidat = [];
  for (const members of groups.values()) {
    let p = turf.centroid(fc(members));
    let snap = false;
    for (const line of jalurFC.features) {
      const n = turf.nearestPointOnLine(line, p, { units: 'kilometers' });
      if (meter(p, n) <= SNAP_M) { p = turf.point(n.geometry.coordinates); snap = true; break; }
    }
    const dilayani = tak.map((s) => ({ s, d: meter(p, s) })).filter((x) => x.d <= radius);
    if (!dilayani.length) continue;
    kandidat.push({ type: 'Feature', geometry: p.geometry, properties: {
      jumlah_sekolah: dilayani.length, sekolah: dilayani.map((x) => x.s.properties.nama), snap,
      jarak_rata_m: r1(dilayani.reduce((a, x) => a + x.d, 0) / dilayani.length) } });
  }
  kandidat.sort((a, b) => b.properties.jumlah_sekolah - a.properties.jumlah_sekolah
    || a.properties.jarak_rata_m - b.properties.jarak_rata_m);
  const top = kandidat.slice(0, TOP_N).map((k, i) => ({ ...k, properties: { rank: i + 1, ...k.properties } }));
  return { radius, kandidat: fc(top), terisolasi };
}

export function nearest(sekolahFC, halteFC, lon, lat, radius) {
  const p = turf.point([lon, lat]);
  const best = terdekat(p, halteFC);
  const sekolah = sekolahFC.features
    .map((s) => ({ nama: s.properties.nama, jenjang: s.properties.jenjang, jarak_m: r1(meter(p, s)) }))
    .filter((s) => s.jarak_m <= radius)
    .sort((a, b) => a.jarak_m - b.jarak_m);
  return { titik: [lon, lat],
    halte: best ? { nama: best.h.properties.nama, jarak_m: r1(best.d), waktu_menit: menitJalan(best.d) } : null,
    sekolah };
}

export function overlay(areaFC, titikFC) {
  const survei = areaFC.features.filter((a) => a.properties.sumber === 'survei');
  const osm = areaFC.features.filter((a) => a.properties.sumber === 'osm');
  const banding = [];
  for (const s of survei) {
    let best = null;
    const bs = turf.bbox(s);
    for (const o of osm) {
      const bo = turf.bbox(o);
      if (bo[0] > bs[2] || bo[2] < bs[0] || bo[1] > bs[3] || bo[3] < bs[1]) continue;
      const i = turf.intersect(fc([s, o]));
      if (!i) continue;
      const ia = turf.area(i);
      if (!best || ia > best.ia) best = { o, ia };
    }
    const ls = turf.area(s);
    if (!best) {
      banding.push({ nama_survei: s.properties.nama, nama_osm: null, luas_survei_m2: r1(ls), luas_osm_m2: null, luas_irisan_m2: 0, iou: 0 });
      continue;
    }
    const lo = turf.area(best.o);
    banding.push({ nama_survei: s.properties.nama, nama_osm: best.o.properties.nama, luas_survei_m2: r1(ls),
      luas_osm_m2: r1(lo), luas_irisan_m2: r1(best.ia), iou: Math.round((best.ia / (ls + lo - best.ia)) * 1000) / 1000 });
  }
  const fasil = titikFC.features.filter((t) => ['fasilitas', 'literasi'].includes(t.properties.kategori));
  const fasilitas_dalam_area = [];
  for (const a of areaFC.features) {
    const daftar = fasil.filter((t) => turf.booleanPointInPolygon(t, a)).map((t) => t.properties.nama);
    if (daftar.length || a.properties.sumber === 'survei') fasilitas_dalam_area.push({ area: a.properties.nama, sumber: a.properties.sumber, jumlah: daftar.length, daftar });
  }
  return { banding, fasilitas_dalam_area };
}

export function stats(titikFC, areaFC, jalurFC, sekolahFC) {
  const t = titikFC.features.map((f) => f.properties);
  const per_kategori = {};
  for (const p of t) per_kategori[p.kategori] = (per_kategori[p.kategori] || 0) + 1;
  const per_jenjang = {};
  for (const f of sekolahFC.features) {
    const j = f.properties.jenjang || 'Tidak diketahui';
    per_jenjang[j] = (per_jenjang[j] || 0) + 1;
  }
  const jalur = jalurFC.features.map((f) => {
    const m = turf.length(f, { units: 'kilometers' }) * 1000;
    return { nama: f.properties.nama, jenis: f.properties.jenis, panjang_m: r1(m), jalan_menit: menitJalan(m), sepeda_menit: menitSepeda(m) };
  });
  return {
    jumlah: {
      titik_survei: t.filter((p) => p.sumber === 'survei').length,
      sekolah_osm: sekolahFC.features.filter((f) => f.properties.sumber === 'osm').length,
      halte: t.filter((p) => p.kategori === 'halte').length,
      jalur: jalur.length,
      area_survei: areaFC.features.filter((f) => f.properties.sumber === 'survei').length,
      sekolah_analisis: sekolahFC.features.length,
    },
    per_kategori, per_jenjang, jalur,
  };
}

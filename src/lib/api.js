// Klien data: memakai API (database PostGIS) dan otomatis jatuh ke GeoJSON cadangan + Turf bila gagal.
import * as local from './local.js';

let _fetch = (...a) => globalThis.fetch(...a);
let apiDown = false;
let force = false;
const cache = new Map();

export function _setFetch(f) { _fetch = f; }
export function _reset() { apiDown = false; force = false; cache.clear(); }
export function setForceFallback(v) { force = !!v; }
export function isFallback() { return force || apiDown; }

async function getJson(url, opts) {
  const r = await _fetch(url, opts);
  let body = null;
  try { body = await r.json(); } catch { body = null; }
  if (!r.ok) {
    const err = new Error((body && body.error) || `Permintaan gagal (${r.status})`);
    err.status = r.status;
    throw err;
  }
  return body;
}

async function fromApi(url) {
  if (force || apiDown) return null;
  try {
    return await getJson(url);
  } catch (e) {
    if (e.status === 400) throw e; // kesalahan input: jangan disembunyikan oleh mode cadangan
    apiDown = true;
    return null;
  }
}

const FILES = { titik: 'titik', area: 'area', jalur: 'jalur', jalan: 'jalan', sekolah: 'sekolah_analisis', halte: 'titik' };
async function file(name) {
  if (!cache.has(name)) cache.set(name, getJson(`/data/${name}.geojson`).catch((e) => { cache.delete(name); throw e; }));
  return cache.get(name);
}

function filterFC(data, params) {
  const kat = params.kategori ? String(params.kategori).split(',') : null;
  const feats = data.features.filter((f) => (!kat || kat.includes(f.properties.kategori))
    && (!params.sumber || f.properties.sumber === params.sumber)
    && (!params.jenjang || f.properties.jenjang === params.jenjang));
  return { type: 'FeatureCollection', features: feats };
}

const qs = (o) => new URLSearchParams(Object.entries(o).filter(([, v]) => v !== undefined && v !== null && v !== '')).toString();

export async function getLayer(name, params = {}) {
  const viaApi = await fromApi(`/api/layers?${qs({ layer: name, ...params })}`);
  if (viaApi) return { data: viaApi, sumber: 'database' };
  const raw = await file(FILES[name]);
  const p = name === 'halte' ? { ...params, kategori: 'halte' } : params;
  return { data: filterFC(raw, p), sumber: 'cadangan' };
}

async function bundle() {
  const [titik, area, jalur, sekolah, jalan] = await Promise.all(['titik', 'area', 'jalur', 'sekolah_analisis', 'jalan'].map(file));
  return { titik, area, jalur, jalan, sekolah, halte: filterFC(titik, { kategori: 'halte' }),
    garis: { type: 'FeatureCollection', features: [...jalur.features, ...jalan.features] } };
}

export async function getAnalysis(type, params = {}) {
  const viaApi = await fromApi(`/api/analysis?${qs({ type, ...params })}`);
  if (viaApi) return { data: viaApi, sumber: 'database' };
  const d = await bundle();
  const r = Number(params.radius) || 500;
  const out = {
    buffer: () => local.buffer(d.sekolah, d.halte, r),
    recommend: () => local.recommend(d.sekolah, d.halte, d.garis, r),
    nearest: () => local.nearest(d.sekolah, d.halte, Number(params.lon), Number(params.lat), r),
    overlay: () => local.overlay(d.area, d.titik),
  }[type];
  if (!out) throw new Error(`Jenis analisis tidak dikenal: ${type}`);
  return { data: out(), sumber: 'cadangan' };
}

export async function getStats() {
  const viaApi = await fromApi('/api/stats');
  if (viaApi) return { data: viaApi, sumber: 'database' };
  const d = await bundle();
  return { data: local.stats(d.titik, d.area, d.jalur, d.sekolah), sumber: 'cadangan' };
}

// ---- admin (wajib database, tanpa cadangan)
const adminHeaders = (key) => ({ 'Content-Type': 'application/json', 'x-admin-key': key });
export async function adminLogin(key) {
  const r = await getJson('/api/health', { headers: { 'x-admin-key': key } });
  if (!r.db) throw new Error('Database belum terhubung, halaman admin belum bisa dipakai.');
  if (!r.admin) throw new Error('Password admin salah');
  return true;
}
export const listTitik = () => getJson('/api/titik');
export const createTitik = (key, body) => getJson('/api/titik', { method: 'POST', headers: adminHeaders(key), body: JSON.stringify(body) });
export const updateTitik = (key, id, body) => getJson(`/api/titik?id=${encodeURIComponent(id)}`, { method: 'PUT', headers: adminHeaders(key), body: JSON.stringify(body) });
export async function deleteTitik(key, id) {
  const r = await _fetch(`/api/titik?id=${encodeURIComponent(id)}`, { method: 'DELETE', headers: adminHeaders(key) });
  if (!r.ok) { let b = null; try { b = await r.json(); } catch { /* kosong */ } throw new Error((b && b.error) || `Gagal menghapus (${r.status})`); }
  return true;
}

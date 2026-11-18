import { HttpError } from './http.js';
import { BBOX, JENJANG, KATEGORI, RADIUS } from '../../src/lib/config.js';

export const KATEGORI_LIST = Object.keys(KATEGORI);
export const JENJANG_LIST = Object.keys(JENJANG);

export function radius(v) {
  if (v === null || v === undefined || v === '') return RADIUS.default;
  const n = Number(v);
  if (!Number.isFinite(n) || n < RADIUS.apiMin || n > RADIUS.apiMax) {
    throw new HttpError(400, `Radius harus angka antara ${RADIUS.apiMin} dan ${RADIUS.apiMax} meter`);
  }
  return n;
}

export function lonLat(lon, lat) {
  const x = Number(lon), y = Number(lat);
  if (lon === null || lat === null || lon === '' || lat === '' || !Number.isFinite(x) || !Number.isFinite(y)) {
    throw new HttpError(400, 'Koordinat lon dan lat wajib diisi dengan angka');
  }
  if (y < BBOX.minLat || y > BBOX.maxLat || x < BBOX.minLon || x > BBOX.maxLon) {
    throw new HttpError(400, 'Koordinat berada di luar wilayah Kota Pekanbaru');
  }
  return [x, y];
}

export function kategoriList(v) {
  if (!v) return null;
  const list = String(v).split(',').map((s) => s.trim()).filter(Boolean);
  const bad = list.filter((k) => !KATEGORI_LIST.includes(k));
  if (bad.length) throw new HttpError(400, `Kategori tidak dikenal: ${bad.join(', ')}`);
  return list;
}

export function sumber(v) {
  if (!v) return null;
  if (!['survei', 'osm', 'admin'].includes(v)) throw new HttpError(400, `Sumber tidak dikenal: ${v}`);
  return v;
}

export function titikBody(b) {
  const nama = typeof b.nama === 'string' ? b.nama.trim() : '';
  if (!nama) throw new HttpError(400, 'Nama titik wajib diisi');
  if (nama.length > 120) throw new HttpError(400, 'Nama titik maksimal 120 karakter');
  if (!KATEGORI_LIST.includes(b.kategori)) throw new HttpError(400, `Kategori harus salah satu dari: ${KATEGORI_LIST.join(', ')}`);
  let jenjang = b.jenjang || null;
  if (b.kategori !== 'sekolah') jenjang = null;
  else if (jenjang && !JENJANG_LIST.includes(jenjang)) throw new HttpError(400, 'Jenjang sekolah tidak dikenal');
  const deskripsi = b.deskripsi ? String(b.deskripsi).trim().slice(0, 500) : null;
  const [lon, lat] = lonLat(b.lon, b.lat);
  return { nama, kategori: b.kategori, jenjang: jenjang || (b.kategori === 'sekolah' ? 'Tidak diketahui' : null), deskripsi, lon, lat };
}

export function id(v) {
  const n = Number(v);
  if (!Number.isInteger(n) || n <= 0) throw new HttpError(400, 'Parameter id tidak valid');
  return n;
}

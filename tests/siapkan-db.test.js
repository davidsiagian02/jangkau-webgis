// Penyiapan database otomatis saat build di Vercel (supaya bisa hosting tanpa laptop).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import pg from 'pg';
import { siapkanDb } from '../scripts/siapkan-db.js';

const ADMIN_URL = 'postgresql://root@/postgres?host=/var/run/postgresql';
const DB_URL = 'postgresql://root@/jangkau_siap?host=/var/run/postgresql';
let client;

before(async () => {
  const a = new pg.Client({ connectionString: ADMIN_URL });
  await a.connect();
  await a.query('DROP DATABASE IF EXISTS jangkau_siap WITH (FORCE)');
  await a.query('CREATE DATABASE jangkau_siap');
  await a.end();
});
after(async () => client && client.end());

const angka = async (sql, v = []) => Number((await client.query(sql, v)).rows[0].n);

test('database kosong: tabel dibuat lalu diisi', async () => {
  const hasil = await siapkanDb(DB_URL);
  assert.equal(hasil.aksi, 'dibuat');
  client = new pg.Client({ connectionString: DB_URL });
  await client.connect();
  assert.ok(await angka('SELECT count(*) n FROM titik') > 100);
  assert.ok(await angka('SELECT count(*) n FROM v_sekolah_analisis') > 100);
});

test('database sudah berisi: data tidak ditimpa', async () => {
  await client.query("INSERT INTO titik (nama, kategori, sumber, geom) VALUES ('Halte Tambahan Pengelola', 'halte', 'admin', ST_SetSRID(ST_MakePoint(101.45, 0.51), 4326))");
  const hasil = await siapkanDb(DB_URL);
  assert.equal(hasil.aksi, 'sudah ada');
  assert.equal(await angka("SELECT count(*) n FROM titik WHERE nama = 'Halte Tambahan Pengelola'"), 1);
});

test('nama lama dari versi sebelumnya diganti ke nama baru', async () => {
  await client.query("UPDATE titik SET nama = 'Halte (OSM)' WHERE nama = 'Halte tanpa nama'");
  await client.query("UPDATE area_sekolah SET nama = 'Sekolah (tanpa nama di OSM)' WHERE nama = 'Sekolah tanpa nama'");
  const hasil = await siapkanDb(DB_URL);
  assert.ok(hasil.namaDiganti > 0);
  assert.equal(await angka("SELECT count(*) n FROM titik WHERE nama = 'Halte (OSM)'"), 0);
  assert.equal(await angka("SELECT count(*) n FROM area_sekolah WHERE nama LIKE '%di OSM%'"), 0);
});

test('tanpa DATABASE_URL build tetap jalan (dilewati, kode keluar 0)', () => {
  const env = { ...process.env };
  for (const k of ['DATABASE_URL', 'DATABASE_URL_UNPOOLED', 'POSTGRES_URL', 'POSTGRES_URL_NON_POOLING']) delete env[k];
  const r = spawnSync(process.execPath, ['scripts/siapkan-db.js'], { env, encoding: 'utf8' });
  assert.equal(r.status, 0);
  assert.match(r.stdout, /dilewati/);
});

test('database tidak bisa dihubungi: build tetap jalan, hanya peringatan', () => {
  const env = { ...process.env, DATABASE_URL: 'postgresql://x:y@127.0.0.1:1/tidakada' };
  const r = spawnSync(process.execPath, ['scripts/siapkan-db.js'], { env, encoding: 'utf8' });
  assert.equal(r.status, 0);
  assert.match(r.stderr + r.stdout, /belum bisa disiapkan/);
});

test('Vercel menyiapkan database sebelum membangun situs', async () => {
  const { readFileSync } = await import('node:fs');
  const v = JSON.parse(readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'));
  assert.equal(v.buildCommand, 'node scripts/siapkan-db.js && vite build');
});

test('Vercel: fungsi di Singapura (dekat database Neon) dan aset statis di-cache browser', async () => {
  const { readFileSync } = await import('node:fs');
  const v = JSON.parse(readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'));
  assert.deepEqual(v.regions, ['sin1']);
  const header = (src) => Object.fromEntries((v.headers.find((h) => h.source === src)?.headers || []).map((h) => [h.key, h.value]));
  assert.equal(header('/assets/(.*)')['Cache-Control'], 'public, max-age=31536000, immutable');
  assert.match(header('/data/(.*)')['Cache-Control'] || '', /max-age=3600/);
});

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import pg from 'pg';
import { setupDb } from '../scripts/setup-db.js';

const DB_URL = process.env.TEST_DATABASE_URL || 'postgresql://root@/jangkau_test?host=/var/run/postgresql';
let client;

before(async () => {
  await setupDb(DB_URL);
  await setupDb(DB_URL); // idempoten: dijalankan dua kali
  client = new pg.Client({ connectionString: DB_URL });
  await client.connect();
});
after(async () => client && client.end());

const one = async (sql) => Number((await client.query(sql)).rows[0].n);

test('jumlah data survei sesuai file sumber', async () => {
  assert.equal(await one(`SELECT count(*) n FROM titik WHERE sumber='survei'`), 31);
  assert.equal(await one(`SELECT count(*) n FROM area_sekolah WHERE sumber='survei'`), 5);
  assert.equal(await one(`SELECT count(*) n FROM jalur`), 6);
});

test('view unit analisis sama dengan GeoJSON cadangan', async () => {
  const fc = JSON.parse(readFileSync(new URL('../public/data/sekolah_analisis.geojson', import.meta.url)));
  assert.equal(await one(`SELECT count(*) n FROM v_sekolah_analisis`), fc.features.length);
  const uids = (await client.query(`SELECT uid FROM v_sekolah_analisis ORDER BY uid`)).rows.map((r) => r.uid);
  assert.deepEqual(uids, fc.features.map((f) => f.properties.uid).sort());
});

test('view halte memuat semua titik kategori halte', async () => {
  assert.equal(await one(`SELECT count(*) n FROM v_halte`), await one(`SELECT count(*) n FROM titik WHERE kategori='halte'`));
});

test('index GIST ada di semua tabel spasial', async () => {
  const rows = (await client.query(`SELECT tablename FROM pg_indexes WHERE indexdef ILIKE '%USING gist%'`)).rows;
  const t = new Set(rows.map((r) => r.tablename));
  for (const name of ['titik', 'area_sekolah', 'jalur']) assert.ok(t.has(name), `GIST di ${name}`);
});

test('kategori referensi berisi 4 kategori titik', async () => {
  assert.equal(await one(`SELECT count(*) n FROM kategori`), 4);
});

// Membuat tabel + mengisi data ke database PostGIS.
// Pakai: DATABASE_URL=postgres://... npm run db:setup   (atau isi .env.local / .env)
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const root = new URL('..', import.meta.url);

export function loadEnv() {
  for (const f of ['.env.local', '.env', '.env.development.local']) {
    const p = new URL(f, root);
    if (!existsSync(p)) continue;
    for (const line of readFileSync(p, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  }
}

export async function setupDb(connectionString) {
  const schema = readFileSync(new URL('db/schema.sql', root), 'utf8');
  const seed = readFileSync(new URL('db/seed.sql', root), 'utf8').replace(/^(BEGIN|COMMIT);$/gm, '');
  const client = new pg.Client({ connectionString });
  await client.connect();
  try {
    await client.query('BEGIN');
    await client.query(schema);
    await client.query(seed);
    await client.query('COMMIT');
    const { rows } = await client.query(`SELECT
      (SELECT count(*) FROM titik) titik, (SELECT count(*) FROM area_sekolah) area,
      (SELECT count(*) FROM jalur) jalur, (SELECT count(*) FROM v_halte) halte,
      (SELECT count(*) FROM v_sekolah_analisis) sekolah_analisis`);
    return rows[0];
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    await client.end();
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  loadEnv();
  const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
  if (!url) {
    console.error('DATABASE_URL belum diisi. Jalankan "vercel env pull .env.local" dulu, atau isi file .env.');
    process.exit(1);
  }
  setupDb(url)
    .then((c) => console.log('Database siap:', c))
    .catch((e) => { console.error('Gagal setup database:', e.message); process.exit(1); });
}

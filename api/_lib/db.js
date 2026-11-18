import pg from 'pg';
import { HttpError } from './http.js';

let pool = null;
const CONN_ERR = /ECONNREFUSED|ENOTFOUND|ETIMEDOUT|ECONNRESET|EAI_AGAIN|timeout|terminated|Connection|password authentication|no pg_hba/i;

export function getPool() {
  const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
  if (!url) throw new HttpError(503, 'Database belum dikonfigurasi (DATABASE_URL kosong)');
  if (!pool) {
    pool = new pg.Pool({ connectionString: url, max: 1, idleTimeoutMillis: 10000, connectionTimeoutMillis: 8000 });
    pool.on('error', () => { /* koneksi idle putus: biarkan pool membuat ulang */ });
  }
  return pool;
}

export async function q(sql, values = []) {
  const p = getPool();
  try {
    return (await p.query(sql, values)).rows;
  } catch (e) {
    const code = String(e.code || '');
    if (code === '42P01') {
      throw new HttpError(503, 'Tabel database belum dibuat. Jalankan "npm run db:setup" (lihat README).');
    }
    if (code.startsWith('08') || code === '57P01' || code === '3D000' || code === '28P01' || CONN_ERR.test(e.message)) {
      throw new HttpError(503, 'Database tidak dapat dihubungi, coba beberapa saat lagi');
    }
    throw e;
  }
}

export async function _resetPool() {
  if (pool) { const p = pool; pool = null; await p.end().catch(() => {}); }
}

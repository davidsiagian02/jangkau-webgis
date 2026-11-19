// Dijalankan otomatis sebelum "vite build" di Vercel.
// - Database kosong       → tabel dibuat dan diisi dari db/schema.sql + db/seed.sql.
// - Database sudah berisi → tidak ditimpa (titik tambahan pengelola tetap aman),
//                           hanya nama lama dari versi sebelumnya yang dirapikan.
// - Isi RESET_DB=1 di Vercel kalau ingin mengisi ulang dari awal.
// Build TIDAK PERNAH gagal karena skrip ini: kalau database belum ada atau error,
// situs tetap terbit dan memakai data salinan.
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { setupDb } from './setup-db.js';

const NAMA_LAMA = [
  ['titik', 'Halte (OSM)', 'Halte tanpa nama'],
  ['titik', 'Sekolah (tanpa nama di OSM)', 'Sekolah tanpa nama'],
  ['area_sekolah', 'Sekolah (tanpa nama di OSM)', 'Sekolah tanpa nama'],
];

export async function siapkanDb(connectionString, { reset = false } = {}) {
  const client = new pg.Client({ connectionString, connectionTimeoutMillis: 10000 });
  await client.connect();
  let ada;
  try {
    ada = (await client.query("SELECT to_regclass('public.titik') IS NOT NULL AS ada")).rows[0].ada;
    if (ada && !reset) {
      let namaDiganti = 0;
      for (const [tabel, lama, baru] of NAMA_LAMA) {
        namaDiganti += (await client.query(`UPDATE ${tabel} SET nama = $2 WHERE nama = $1`, [lama, baru])).rowCount;
      }
      return { aksi: 'sudah ada', namaDiganti };
    }
  } finally {
    await client.end();
  }
  const jumlah = await setupDb(connectionString);
  return { aksi: 'dibuat', jumlah };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  // Neon menyediakan alamat langsung (tanpa pooler) yang lebih cocok untuk membuat tabel.
  const url = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL || process.env.POSTGRES_URL_NON_POOLING || process.env.POSTGRES_URL;
  if (!url) {
    console.log('[database] DATABASE_URL kosong, penyiapan database dilewati. Situs memakai data salinan.');
  } else {
    try {
      const h = await siapkanDb(url, { reset: process.env.RESET_DB === '1' });
      if (h.aksi === 'dibuat') console.log('[database] Tabel dibuat dan diisi:', h.jumlah);
      else console.log(`[database] Sudah berisi, tidak ditimpa. Nama lama dirapikan: ${h.namaDiganti}.`);
    } catch (e) {
      console.warn(`[database] Database belum bisa disiapkan (${e.message}). Situs tetap terbit dengan data salinan.`);
    }
  }
}

# Jangkau — WebGIS akses halte ke sekolah di Kota Pekanbaru

Project akhir mata kuliah Sistem Informasi Geografis (Politeknik Caltex Riau, 2026).
Web ini menghitung jarak jalan kaki dari setiap sekolah ke halte bus terdekat, menandai sekolah yang belum
terjangkau, lalu mengusulkan lokasi halte baru.

- Peta: **OpenLayers 10** (basemap CARTO, OpenStreetMap, dan foto satelit Esri)
- Database: **PostgreSQL + PostGIS** di **Neon** (terhubung lewat Vercel)
- Backend: **Vercel Functions** di folder `api/`
- Frontend: **Vite** + JavaScript biasa, analisis cadangan dengan **Turf.js**

## Isi folder

| Folder / file | Isi |
|---|---|
| `index.html`, `peta.html`, `data.html`, `admin.html` | 4 halaman web |
| `src/pages/` | script tiap halaman |
| `src/lib/` | klien API, analisis cadangan (Turf), gaya peta, konstanta |
| `src/styles/` | CSS |
| `api/` | endpoint: `layers`, `analysis`, `stats`, `titik` (CRUD admin), `health` |
| `api/_lib/sql.js` | semua query PostGIS (buffer, DBSCAN, jarak, overlay) |
| `db/schema.sql` | struktur tabel + view |
| `db/seed.sql` | isi data (dibuat otomatis, jangan diedit manual) |
| `data/source/` | file asli: survei Avenza (xls, kml) dan export OpenStreetMap |
| `public/data/*.geojson` | salinan data untuk mode cadangan |
| `scripts/build_data.py` | mengubah `data/source` menjadi `db/seed.sql` + GeoJSON |
| `scripts/setup-db.js` | membuat tabel dan mengisi data ke database |
| `scripts/siapkan-db.js` | dijalankan Vercel sebelum build: mengisi database kalau masih kosong |
| `tests/` | tes otomatis (node:test, pytest, Playwright) |

## Deploy ke Vercel (langkah lengkap)

Semua langkah setelah langkah 1 bisa dikerjakan dari browser HP. Kunci peta CARTO sudah tertanam di kode,
dan database diisi otomatis saat Vercel membangun situs, jadi tidak perlu terminal maupun SQL Editor.

1. **Kode di GitHub.** Repository harus berisi isi folder ini (bukan file zip-nya). Dari laptop:
   ```bash
   git init && git add -A && git commit -m "WebGIS Jangkau"
   git branch -M main
   git remote add origin https://github.com/USERNAME/jangkau-webgis.git
   git push -u origin main
   ```
2. **Import ke Vercel.** Buka vercel.com → *Add New… → Project* → pilih repository tadi → **Deploy**.
   Pengaturan build sudah ada di `vercel.json`, jadi tidak ada yang perlu diubah. Situs langsung bisa dibuka
   dengan label **Data salinan** karena database belum ada.
3. **Buat database.** Halaman project Vercel → tab **Storage** → *Create Database* → **Neon**
   → region Singapore → *Create* → *Connect* ke project ini. `DATABASE_URL` terisi otomatis.
4. **Kata sandi pengelola.** *Settings → Environment Variables* → tambah `ADMIN_PASSWORD`
   (isi bebas, jangan dibagikan), centang Production, Preview, dan Development → *Save*.
5. **Redeploy.** Tab *Deployments* → titik tiga di deployment teratas → *Redeploy*. Saat build, skrip
   `scripts/siapkan-db.js` membuat tabel dan mengisi data kalau database masih kosong. Di log build akan
   muncul `[database] Tabel dibuat dan diisi`. Kalau database sudah berisi, datanya tidak ditimpa.
6. **Cek.** Buka `https://NAMA-PROJECT.vercel.app/api/health`. Hasil yang benar: `"db":true`.
   Di halaman Peta, labelnya berubah jadi **Data terkini**. Halaman pengelola ada di `/admin.html`
   (tautan "Masuk pengelola" di bagian bawah halaman).

Catatan:
- **Mengisi ulang database dari awal** (misalnya setelah data sumber diperbarui): tambah environment variable
  `RESET_DB` bernilai `1`, Redeploy, lalu hapus lagi variabel itu. Titik tambahan pengelola ikut terhapus.
- **Kunci peta CARTO** tertanam di `src/lib/map.js`. Kunci peta memang selalu terlihat di browser, jadi
  batasi pemakaiannya ke domain situs (misalnya `*.vercel.app`) di pengaturan kunci di CARTO. Untuk memakai
  kunci lain, isi environment variable `VITE_CARTO_KEY`.
- Dari laptop, database juga bisa diisi manual: `vercel env pull .env.local` lalu `npm run db:setup`.
- **Kecepatan.** Fungsi API dijalankan di region Singapura (`"regions": ["sin1"]` di `vercel.json`), jadi pilih juga
  region Singapore saat membuat database Neon agar jarak server ke database dekat. Data publik (`/api/layers`,
  `/api/analysis`, `/api/stats`) disimpan 60 detik di CDN Vercel, sehingga titik yang baru ditambah pengelola muncul
  di peta paling lambat sekitar 1 menit. File di `/assets` disimpan permanen di browser karena namanya selalu berubah
  setiap build.

## Menjalankan di laptop

```bash
npm install
npm run dev          # http://localhost:5173 — tanpa database otomatis memakai data cadangan
```

Dengan database (butuh `.env.local` berisi `DATABASE_URL` dan `ADMIN_PASSWORD`, contoh di `.env.example`):

```bash
npm run db:setup     # sekali saja, atau setiap data berubah
npm run dev:api      # terminal 1: API lokal di http://localhost:3001
npm run dev          # terminal 2: web, /api diteruskan ke API lokal
```

## Menambah atau memperbarui data

1. Simpan file baru di `data/source/`:
   - halte OpenStreetMap → `halte_osm.kml` atau `halte_osm.geojson` (export Overpass Turbo).
     Stasiun bus khusus perusahaan, SPBU, dan agen travel otomatis dibuang; halte berjarak ≤ 30 m digabung.
   - jalan OpenStreetMap → `jalan_osm.kml` (dipakai sebagai layer dan tempat menempelkan usulan halte)
   - sekolah OSM tambahan → `osm_sekolah_poligon_*.kml` atau `osm_sekolah_titik_*.kml`
2. `pip install pandas xlrd lxml shapely pyproj numpy` (sekali saja), lalu `npm run data:build`
3. `npm run db:setup`, lalu commit dan push agar data cadangan ikut terbaru.

Titik satuan (misalnya halte baru hasil survei) cukup ditambahkan lewat halaman **Admin**.

Query Overpass untuk halte se-Kota Pekanbaru:

```
[out:json][timeout:60];
(
  node["highway"="bus_stop"](0.40,101.33,0.62,101.55);
  node["public_transport"="platform"](0.40,101.33,0.62,101.55);
  node["amenity"="bus_station"](0.40,101.33,0.62,101.55);
);
out body;
```

## Mode cadangan

Kalau database tidak bisa dihubungi, semua halaman (kecuali Admin) otomatis memakai `public/data/*.geojson`
dan menjalankan analisis yang sama di browser. Label di peta berubah menjadi **Data salinan**.
Untuk mendemokan mode ini saat presentasi, buka `/peta.html?cadangan=1`.

## Tes

```bash
npm test                          # API, database, analisis cadangan (butuh PostGIS lokal)
python3 -m pytest tests -q        # pipeline data + UI end-to-end (Playwright)
```

## Atribusi data

Data sekolah dan halte tambahan © kontributor OpenStreetMap, lisensi ODbL
(https://www.openstreetmap.org/copyright). Data survei diambil sendiri pada 30 September 2026 dengan Avenza Maps.

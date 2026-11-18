# Jangkau — WebGIS akses halte ke sekolah di Kota Pekanbaru

Project akhir mata kuliah Sistem Informasi Geografis (Politeknik Caltex Riau, 2026).
Web ini menghitung jarak jalan kaki dari setiap sekolah ke halte bus terdekat, menandai sekolah yang belum
terjangkau, lalu mengusulkan lokasi halte baru.

- Peta: **OpenLayers 10** (basemap OpenStreetMap, citra Esri, dan CARTO jika `VITE_CARTO_KEY` diisi)
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
| `tests/` | tes otomatis (node:test, pytest, Playwright) |

## Deploy ke Vercel (langkah lengkap)

1. **Upload ke GitHub.** Buat repository baru, lalu dari folder project jalankan:
   ```bash
   git init && git add -A && git commit -m "WebGIS Jangkau"
   git branch -M main
   git remote add origin https://github.com/USERNAME/jangkau-webgis.git
   git push -u origin main
   ```
2. **Import ke Vercel.** Buka vercel.com → *Add New… → Project* → pilih repository tadi.
   Framework otomatis terbaca **Vite**. Klik **Deploy**. Web sudah bisa dibuka, tapi masih memakai
   *data cadangan* (badge kuning di peta) karena database belum dibuat.
3. **Buat database.** Di halaman project Vercel → tab **Storage** → *Create Database* → pilih **Neon**
   (Serverless Postgres) → region Singapore → *Create* → *Connect* ke project ini.
   Vercel otomatis menambahkan environment variable `DATABASE_URL`.
4. **Isi database.** Pilih salah satu:
   - **Lewat laptop (disarankan):**
     ```bash
     npm install
     npm i -g vercel
     vercel link            # pilih project yang tadi
     vercel env pull .env.local
     npm run db:setup
     ```
     Kalau berhasil muncul `Database siap: { titik: …, area: …, … }`.
   - **Tanpa CLI:** buka database di dashboard Neon → *SQL Editor* → tempel isi `db/schema.sql` → *Run*,
     lalu tempel isi `db/seed.sql` → *Run*.
5. **(Opsional) Basemap CARTO.** CARTO sekarang wajib memakai API key. Minta key gratis di
   https://carto.com/basemaps/apikey, lalu tambahkan environment variable `VITE_CARTO_KEY`. Tanpa key,
   pilihan CARTO disembunyikan dan peta memakai OpenStreetMap.
6. **Password admin.** Vercel → *Settings → Environment Variables* → tambah `ADMIN_PASSWORD`
   (isi bebas, jangan dibagikan) untuk Production, Preview, dan Development.
7. **Redeploy.** Tab *Deployments* → titik tiga di deployment terbaru → *Redeploy*.
8. **Cek.** Buka `https://NAMA-PROJECT.vercel.app/api/health`. Hasil yang benar:
   `{"ok":true,"db":true,"admin":false}`. Di halaman Peta, badge berubah jadi **Database PostGIS**.

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
dan menjalankan analisis yang sama di browser. Badge di peta berubah menjadi **Data cadangan (GeoJSON)**.
Untuk mendemokan mode ini saat presentasi, buka `/peta.html?cadangan=1`.

## Tes

```bash
npm test                          # API, database, analisis cadangan (butuh PostGIS lokal)
python3 -m pytest tests -q        # pipeline data + UI end-to-end (Playwright)
```

## Atribusi data

Data sekolah dan halte tambahan © kontributor OpenStreetMap, lisensi ODbL
(https://www.openstreetmap.org/copyright). Data survei diambil sendiri pada 30 September 2026 dengan Avenza Maps.

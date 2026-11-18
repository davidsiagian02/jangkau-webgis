# JANGKAU WebGIS Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** WebGIS akses halte ke sekolah se-Kota Pekanbaru (OpenLayers + PostGIS di Neon, deploy Vercel) beserta laporan akhir BAB 1–4.

**Architecture:** Vite multi-page (vanilla JS + `ol`) melayani 4 halaman statis. Vercel Functions di `/api` memakai `pg` ke PostGIS. Semua analisis berjalan di SQL, dan ada versi Turf di browser (`src/lib/local.js`) dengan bentuk output yang sama untuk dipakai saat API gagal. Data sumber diubah oleh satu skrip Python menjadi `db/seed.sql` dan `public/data/*.geojson`, keduanya dari hasil pembersihan yang sama.

**Tech Stack:** Node 22, Vite 6, ol 10, @turf/turf 7, pg 8, Python 3 (lxml, pandas, xlrd, shapely, pyproj), PostgreSQL 16 + PostGIS 3, node:test, pytest, Playwright (verifikasi UI), docx + LibreOffice (laporan).

**Spec:** `docs/design.md` (revisi 2)

## Global Constraints
- OpenLayers sebagai peta; atribusi "© OpenStreetMap contributors (ODbL)" tampil di peta dan beranda.
- Beranda tidak menampilkan peta data.
- SRID simpan 4326; jarak = `geography` (meter); klaster = EPSG:32647.
- Radius analisis: default 500, preset 300/500, slider 100–1000 m (API menolak di luar 50–3000 dengan 400).
- Kecepatan: jalan kaki 5 km/jam, sepeda 15 km/jam.
- Rekomendasi: DBSCAN eps = radius, minpoints = 2; snap ke jalur bila ≤ 150 m; tampilkan 10 teratas.
- Dedup sekolah survei vs OSM: survei dibuang dari unit analisis bila ≤ 75 m dari poligon OSM.
- Halte digabung bila ≤ 30 m.
- Paling banyak 5 Vercel function: `layers`, `analysis`, `stats`, `titik`, `health`.
- Admin: header `x-admin-key` harus sama dengan env `ADMIN_PASSWORD`; env `DATABASE_URL` dari Neon.
- Kategori titik: `sekolah|halte|fasilitas|literasi`.
- Jenjang: `TK/PAUD|SD/MI|SMP/MTs|SMA/SMK/MA|Campuran|Pesantren/Diniyah|SLB|Tidak diketahui`.
- Bahasa UI: Indonesia. Tanpa Tailwind. Tampilan jangan mirip FloodGuard.

## Review Focus
1. Database tidak tersedia (`DATABASE_URL` kosong/salah, Neon tidur) → API membalas 503 JSON `{error}`. Frontend otomatis memakai GeoJSON + Turf dan badge menampilkan "Data cadangan". (Task 3, Task 4)
2. Parameter query rusak (`radius=abc`, `lon=999`, `type` tak dikenal) → 400 dengan pesan Indonesia, bukan 500. (Task 3)
3. Password admin salah/kosong → 401 dan data tidak berubah. (Task 3)
4. Input admin tidak valid (nama kosong, kategori di luar daftar, koordinat di luar bbox Pekanbaru 0.30–0.70 / 101.20–101.70) → 400. (Task 3)
5. Nama dari OSM/admin yang berisi HTML (`<b>`, `<script>`) ditampilkan sebagai teks di popup dan tabel. (Task 4: `escapeHtml`)

---

### Task 1: Pipeline data (sumber → GeoJSON + seed SQL)

**Files:**
- Create: `data/source/` (salinan file survei + `export.kml`; opsional `halte_osm.kml|.geojson`)
- Create: `scripts/build-data.py`
- Create: `public/data/titik.geojson`, `area.geojson`, `jalur.geojson`, `sekolah_analisis.geojson` (generated)
- Create: `db/seed.sql` (generated)
- Test: `tests/test_build_data.py`

**Interfaces:**
- Produces: `classify_titik(title:str) -> (kategori, jenjang|None)`, `jenjang_osm(name:str|None, grades:str|None) -> str`, `clean_osm(features) -> list`, `build(src_dir, out_dir, seed_path) -> dict counts`.
- Bentuk properti GeoJSON:
  - titik: `id, nama, kategori, jenjang, deskripsi, sumber, osm_id, waktu_survei`
  - area: `id, nama, sumber, osm_id, jenjang, luas_m2`
  - jalur: `id, nama, jenis, waktu_mulai, waktu_selesai, panjang_m`
  - sekolah_analisis: `uid ('osm-<n>'|'svy-<n>'), nama, jenjang, sumber`
  - ID ditetapkan oleh skrip dan dipakai sama di seed.sql.

- [ ] Step 1: Tulis `tests/test_build_data.py`:
  - `test_counts`: titik survei 31; kategori `{sekolah:12, halte:4, fasilitas:11, literasi:4}`; area survei 5; jalur 6 (3 `rute`, 3 `jalur`)
  - `test_osm_cleaning`:
    - tidak ada nama OSM yang cocok `^(VII|VIII|IX|X|XI|XII)\b|^R\. ?BK|Lapangan Upacara|Bimbingan Konseling|STIE|Kursus`
    - "SMKN 2 Pekanbaru" muncul tepat 1× (MultiPolygon)
    - jumlah area OSM antara 150 dan 200
  - `test_jenjang`:
    - SDN 114 → SD/MI; MIN 1 Pekanbaru → SD/MI
    - MTsN 1 Kota Pekanbaru → SMP/MTs
    - SMA Negeri 3 Pekanbaru → SMA/SMK/MA; MAN 2 Kota Pekanbaru → SMA/SMK/MA
    - TK, SMP, SMA Budhi Luhur → Campuran
    - Pondok Pesantren Babussalam → Pesantren/Diniyah; MDTA Al-Furqon → Pesantren/Diniyah
    - SLB Cendana Pekanbaru → SLB
    - Paud YLPI → TK/PAUD
    - None → Tidak diketahui
  - `test_dedup`: unit analisis tidak memuat titik survei "Smpn 14" (berada di dalam poligon OSM SMP Negeri 14) tetapi memuat "Sd 149" bila ia > 75 m dari semua poligon OSM. Asersi dihitung dari data.
  - `test_halte_optional`: tanpa file halte OSM, jumlah halte = 4
  - `test_seed_sql`: seed memuat `INSERT INTO titik`, `INSERT INTO area_sekolah`, `INSERT INTO jalur`, dan kutip tunggal di nama di-escape (`''`)
- [ ] Step 2: `python3 -m pytest tests/test_build_data.py -q` → FAIL (modul belum ada).
- [ ] Step 3: Implementasi `scripts/build-data.py`:
  - track (`gx:coord`) dibaca sebagai LineString; ambil timestamp pertama/terakhir
  - poligon OSM yang ≥ 80% luasnya di dalam poligon sekolah lain dibuang
  - merge per nama (≤ 300 m)
  - halte OSM: titik dari KML/GeoJSON, nama kosong → "Halte (OSM)", lalu cluster 30 m
  - SQL memakai `ST_GeomFromText('…',4326)`
  - CLI: `python3 scripts/build-data.py data/source public/data db/seed.sql`
- [ ] Step 4: pytest → PASS.
- [ ] Step 5: Commit `feat(data): pipeline survei+OSM ke geojson dan seed sql`.

### Task 2: Skema PostGIS + setup DB

**Files:**
- Create: `db/schema.sql`, `scripts/setup-db.js`, `package.json`, `.env.example`
- Test: `tests/db.test.js`

**Interfaces:**
- Produces:
  - tabel `titik`, `area_sekolah`, `jalur`, `kategori` (kolom sesuai spec §5)
  - view `v_halte(id, nama, sumber, geom)`
  - view `v_sekolah_analisis(uid, nama, jenjang, sumber, geom Point)` (aturan dedup 75 m)
  - `npm run db:setup` = jalankan schema lalu seed dalam satu transaksi (idempoten: `DROP … IF EXISTS` lebih dulu)

- [ ] Step 1: `tests/db.test.js` (node:test, `DATABASE_URL=postgres:///jangkau_test`):
  - setelah setup: `count(titik where sumber='survei')=31`, `area_sekolah where sumber='survei'=5`, `jalur=6`
  - `count(v_sekolah_analisis)` = jumlah fitur `public/data/sekolah_analisis.geojson`
  - GIST index ada di ketiga tabel
  - setup dijalankan 2× tetap menghasilkan count yang sama
- [ ] Step 2: jalankan → FAIL.
- [ ] Step 3: Tulis `db/schema.sql` + `scripts/setup-db.js` (pakai `pg`, SSL otomatis bila host bukan localhost).
- [ ] Step 4: `createdb jangkau_test && npm run db:setup && node --test tests/db.test.js` → PASS.
- [ ] Step 5: Commit `feat(db): skema postgis, view analisis, setup script`.

### Task 3: API serverless

**Files:**
- Create: `api/_lib/db.js`, `api/_lib/http.js`, `api/_lib/sql.js`
- Create: `api/layers.js`, `api/analysis.js`, `api/stats.js`, `api/titik.js`, `api/health.js`
- Create: `scripts/api-dev.js` (server lokal :3001 yang me-mount handler), `vercel.json`
- Test: `tests/api.test.js`

**Interfaces:**
- Consumes: skema Task 2.
- Produces (dipakai Task 4 dan juga oleh `local.js`, bentuknya identik):
  - `GET /api/layers?layer=titik|area|jalur|sekolah|halte[&kategori=a,b][&sumber=survei|osm]` → FeatureCollection
  - `GET /api/analysis?type=buffer&radius=r` →
    `{radius, buffer: FC, sekolah: FC<{uid,nama,jenjang,sumber,jarak_halte_m,halte_terdekat,terlayani}>, ringkasan:{total,terlayani,persen,per_jenjang:{[j]:{total,terlayani}}}}`
  - `type=recommend&radius=r` → `{radius, kandidat: FC<{rank,jumlah_sekolah,sekolah:string[],snap:boolean,jarak_rata_m}>, terisolasi:number}`
  - `type=nearest&lon&lat&radius` → `{titik:[lon,lat], halte:{nama,jarak_m,waktu_menit}|null, sekolah:[{nama,jenjang,jarak_m}]}`
  - `type=overlay` → `{banding:[{nama_survei,nama_osm,luas_survei_m2,luas_osm_m2,luas_irisan_m2,iou}], fasilitas_dalam_area:[{area,jumlah,daftar:string[]}]}`
  - `GET /api/stats` → `{jumlah:{titik_survei,sekolah_osm,halte,jalur,area_survei,sekolah_analisis}, per_kategori, per_jenjang, jalur:[{nama,jenis,panjang_m,jalan_menit,sepeda_menit}]}`
  - `GET /api/titik` → FC; `POST` `{nama,kategori,jenjang?,deskripsi?,lon,lat}` → 201 Feature; `PUT ?id=` → 200; `DELETE ?id=` → 204
  - `GET /api/health` → `{ok, db:boolean}`
  - semua error berbentuk `{error:"<pesan Indonesia>"}`

- [ ] Step 1: `tests/api.test.js` memanggil handler langsung dengan req/res tiruan:
  - layers titik → 31 fitur survei
  - buffer r=500:
    - `ringkasan.total` = count view
    - sekolah survei "Sd 149" (jika ada di unit) punya `jarak_halte_m` cocok ±5 m dengan perhitungan Turf
    - parity: himpunan uid terlayani dari API == dari `local.buffer` atas GeoJSON yang sama
  - recommend r=500: kandidat terurut menurun menurut `jumlah_sekolah`, maksimal 10
  - nearest pada koordinat Halte Smpn 14 → `halte.jarak_m < 1`
  - overlay → 5 baris, IoU SMP 10 ∈ [0.80, 0.90]
  - stats → jalur 6 baris, `jalan_menit = round(panjang_m/83.33)`
  - Review Focus 1: tanpa `DATABASE_URL` → 503
  - Review Focus 2: `radius=abc` → 400; `radius=5000` → 400; `lon=999` → 400; `type=xyz` → 400
  - Review Focus 3: POST tanpa / dengan key salah → 401, count tidak berubah
  - Review Focus 4: nama kosong → 400; kategori 'warung' → 400; lat 2.0 → 400
  - CRUD: POST/PUT/DELETE berhasil dengan key benar
- [ ] Step 2: jalankan → FAIL.
- [ ] Step 3: Implementasi. SQL diparameterisasi (`$1`). Pool `max:1`, idle 10 s. `Cache-Control: s-maxage=60` untuk GET non-admin.
- [ ] Step 4: `node --test tests/api.test.js` → PASS.
- [ ] Step 5: Commit `feat(api): layers, analysis, stats, titik crud, health`.

### Task 4: Lapisan data frontend + analisis cadangan

**Files:**
- Create: `src/lib/config.js` (warna/ikon kategori & jenjang, konstanta Global Constraints)
- Create: `src/lib/api.js`, `src/lib/local.js`, `src/lib/util.js` (`escapeHtml`, `fmtMeter`, `fmtMenit`)
- Test: `tests/local.test.js`, `tests/apiclient.test.js`

**Interfaces:**
- Produces:
  - `getLayer(name, params) -> Promise<{data:FC, sumber:'database'|'cadangan'}>`
  - `getAnalysis(type, params)`, `getStats()` dengan bentuk sama
  - `local.buffer(sekolahFC, halteFC, r)`, `local.recommend(sekolahFC, halteFC, jalurFC, r)`, `local.nearest(sekolahFC, halteFC, lon, lat, r)`, `local.overlay(areaFC, titikFC)`, `local.stats(...)` dengan output persis seperti Task 3
  - CRUD client: `adminLogin(key)`, `createTitik`, `updateTitik`, `deleteTitik`

- [ ] Step 1: Tes dengan fixture sintetis kecil:
  - buffer: sekolah tepat di halte → terlayani, jarak 0; sekolah 800 m → tidak terlayani
  - recommend: dua sekolah tak terlayani berjarak 200 m → 1 kandidat dengan `jumlah_sekolah: 2`; tidak ada sekolah tak terlayani → `kandidat.features` kosong, `terisolasi 0`
  - nearest: urutan jarak menaik
  - `escapeHtml('<script>x</script>')` tidak mengandung `<`
  - `getLayer` dengan `fetch` mock 503 → `sumber:'cadangan'` dan memuat `/data/titik.geojson`
- [ ] Step 2: `node --test tests/local.test.js tests/apiclient.test.js` → FAIL.
- [ ] Step 3: Implementasi (Turf: `buffer`, `union`, `distance`, `clustersDbscan`, `nearestPointOnLine`, `centroid`, `intersect`, `area`).
- [ ] Step 4: → PASS.
- [ ] Step 5: Commit `feat(frontend): api client, fallback turf, util`.

### Task 5: Halaman UI (Beranda, Peta, Data, Admin)

**Files:**
- Create: `index.html`, `peta.html`, `data.html`, `admin.html`, `vite.config.js` (multi-page + proxy `/api` → :3001)
- Create: `src/styles/*.css`, `src/pages/home.js`, `peta.js`, `data.js`, `admin.js`, `src/lib/map.js` (basemap OSM/Carto Positron/Esri Imagery, gaya layer, popup)
- Test: `tests/ui.spec.py` (Playwright: vite preview + api-dev + DB lokal)

**Interfaces:** Consumes Task 4 saja (halaman tidak memanggil fetch langsung).

- [ ] Step 1: `tests/ui.spec.py`:
  - beranda tidak memuat elemen `.ol-viewport`
  - peta: ≥ 5 checkbox layer; mematikan "Halte" membuat layer halte `getVisible()===false`
  - jalankan buffer 500 → tabel hasil berisi ≥ 1 baris dan badge "Database PostGIS"
  - API dimatikan → badge "Data cadangan" dan layer tetap tampil
  - data: tabel terisi
  - admin: password salah → pesan error; benar → tambah titik muncul di tabel lalu hapus
  - tidak ada console error selain gagal memuat tile
- [ ] Step 2: jalankan → FAIL.
- [ ] Step 3: Implementasi UI. Arah visual memakai skill frontend-design. Tiap halaman punya nav yang sama dan footer atribusi.
- [ ] Step 4: → PASS. Simpan screenshot ke `docs/screenshots/*.png` untuk laporan.
- [ ] Step 5: Commit `feat(ui): beranda, peta, data, admin`.

### Task 6: README deploy + paket kirim

**Files:** `README.md`, `.gitignore`, zip `jangkau-webgis.zip` (tanpa node_modules)
- [ ] Step 1: README (Bahasa Indonesia): langkah GitHub → Vercel → Storage Neon → `vercel env pull` → `npm run db:setup` → `ADMIN_PASSWORD` → redeploy, cara menambah data halte OSM baru (`build-data.py` lalu `db:setup`), dan troubleshooting.
- [ ] Step 2: Verifikasi: dari salinan bersih jalankan `npm ci && npm run build` → sukses; `npm test` → semua PASS.
- [ ] Step 3: Commit `docs: readme deploy`.

### Task 7: Laporan akhir (BAB 1–4)

**Files:** `laporan/build_laporan.js` (docx), `laporan/Laporan_Akhir_SIG_JANGKAU.docx`, `.pdf`
- [ ] Step 1: Kumpulkan referensi nyata (WebSearch): SIG/WebGIS, OpenLayers, PostGIS, buffer, DBSCAN, standar jarak jalan kaki ke halte, dan Trans Metro Pekanbaru.
- [ ] Step 2: Susun isi:
  - BAB 1–3: latar, rumusan, batasan (termasuk kelengkapan OSM), tujuan/manfaat, teori, data survei, arsitektur, ERD, flowchart analisis, rancangan UI
  - BAB 4: screenshot + analisa singkat tiap gambar, tabel hasil buffer per jenjang, rekomendasi halte, overlay survei vs OSM, pengujian black-box (tabel dari Review Focus)
  - Identitas: Fire. Nama dosen dan anggota memakai placeholder bila belum dijawab.
- [ ] Step 3: Build DOCX → PDF dengan LibreOffice. Render beberapa halaman ke PNG dan cek visual (margin, caption, daftar isi).
- [ ] Step 4: Kirim PDF + DOCX + zip project.

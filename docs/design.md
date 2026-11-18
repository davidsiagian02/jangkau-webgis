# Desain — WebGIS "JANGKAU": Akses Transportasi Umum ke Sekolah di Kota Pekanbaru

Tanggal: 2026-11-18 (revisi 2) · Pemilik: Fire (David Geraldo Joshua Siagian, 3 TI A PCR) · Mata kuliah: SIG

## 1. Maksud dan alasan
Project akhir SIG berupa WebGIS dari data survei lapangan 30 Sep 2026 (Avenza Maps), dilengkapi data OpenStreetMap.
Konsepnya mirip referensi gis-project-web.vercel.app (FloodGuard), tapi tampilannya berbeda dan datanya dikelola di database.
Pertanyaan keputusan (dipilih Fire, opsi A): **sekolah mana di Kota Pekanbaru yang belum terjangkau halte transportasi umum
dengan berjalan kaki, dan di mana halte baru sebaiknya ditambahkan?** Cakupannya **seluruh kota** (dipilih Fire).
Wilayah survei dipakai sebagai area detail dan bahan validasi.
Dinilai dari 9 ketentuan dosen, dipresentasikan 9 dan 16 Desember 2026, laporan sampai BAB 4.

## 2. Goals / non-goals / anti-goals
Goals:
1. Basemap OpenLayers (OSM + 1–2 basemap alternatif).
2. Filter layer dengan checkbox per kategori, jenjang, sumber data (survei/OSM), dan hasil analisis.
3. Beranda berisi profil web, tanpa peta data.
4. Visualisasi: warna per jenjang, ikon per kategori, ukuran titik sesuai hasil analisis, gaya garis per jenis, warna status layanan.
5. Layer: titik survei, area sekolah survei, jalur survei, area sekolah OSM, halte (survei + OSM), dan layer analisis.
6. Analisis spasial untuk keputusan: buffer halte, spatial query, rekomendasi halte baru, density (heatmap),
   overlay survei vs OSM, serta panjang dan waktu tempuh jalur.
7. Data dikelola di PostgreSQL + PostGIS (Neon via Vercel), dengan halaman admin CRUD.
8. Tetap berjalan walaupun database bermasalah (cadangan GeoJSON statis).
9. Laporan akhir BAB 1–4 dengan hasil implementasi dan pembahasan.

Non-goals: routing jalan raya penuh, login multi-user, aplikasi mobile, editing poligon/garis lewat UI.
Anti-goals: tampilan mirip FloodGuard; peta di beranda; demo mati saat presentasi; laporan yang terasa buatan AI;
hasil analisis yang menyesatkan karena data halte kurang (karena itu halte OSM ikut dipakai dan batasannya ditulis).

## 3. Data
Survei (Avenza, 30 Sep 2026):
- `PointAksesPendidikan.xls`: 31 titik. Kategori (keputusan saya, dari nama titik):
  - sekolah (12): SD/MI 3, SMP/MTs 6, SMA/SMK 3
  - halte (4)
  - fasilitas pendukung (11)
  - literasi (4)
- `Area_sekolah.kml`: 5 poligon area sekolah.
- `Route_SMAN_Olahraga.kml`: 3 track → jenis "rute". `Polyline_jalur.kml` (= `polyline.xml`): 3 garis → jenis "jalur".

OpenStreetMap (ODbL, atribusi wajib dicantumkan):
- `export.kml` (Overpass, 18 Nov 2026): 211 poligon amenity=school di seluruh kota. Pembersihan otomatis saat seed (keputusan saya):
  - buang poligon ruang/bagian sekolah: nama berpola kelas (VII/VIII/IX …), R. BK, Lapangan Upacara, Bimbingan Konseling,
    serta poligon yang ≥ 80% berada di dalam poligon sekolah lain
  - buang yang bukan sekolah: STIE, Kursus
  - gabungkan poligon bernama sama yang berjarak ≤ 300 m (contoh: SMKN 2 yang terpecah 8 bagian) menjadi MultiPolygon
  - tanpa nama → "Sekolah (tanpa nama di OSM)"
  - jenjang dibaca dari nama/`grades`: TK/PAUD, SD/MI, SMP/MTs, SMA/SMK/MA, Campuran, Pesantren/Diniyah, SLB, Tidak diketahui
- **Halte OSM: menunggu file dari Fire** (export Overpass highway=bus_stop / public_transport=platform / amenity=bus_station).
  Titik yang berjarak ≤ 30 m dari titik lain digabung agar halte dua sisi jalan tidak dihitung ganda.

Unit analisis "sekolah":
- poligon sekolah OSM yang sudah dibersihkan (posisinya diambil dengan `ST_PointOnSurface`)
- ditambah titik sekolah survei yang tidak berada dalam jarak 75 m dari poligon OSM mana pun, supaya tidak dobel

Halte untuk analisis: halte survei + halte OSM.

## 4. Approaches (dipilih Fire: 1)
1. **Vercel + Neon PostgreSQL/PostGIS** — DIPILIH. Database dibuat lewat menu Storage di Vercel, analisis berjalan di PostGIS.
2. Supabase PostGIS — setara, tapi project gratis di-pause setelah 7 hari tidak aktif.
3. Firebase Firestore — tidak punya query spasial.

## 5. Arsitektur (keputusan saya)
- Frontend: Vite multi-page + JavaScript biasa + `ol` (OpenLayers 10) + `@turf/turf` (cadangan analisis). CSS buatan sendiri.
- Backend: Vercel Functions `/api` (Node, `pg`), paling banyak 5 function:
  - `GET /api/layers?layer=titik|area|jalur|sekolah_osm|halte[&kategori=..&jenjang=..]` → GeoJSON
  - `GET /api/analysis?type=buffer|recommend|nearest|overlay&radius=..[&lon&lat]`
  - `GET /api/stats`
  - `GET|POST|PUT|DELETE /api/titik` (tulis-ubah-hapus wajib header `x-admin-key` = env `ADMIN_PASSWORD`)
- Database (PostGIS, SRID 4326, jarak memakai `geography`, klaster memakai UTM 47N/EPSG:32647), index GIST di semua geom:
  - `titik(id, nama, kategori, jenjang, deskripsi, sumber 'survei'|'osm', osm_id, waktu_survei, geom Point, created_at, updated_at)`.
    Halte survei dan halte OSM masuk ke sini dengan kategori 'halte'.
  - `area_sekolah(id, nama, sumber 'survei'|'osm', osm_id, jenjang, tags jsonb, geom MultiPolygon)`
  - `jalur(id, nama, jenis 'rute'|'jalur', waktu_mulai, waktu_selesai, geom LineString)`
  - `kategori(kode, nama, warna, ikon)`
  - view `v_sekolah_analisis` sebagai unit analisis (§3)
  - file: `db/schema.sql`, `db/seed.sql` (di-generate dari file sumber dengan `scripts/build-data.py`), `scripts/setup-db.js` (`npm run db:setup`)
- Cadangan: `public/data/*.geojson`, analisis yang sama dijalankan dengan Turf. Badge sumber data ditampilkan di peta.
- Deploy: GitHub → Vercel → Storage: Neon → `npm run db:setup` → env `ADMIN_PASSWORD`. Dijelaskan di README.

## 6. Analisis spasial
- Buffer: union `ST_Buffer(halte::geography, r)`. Slider 100–1000 m, preset 300/500, default 500 m.
  Setiap sekolah mendapat status terlayani/tidak (`ST_DWithin`) dan jarak ke halte terdekat (KNN `<->` + `ST_Distance`).
  Ringkasan: % sekolah terlayani per jenjang.
- Rekomendasi halte baru: sekolah tak terlayani di-cluster dengan `ST_ClusterDBSCAN(eps = radius, minpoints = 2)`.
  Centroid tiap klaster menjadi kandidat. Kandidat di-snap ke jalur survei bila ≤ 150 m.
  Kandidat diurutkan berdasarkan jumlah sekolah yang akan terlayani; tampilkan 10 teratas + jumlah sekolah + jarak baru.
  Sekolah tak terlayani yang tidak masuk klaster ditandai "terisolasi".
- Spatial query (klik peta): halte terdekat (jarak + waktu jalan kaki 5 km/jam) dan daftar sekolah dalam radius.
- Density: heatmap sekolah (OSM + survei), bisa dinyalakan/dimatikan.
- Overlay survei vs OSM: untuk 5 poligon survei, hitung luas masing-masing, luas irisan, dan IoU.
  Temuan awal: SMP 10 0,86 · SMPN 6 0,64 · SMPN 14 0,59 · SDN 51 0,57 · SMPN 5 0,16.
  Overlay lain: jumlah fasilitas survei di dalam tiap area sekolah (`ST_Contains`).
- Network ringan: panjang jalur (`ST_Length` geography) dan estimasi waktu jalan kaki/sepeda.

## 7. Halaman (UI dengan skill frontend-design)
- `index.html` Beranda: profil web, latar belakang, wilayah studi, ringkasan data (angka dari /api/stats), fitur, alur kerja, tim, atribusi OSM. Tanpa peta data.
- `peta.html` Peta: peta penuh.
  - Panel layer: checkbox kategori, jenjang, dan sumber; pilihan basemap; legenda.
  - Panel analisis: slider radius, hasil status sekolah, rekomendasi halte, mode klik query, heatmap, overlay. Popup untuk setiap fitur.
- `data.html` Data: tabel dari database (cari/filter), statistik, tabel keputusan sekolah → halte terdekat, tabel overlay survei vs OSM.
- `admin.html` Admin: masukkan password, klik peta untuk menambah titik, form, tabel dengan tombol edit/hapus.

## 8. Laporan (keputusan saya)
- PDF (sesuai preferensi Fire) + DOCX sumbernya. Sederhana/polosan, bahasa mahasiswa TI semester 5.
- Sampul → Kata Pengantar → Daftar Isi/Gambar/Tabel → BAB 1 Pendahuluan → BAB 2 Landasan Teori → BAB 3 Analisis & Perancangan →
  BAB 4 Implementasi & Pembahasan (termasuk batasan: kelengkapan data OSM) → Daftar Pustaka.
- A4, Times New Roman 12, spasi 1,5, APA dengan sumber nyata. Identitas: menunggu jawaban individu/kelompok + nama dosen (sementara pakai placeholder).
- Screenshot awal dari build lokal tanpa basemap, diberi catatan untuk diganti setelah deploy.

## 9. Diserahkan ke builder
Detail styling, struktur file frontend, teks konten beranda, pilihan library kecil, ambang pembersihan data selain yang ditulis di atas.

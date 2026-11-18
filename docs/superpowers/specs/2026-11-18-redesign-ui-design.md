# Desain — Perombakan tampilan Jangkau (publik, profesional, responsif)

Tanggal: 2026-11-18 · Pemilik: Fire · Melanjutkan: docs/design.md (fungsi dan data tidak berubah)

## 1. Maksud
Web akan dibuka publik dan dipresentasikan (9 dan 16 Desember 2026). Tampilan sekarang masih terasa seperti alat internal:
banyak istilah teknis, halaman Admin ada di navbar, belum ada mode gelap, dan tampilan HP masih seadanya.
Tujuan perombakan: tampilan profesional dan orisinal yang langsung bisa dipahami orang awam, tetap ringan di Vercel,
tanpa mengubah fungsi peta, analisis, dan database.

## 2. Goals / non-goals / anti-goals
Goals (permintaan Fire):
1. Logo baru buatan sendiri, dipakai di navbar, favicon, dan footer.
2. Animasi 3D di Beranda: **diorama kota mini dari CSS 3D** (dipilih Fire, opsi A).
3. Navbar berbentuk pil melayang di desktop/laptop; tab bar di bawah layar di HP.
4. Semua teks memakai bahasa awam; tidak ada istilah seperti "environment variable", "PostGIS", "GeoJSON", "IoU", "DBSCAN", atau "OSM" di teks utama.
5. Admin keluar dari navbar.
6. Mode gelap/terang.
7. Animasi dan transisi halus.
8. Tetap ringan.

Non-goals: mengubah API, database, analisis, atau data; framework baru; fitur baru di luar tampilan.

Anti-goals:
- tampilan template/"AI slop": kartu-kartu seragam, gradien hiasan, label huruf kapital di atas setiap judul, angka besar + label kecil sebagai hero
- meniru desain web lain (termasuk FloodGuard)
- Beranda menampilkan data peta (ketentuan dosen no. 3)
- Beranda jadi berat karena library 3D atau Turf

## 3. Approaches
1. **Tetap Vite + JavaScript biasa, desain ulang dengan token CSS + CSS 3D** — DIPILIH (keputusan saya, satu-satunya jalan yang masuk akal).
   Arsitektur dan tes yang ada tetap bisa dipakai, tanpa tambahan library.
2. Pindah ke React/Svelte + UI kit. Tidak dipilih: harus menulis ulang semua halaman, bundle lebih berat, risiko lebih besar menjelang presentasi.
3. Tailwind. Tidak dipilih: menambah build, cenderung menghasilkan tampilan pasaran, dan web referensi FloodGuard juga memakai Tailwind.

## 4. Arah visual (keputusan saya)
Subjek: jarak jalan kaki pelajar ke halte bus di Pekanbaru.

Kuning dipertahankan sebagai aksen karena punya dua makna lokal sekaligus: kuning rambu halte dan kuning Melayu Riau.
Biru dongker dari seragam SMP menjadi warna tinta.

Token warna:

| Peran | Terang | Gelap |
|---|---|---|
| Latar | `#F5F7FA` | `#0D1626` |
| Permukaan | `#FFFFFF` | `#152238` |
| Tinta | `#13233F` | `#E8EDF5` |
| Teks redup | `#5A6577` | `#9AA7BD` |
| Garis | `#DCE2EA` | `#26354F` |
| Aksen kuning | `#F2BE1A` | `#F2BE1A` |
| Hijau "terjangkau" | `#2F8F4E` | `#2F8F4E` |
| Merah "belum" | `#B3262D` | `#B3262D` |

Warna jenjang tetap mengikuti seragam (SD merah, SMP biru dongker, SMA abu-abu).

Tipografi: satu keluarga, **Overpass** (huruf bergaya rambu jalan), bobot 400/600/800, hanya subset latin.
Skala: 14 · 16 · 18 · 22 · 28 · 40 · 56. Judul memakai 800 dengan letter-spacing sedikit negatif. Tanpa label huruf kapital.

Logo "Jangkau":
- kotak rambu kuning bersudut membulat
- di dalamnya huruf J biru dongker yang ujung kaitnya berupa titik (sekolah)
- satu busur tipis di sudut kanan atas melambangkan jangkauan
- dibuat sebagai SVG, sekaligus dipakai untuk favicon

## 5. Tata letak
Navbar desktop (≥ 768 px), berupa pil melayang di tengah atas dengan latar kaca buram:

```
        ╭───────────────────────────────────────────────╮
        │ [logo] Jangkau   Beranda  Peta  Data    ◐     │
        ╰───────────────────────────────────────────────╯
```

Navbar HP (< 768 px): tab bar tetap di bawah layar, dengan 4 tab ikon + label (Beranda, Peta, Data, Tema) dan memperhitungkan safe-area.

Beranda:
```
[pil navbar]
┌──────────────────────────┬────────────────────────────┐
│ Judul besar + kalimat    │   DIORAMA 3D               │
│ penjelasan + 2 tombol    │   jalan, halte, sekolah,   │
│                          │   bus lewat, orang jalan,  │
│                          │   lingkaran 500 m berdenyut│
└──────────────────────────┴────────────────────────────┘
Seberapa jauh sekolah dari halte?   (diagram jalan yang sudah ada, didesain ulang)
Cara kerja (4 langkah bernomor, karena memang berurutan; istilah SIG sebagai keterangan kecil)
Yang bisa Anda lakukan di peta
Tentang data · Pembuat
Footer: atribusi OpenStreetMap, "Masuk pengelola" (tautan kecil)
```

- HP: diorama berada di bawah judul, ukurannya mengecil.
- Diorama:
  - lantai miring isometrik (perspective + rotateX/rotateZ)
  - gedung sekolah berupa balok 3D
  - halte berupa kotak kuning dengan atap
  - bus bergerak di jalan dan berhenti sejenak di halte
  - beberapa siswa berjalan dari halte ke sekolah
  - lingkaran jangkauan berdenyut dari halte
  - di desktop, diorama miring pelan mengikuti kursor
  - animasi dijeda saat tidak terlihat di layar (IntersectionObserver)
  - tampil diam jika `prefers-reduced-motion`

Peta:
- peta penuh layar
- panel melayang di kiri (tab "Lapisan" dan "Analisis") dengan latar kaca
- di HP, panel berubah jadi lembar bawah (bottom sheet) bertingkat (intip / setengah / penuh) di atas tab bar
- di mode gelap, peta dasar ikut gelap: filter CSS pada OpenStreetMap, atau CARTO dark bila key tersedia

Data:
- tabel tetap rapi di desktop
- di HP, baris tabel keputusan berubah menjadi daftar bertumpuk

Admin:
- tidak ada di navbar
- dibuka lewat `/admin` atau tautan kecil "Masuk pengelola" di footer
- kartu login di tengah: "Masukkan kata sandi pengelola", tanpa penjelasan teknis

## 6. Bahasa publik (keputusan saya)
Sapaan memakai "Anda".

| Sebelumnya | Menjadi |
|---|---|
| Database PostGIS | Data terkini |
| Data cadangan (GeoJSON) | Data salinan (tooltip: server sedang tidak terhubung, menampilkan salinan data terakhir) |
| Buffer / zona jangkauan | Zona jalan kaki 500 m |
| Spatial query | Cari halte terdekat |
| Heatmap | Kepadatan sekolah |
| Overlay survei vs OSM, IoU | Bandingkan batas sekolah hasil survei dengan OpenStreetMap, kecocokan (%) |
| OSM | OpenStreetMap |
| Unit analisis | Sekolah |
| environment variable ADMIN_PASSWORD | (dihapus) |

Istilah SIG (analisis buffer, DBSCAN, PostGIS) hanya muncul sebagai keterangan kecil di bagian "Cara kerja" dan di laporan.

## 7. Gerak dan kinerja
- Transisi antarhalaman: cross-document View Transitions (`@view-transition { navigation: auto; }`), memudar ±200 ms.
  Browser yang belum mendukung tetap berfungsi tanpa transisi.
- Satu momen pembuka di Beranda: judul muncul lalu diorama terangkai. Tidak ada animasi muncul di setiap bagian.
  Transisi interaksi (panel, tema, tab) 150–250 ms.
- Ringan:
  - tanpa library baru
  - Turf hanya dimuat saat mode salinan dibutuhkan (dynamic import), sehingga Beranda dan Data tidak ikut memuat Turf
  - target JS Beranda ≤ 25 KB gzip
  - OpenLayers hanya di Peta dan Admin
- Tema: mengikuti sistem saat pertama dibuka, pilihan disimpan di localStorage (dibungkus try/catch).
  Skrip kecil di `<head>` mencegah kedipan warna saat halaman dimuat.

## 8. Yang tetap
- Semua atribut `data-*` yang dipakai tes tetap ada.
- Fungsi API, analisis, dan database tidak diubah.
- Semua tes lama harus tetap lulus. Tes baru ditambah untuk:
  - navbar pil / tab bar
  - Admin tidak ada di navbar
  - mode gelap tersimpan
  - diorama ada di Beranda dan diam saat reduced-motion
  - tidak ada istilah terlarang di teks halaman publik
  - ukuran JS Beranda

## 9. Laporan
DITUNDA atas permintaan Fire (menunggu kemungkinan revisi tampilan). Laporan tidak dibangun ulang pada pekerjaan ini.

## 10. Diserahkan ke builder
Detail ikon (SVG buatan sendiri), angka easing, ukuran persis diorama, dan kalimat-kalimat kecil di UI, selama mengikuti §6.

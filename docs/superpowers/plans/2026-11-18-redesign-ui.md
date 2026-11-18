# Perombakan Tampilan Jangkau Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tampilan Jangkau yang profesional, orisinal, responsif, dan berbahasa awam (logo, diorama 3D, navbar pil/tab bar, tema gelap/terang), tanpa mengubah fungsi.

**Architecture:** Vite multi-page + JS biasa tetap. Token desain CSS (custom property per tema) di `src/styles/base.css`. Navbar, footer, dan tema diatur `src/lib/layout.js` dari markup statis yang sama di setiap halaman. Diorama memakai CSS 3D murni (`src/lib/diorama.js` + `src/styles/diorama.css`). Turf dimuat dinamis hanya saat mode salinan.

**Tech Stack:** Vite 6, OpenLayers 10, Turf 7 (dinamis), Overpass (fontsource), Playwright/pytest, node:test.

**Spec:** `docs/superpowers/specs/2026-11-18-redesign-ui-design.md`

## Global Constraints
- Tidak ada library baru. API, SQL, data, dan analisis tidak diubah.
- Token: terang `#F5F7FA/#FFFFFF/#13233F/#5A6577/#DCE2EA`, gelap `#0D1626/#152238/#E8EDF5/#9AA7BD/#26354F`, aksen `#F2BE1A`, terjangkau `#2F8F4E`, belum `#B3262D`. Jenjang tetap dari `config.js`.
- Font hanya Overpass 400/600/800, subset latin. Skala 14/16/18/22/28/40/56. Tanpa label huruf kapital.
- Breakpoint navbar: ≥ 768 px pil melayang; < 768 px tab bar bawah (Beranda, Peta, Data, Tema).
- Admin tidak ada di navbar. Akses lewat `/admin.html` dan tautan footer "Masuk pengelola".
- Kata terlarang di teks yang terlihat pada halaman publik (kecuali elemen `.istilah` dan atribusi peta): `PostGIS`, `GeoJSON`, `IoU`, `DBSCAN`, `environment`, `ADMIN_PASSWORD`, `OSM` (kata utuh), `unit analisis`, `API`.
- Label sumber data: "Data terkini" atau "Data salinan".
- Tema: atribut `data-theme="light|dark"` di `<html>`, disimpan di localStorage `jangkau-tema` (try/catch), default mengikuti `prefers-color-scheme`. Skrip inline di `<head>` agar tidak berkedip.
- Gerak: View Transitions lintas halaman; transisi interaksi 150–250 ms; `prefers-reduced-motion` mematikan animasi.
- Kinerja: JS Beranda ≤ 25 KB gzip (semua chunk yang dimuat `index.html`).
- Atribut `data-*` lama yang dipakai tes tetap ada.
- Laporan TIDAK dibangun ulang.

## Review Focus
1. localStorage diblokir (mode privat/iframe) → tema tetap berfungsi dari preferensi sistem, tanpa error. (Task 1: tes dengan localStorage melempar error)
2. Layar sempit 360 px → tab bar tidak menutupi konten atau tombol penting; panel peta tetap bisa dibuka. (Task 1 dan Task 4: screenshot 360 px + cek `padding-bottom` body)
3. Mode gelap di Peta → peta dasar ikut gelap dan simbol tetap terbaca. (Task 4: kelas `tema-gelap` pada layer basemap)
4. Pengguna dengan reduced-motion → diorama diam, tanpa animasi. (Task 3)
5. Server tidak terhubung → semua halaman memakai data salinan dengan label yang jelas, dan Turf dimuat dinamis tanpa error. (Task 2)

---

### Task 1: Fondasi — token, tema, logo, navbar pil/tab bar, footer
**Files:**
- Modify: `src/styles/base.css` (tulis ulang token + komponen dasar), `src/lib/layout.js`
- Modify: 4 file HTML (head: skrip tema + view-transition; nav baru; footer)
- Create: `public/logo.svg`, `public/favicon.svg` (ganti)
- Test: `tests/test_ui.py`

**Interfaces:**
- Produces: `initLayout()` (menggantikan `initNav`; mengatur tema, navbar, dan tab aktif), `getTheme(): 'light'|'dark'`, event `window` `'temachange'` (detail: tema).
- `setBadge(el, sumber)` tetap ada, dengan teks baru.
- Markup: `nav.pill` (desktop), `nav.tabbar` (HP), tombol `[data-theme-toggle]`, `footer` berisi `a[href='/admin.html'].masuk-pengelola`.

- [ ] Step 1: Tes di `tests/test_ui.py`:
  - `test_nav_desktop_pil`: viewport 1440 → `nav.pill` terlihat dan berisi tautan Beranda/Peta/Data; tidak ada tautan ke admin di `nav`.
  - `test_nav_mobile_tabbar`: viewport 390 → `nav.tabbar` terlihat dan `nav.pill` tersembunyi; 4 item.
  - `test_admin_di_footer`: `footer a.masuk-pengelola` ada.
  - `test_tema_tersimpan`: klik toggle → `html[data-theme=dark]`; reload tetap dark.
  - `test_tema_tanpa_localstorage`: init script yang membuat `localStorage.getItem` melempar error → halaman tampil tanpa pageerror.
- [ ] Step 2: Jalankan → FAIL.
- [ ] Step 3: Implementasi. Logo SVG sesuai spec §4. Tab aktif ditandai `aria-current="page"`. Body di HP diberi `padding-bottom` setinggi tab bar + safe-area.
- [ ] Step 4: Jalankan tes UI → PASS; tes lama tetap PASS.
- [ ] Step 5: Commit `feat(ui): token tema, logo, navbar pil dan tab bar`.

### Task 2: Turf dimuat dinamis + anggaran ukuran Beranda
**Files:**
- Modify: `src/lib/api.js`
- Test: `tests/apiclient.test.js`, `tests/test_ui.py` (`test_ukuran_js_beranda`)

**Interfaces:** `api.js` mengekspor fungsi yang sama. `local.js` hanya di-`import()` di jalur cadangan.

- [ ] Step 1: `test_ukuran_js_beranda`: baca `dist/index.html`, kumpulkan semua `<script type=module src>` dan `modulepreload`, lalu jumlahkan ukuran gzip-nya → ≤ 25 000 byte.
- [ ] Step 2: → FAIL (Turf ikut terbundel).
- [ ] Step 3: `api.js` memakai `const local = await import('./local.js')` di `getAnalysis`/`getStats` cadangan.
- [ ] Step 4: `npm test` (apiclient cadangan tetap lulus) dan tes ukuran → PASS.
- [ ] Step 5: Commit `perf: turf dimuat hanya saat mode salinan`.

### Task 3: Beranda baru + diorama 3D
**Files:**
- Modify: `index.html`, `src/pages/home.js`, `src/styles/home.css`
- Create: `src/lib/diorama.js` (`mountDiorama(el): () => void`, mengembalikan fungsi bersih-bersih), `src/styles/diorama.css`
- Test: `tests/test_ui.py`

- [ ] Step 1: Tes:
  - `test_beranda_tanpa_peta` (sudah ada; tetap)
  - `test_diorama`: `[data-diorama]` terlihat, berisi ≥ 3 `.gedung`, 1 `.halte`, 1 `.bus`, `.cincin`.
  - `test_diorama_reduced_motion`: `emulate_media(reduced_motion='reduce')` → `getComputedStyle(.bus).animationName === 'none'`.
  - `test_bahasa_publik`: di `/`, `/peta.html`, `/data.html`, teks terlihat (selain `.istilah`, `.ol-attribution`) tidak mengandung kata terlarang.
- [ ] Step 2: → FAIL.
- [ ] Step 3: Implementasi sesuai spec §5:
  - diorama memakai CSS 3D
  - di desktop, kemiringan mengikuti kursor dengan batas ±6°
  - animasi dijeda dengan IntersectionObserver saat tidak terlihat
  - diagram jalan lama dipertahankan dengan gaya baru
  - teks memakai bahasa awam
- [ ] Step 4: → PASS.
- [ ] Step 5: Commit `feat(beranda): desain baru dan diorama 3D`.

### Task 4: Peta — panel kaca, lembar bawah HP, tema gelap peta dasar, bahasa awam
**Files:**
- Modify: `peta.html`, `src/pages/peta.js`, `src/styles/peta.css`, `src/lib/map.js`
- Test: `tests/test_ui.py`

**Interfaces:**
- Consumes `'temachange'` dari Task 1.
- `map.js`: `createMap()` memberi layer basemap `className: 'basemap'`. `map.setTheme(tema)` memakai CARTO dark bila ada key, atau filter CSS bila tidak.

- [ ] Step 1: Tes:
  - `test_peta_tema_gelap`: tema dark → elemen `.basemap` punya filter (computed `filter != 'none'`) atau sumbernya `dark_all`.
  - `test_peta_mobile_sheet`: viewport 390 → `[data-sheet]` ada; klik `[data-sheet-handle]` mengubah `data-state` dari `intip` ke `setengah`.
  - Tes peta lama (`[data-layer-toggle]`, `[data-run-analysis]`, `[data-click-mode]`, label "Data terkini"/"Data salinan") disesuaikan teks barunya.
- [ ] Step 2: → FAIL.
- [ ] Step 3: Implementasi.
- [ ] Step 4: → PASS.
- [ ] Step 5: Commit `feat(peta): panel kaca, lembar bawah, peta gelap`.

### Task 5: Data dan Admin
**Files:**
- Modify: `data.html`, `src/pages/data.js`, `src/styles/data.css`, `admin.html`, `src/pages/admin.js`, `src/styles/admin.css`
- Test: `tests/test_ui.py`

- [ ] Step 1: Tes:
  - `test_data_mobile`: viewport 390 → baris tabel keputusan tampil bertumpuk; `[data-tabel-keputusan] tbody tr` tetap ada.
  - `test_admin_tanpa_istilah`: halaman admin tidak mengandung `environment` / `ADMIN_PASSWORD`.
  - Tes data dan admin lama tetap lulus.
- [ ] Step 2: → FAIL.
- [ ] Step 3: Implementasi.
- [ ] Step 4: → PASS.
- [ ] Step 5: Commit `feat(ui): halaman data dan admin`.

### Task 6: Verifikasi akhir + paket
- [ ] Jalankan `npm test`, `python3 -m pytest tests -q`, dan `npm run build` → semua lulus.
- [ ] Screenshot desktop/HP × terang/gelap untuk keempat halaman, lalu periksa secara visual.
- [ ] Review menyeluruh. Buat zip baru (tanpa membangun laporan) dan kirim.

// Membuat Laporan Akhir Project SIG (DOCX). Angka diambil dari laporan/hasil.json & laporan/bersih.json.
// Pakai: node laporan/build_laporan.cjs   (pass 2 memakai laporan/pages.json untuk nomor halaman daftar isi)
const fs = require('fs');
const path = require('path');
const {
  Document, Packer, Paragraph, TextRun, ImageRun, Table, TableRow, TableCell, WidthType, ShadingType, BorderStyle,
  AlignmentType, HeadingLevel, PageBreak, Footer, PageNumber, NumberFormat, LevelFormat, PositionalTab,
  PositionalTabAlignment, PositionalTabRelativeTo, PositionalTabLeader, VerticalAlign, TableLayoutType, Tab, TabStopType, LeaderType,
} = require('docx');

const DIR = __dirname;
const H = JSON.parse(fs.readFileSync(path.join(DIR, 'hasil.json')));
const B = JSON.parse(fs.readFileSync(path.join(DIR, 'bersih.json')));
const PAGES = fs.existsSync(path.join(DIR, 'pages.json')) ? JSON.parse(fs.readFileSync(path.join(DIR, 'pages.json'))) : {};
const img = (f) => fs.readFileSync(path.join(DIR, 'img', f));
const { imageSize } = (() => { try { return require('image-size'); } catch { return {}; } })();

const FONT = 'Times New Roman';
const CW = 11906 - 2268 - 1701; // lebar isi (DXA)
const nf = (n, d = 0) => Number(n).toLocaleString('id-ID', { maximumFractionDigits: d, minimumFractionDigits: d });
const meter = (m) => (m >= 1000 ? `${Number(m / 1000).toLocaleString('id-ID', { maximumFractionDigits: 2 })} km` : `${nf(m)} m`);
const menit = (m) => (m < 1 ? '< 1 menit' : `${nf(Math.round(m))} menit`);

// ---------------------------------------------------------------- daftar isi / gambar / tabel
const toc = [];
let bab = 0, sub = 0, nGbr = 0, nTbl = 0, nPers = 0;

// ---------------------------------------------------------------- blok dasar
const run = (t, o = {}) => new TextRun({ text: t, font: FONT, size: 24, ...o });
function rich(s, base = {}) {
  // **tebal**, _miring_, [[sorot]]
  const out = [];
  const re = /(\*\*[^*]+\*\*|_[^_]+_|\[\[[^\]]+\]\])/g;
  let last = 0, m;
  while ((m = re.exec(s))) {
    if (m.index > last) out.push(run(s.slice(last, m.index), base));
    const t = m[0];
    if (t.startsWith('**')) out.push(run(t.slice(2, -2), { ...base, bold: true }));
    else if (t.startsWith('[[')) out.push(run(t.slice(2, -2), { ...base, highlight: 'yellow' }));
    else out.push(run(t.slice(1, -1), { ...base, italics: true }));
    last = m.index + t.length;
  }
  if (last < s.length) out.push(run(s.slice(last), base));
  return out;
}
const P = (s, o = {}) => new Paragraph({ children: rich(s), alignment: AlignmentType.JUSTIFIED,
  indent: o.noIndent ? undefined : { firstLine: 567 }, spacing: { line: 360, before: 0, after: 120 }, ...o.p });
const center = (s, size = 24, o = {}) => new Paragraph({ alignment: AlignmentType.CENTER, spacing: { line: 276, after: o.after ?? 0, before: o.before ?? 0 },
  children: rich(s, { size, bold: o.bold }) });
const pageBreak = () => new Paragraph({ children: [new PageBreak()] });

let listInst = 0;
const list = (items, kind = 'angka') => {
  listInst += 1;
  return items.map((s) => new Paragraph({ children: rich(s), numbering: { reference: kind, level: 0, instance: listInst },
    alignment: AlignmentType.JUSTIFIED, spacing: { line: 360, after: 60 } }));
};

function H1(judul) {
  bab += 1; sub = 0; nGbr = 0; nTbl = 0; nPers = 0;
  toc.push({ level: 1, text: `BAB ${bab} ${judul}`, key: `BAB ${bab}` });
  return [new Paragraph({ heading: HeadingLevel.HEADING_1, pageBreakBefore: true, alignment: AlignmentType.CENTER,
    spacing: { after: 360 }, children: [run(`BAB ${bab}`, { size: 28, bold: true }), run(judul, { size: 28, bold: true, break: 1 })] })];
}
function H2(judul) {
  sub += 1;
  const t = `${bab}.${sub} ${judul}`;
  toc.push({ level: 2, text: t, key: t });
  return new Paragraph({ heading: HeadingLevel.HEADING_2, spacing: { before: 240, after: 120 }, keepNext: true, children: [run(t, { bold: true })] });
}
let sub3 = 0;
function H3(judul, reset) {
  if (reset) sub3 = 0;
  sub3 += 1;
  const t = `${bab}.${sub}.${sub3} ${judul}`;
  toc.push({ level: 3, text: t, key: t });
  return new Paragraph({ heading: HeadingLevel.HEADING_3, spacing: { before: 200, after: 100 }, keepNext: true, children: [run(t, { italics: true })] });
}

function pxSize(file) {
  const buf = img(file);
  const w = buf.readUInt32BE(16), h = buf.readUInt32BE(20); // header PNG
  return { buf, w, h };
}
function Fig(file, judul, widthCm = 14) {
  nGbr += 1;
  const label = `Gambar ${bab}.${nGbr}`;
  const t = `${label} ${judul}`;
  toc.push({ level: 'g', text: t, key: t.slice(0, 48) });
  const { buf, w, h } = pxSize(file);
  const width = Math.round((widthCm / 2.54) * 96);
  const height = Math.round((width * h) / w);
  return {
    label,
    blocks: [
      new Paragraph({ alignment: AlignmentType.CENTER, keepNext: true, spacing: { before: 120, after: 60 },
        children: [new ImageRun({ type: 'png', data: buf, transformation: { width, height } })] }),
      new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 200, line: 240 }, children: [run(t, { size: 22 })] }),
    ],
  };
}

function cell(text, w, o = {}) {
  return new TableCell({
    width: { size: w, type: WidthType.DXA }, verticalAlign: VerticalAlign.CENTER,
    shading: o.head ? { type: ShadingType.CLEAR, fill: 'E7E6E6', color: 'auto' } : undefined,
    margins: { top: 40, bottom: 40, left: 80, right: 80 },
    children: [new Paragraph({ alignment: o.align || AlignmentType.LEFT, spacing: { line: 240 },
      children: rich(String(text ?? '–'), { size: 20, bold: o.head }) })],
  });
}
function Tbl(judul, head, rows, widths, align = []) {
  nTbl += 1;
  const label = `Tabel ${bab}.${nTbl}`;
  const t = `${label} ${judul}`;
  toc.push({ level: 't', text: t, key: t.slice(0, 48) });
  const total = widths.reduce((a, b) => a + b, 0);
  const ws = widths.map((x) => Math.floor((x / total) * CW));
  ws[ws.length - 1] += CW - ws.reduce((a, b) => a + b, 0);
  const al = (i) => (align[i] === 'r' ? AlignmentType.RIGHT : align[i] === 'c' ? AlignmentType.CENTER : AlignmentType.LEFT);
  return {
    label,
    blocks: [
      new Paragraph({ alignment: AlignmentType.CENTER, keepNext: true, spacing: { before: 160, after: 80, line: 240 }, children: [run(t, { size: 22 })] }),
      new Table({
        width: { size: CW, type: WidthType.DXA }, columnWidths: ws, layout: TableLayoutType.FIXED,
        rows: [new TableRow({ tableHeader: true, children: head.map((h, i) => cell(h, ws[i], { head: true, align: AlignmentType.CENTER })) }),
          ...rows.map((r) => new TableRow({ cantSplit: true, children: r.map((c, i) => cell(c, ws[i], { align: al(i) })) }))],
      }),
      new Paragraph({ spacing: { after: 120 }, children: [] }),
    ],
  };
}
const code = (lines) => lines.map((l, i) => new Paragraph({ spacing: { line: 240, before: i ? 0 : 80, after: i === lines.length - 1 ? 160 : 0 },
  indent: { left: 567 }, shading: { type: ShadingType.CLEAR, fill: 'F2F2F2', color: 'auto' },
  children: [new TextRun({ text: l || ' ', font: 'Courier New', size: 18 })] }));
function Eq(text) {
  nPers += 1;
  return new Paragraph({ spacing: { before: 120, after: 120 },
    tabStops: [{ type: TabStopType.CENTER, position: Math.round(CW / 2) }, { type: TabStopType.RIGHT, position: CW }],
    children: [new TextRun({ font: FONT, size: 24, italics: true, children: [new Tab(), text] }), new TextRun({ font: FONT, size: 24, children: [new Tab(), `(${bab}-${nPers})`] })] });
}

// ---------------------------------------------------------------- data turunan
const R = H.buffer;
const st = H.stats;
const ov = H.overlay;
const kand = H.recommend.kandidat.features.map((f) => ({ ...f.properties, lon: f.geometry.coordinates[0], lat: f.geometry.coordinates[1] }));
const J = ['SD/MI', 'SMP/MTs', 'SMA/SMK/MA', 'TK/PAUD', 'Campuran', 'Pesantren/Diniyah', 'SLB', 'Tidak diketahui'];
const pct = (a, b) => (b ? `${nf((a / b) * 100, 1)}%` : '–');
const r500 = R['500'].ringkasan;
const terdekat500 = R['500'].terdekat;
const jalur = st.jalur;
const S500 = Object.fromEntries(H.sekolah500.map((p) => [p.nama, p]));
const nHalte = st.jumlah.halte;
const nHalteOsm = H.halte.filter((x) => x.sumber === 'osm').length;
const nHalteSvy = nHalte - nHalteOsm;
const KJ = H.kandidatJalan;
const rumbai = kand.find((k) => k.sekolah.includes('SMPN 6 Rumbai'));

// ================================================================= ISI
const body = [];
const add = (...x) => x.flat().forEach((b) => body.push(...(b && b.blocks ? b.blocks : [b])));

// ---------------- BAB 1
add(H1('PENDAHULUAN'));
add(H2('Latar Belakang'));
add(P('Angkutan umum masih menjadi pilihan banyak pelajar untuk berangkat dan pulang sekolah, terutama bagi siswa yang belum boleh membawa kendaraan sendiri. Di Kota Pekanbaru, layanan bus kota Trans Metro Pekanbaru sudah berjalan beberapa tahun dan melayani belasan koridor (Melissa dkk., 2019). Namun, ada atau tidaknya rute bus belum tentu berarti layanan itu mudah dipakai. Salah satu hal yang sangat menentukan adalah seberapa jauh siswa harus berjalan kaki dari sekolah ke halte terdekat.'));
add(P('Jarak jalan kaki ke halte sebenarnya sudah punya acuan. Pedoman teknis dari Direktorat Jenderal Perhubungan Darat (1996) mengatur jarak antar tempat henti berdasarkan tata guna lahan, mulai dari 200–300 m di pusat kegiatan yang padat sampai 500–1000 m di kawasan yang jarang penduduknya. Di sisi lain, banyak perencana transportasi memakai radius sekitar 400 m di sekitar halte bus sebagai daerah layanan, dan penelitian El-Geneidy dkk. (2014) menemukan bahwa 85% penumpang bus berjalan tidak lebih dari sekitar 524 m dari rumah ke halte. Artinya, sekolah yang berjarak jauh di atas angka tersebut bisa dianggap belum terjangkau halte dengan nyaman.'));
add(P('Masalahnya, informasi sekolah mana saja yang dekat atau jauh dari halte belum tersedia dalam bentuk peta yang mudah dibaca. Data sekolah tersebar di berbagai sumber, sedangkan data halte belum lengkap. Sistem Informasi Geografis (SIG) cocok untuk masalah seperti ini karena bisa menggabungkan data lokasi dari beberapa sumber, menghitung jarak, lalu menampilkan hasilnya di peta. Kalau dibuat dalam bentuk WebGIS, hasil analisis bisa dibuka siapa saja lewat browser tanpa perlu memasang aplikasi SIG.'));
add(P('Berdasarkan hal tersebut, pada project akhir mata kuliah Sistem Informasi Geografis ini penulis membangun WebGIS bernama **Jangkau**. Data yang dipakai berasal dari survei lapangan pada 30 September 2026 menggunakan aplikasi Avenza Maps, ditambah data sekolah dari OpenStreetMap. Semua data disimpan di database PostgreSQL dengan ekstensi PostGIS, lalu dianalisis menggunakan buffer, query jarak, overlay, heatmap, dan pengelompokan DBSCAN untuk menghasilkan usulan lokasi halte baru.'));
add(H2('Rumusan Masalah'));
add(P('Rumusan masalah dalam project ini adalah sebagai berikut.', { noIndent: true }));
add(list([
  'Bagaimana memetakan sebaran sekolah, halte, dan fasilitas pendukung pendidikan di Kota Pekanbaru dalam sebuah WebGIS?',
  'Berapa banyak sekolah yang berada dalam jarak jalan kaki yang wajar dari halte terdekat?',
  'Di mana lokasi halte baru yang paling banyak membantu sekolah yang belum terjangkau?',
  'Bagaimana data spasial hasil survei dan data OpenStreetMap dikelola di database agar bisa ditambah, diubah, dan dihapus?',
]));
add(H2('Batasan Masalah'));
add(P('Agar pembahasan tidak melebar, project ini dibatasi pada hal-hal berikut.', { noIndent: true }));
add(list([
  'Wilayah analisis adalah Kota Pekanbaru. Survei detail dilakukan di dua kawasan, yaitu sekitar SMPN 6 dan SMKN 5 di Rumbai serta sekitar SMAN 1 dan SMPN 5 di pusat kota.',
  'Data survei diambil pada 30 September 2026 dengan Avenza Maps. Data tambahan berasal dari OpenStreetMap yang diunduh lewat Overpass Turbo pada 18 November 2026.',
  'Jarak dihitung sebagai jarak garis lurus di permukaan bumi (geodesik), bukan jarak menyusuri jaringan jalan.',
  `Halte yang dianalisis hanya halte yang ada di database, yaitu ${nHalteSvy} halte hasil survei dan ${nHalteOsm} halte serta terminal dari OSM. Halte yang belum dipetakan di OSM belum ikut dihitung.`,
  'Radius jangkauan dapat diatur dari 100 sampai 1000 m dengan nilai bawaan 500 m.',
  'Analisis tidak memperhitungkan jumlah siswa, rute dan jadwal bus, maupun kondisi trotoar.',
], 'angka'));
add(H2('Tujuan'));
add(list([
  'Membangun WebGIS berbasis OpenLayers yang menampilkan data sekolah, halte, fasilitas, area sekolah, dan jalur survei dengan filter per kategori.',
  'Menghitung tingkat keterjangkauan sekolah terhadap halte menggunakan analisis buffer dan jarak.',
  'Menghasilkan usulan lokasi halte baru berdasarkan pengelompokan sekolah yang belum terjangkau.',
  'Mengelola data spasial menggunakan PostgreSQL dan PostGIS yang dapat diperbarui melalui halaman admin.',
]));
add(H2('Manfaat'));
add(list([
  '**Bagi penulis:** menerapkan materi SIG, mulai dari survei lapangan, pengolahan data spasial, basis data spasial, sampai pembuatan WebGIS yang dapat diakses publik.',
  '**Bagi pengelola transportasi kota:** menjadi gambaran awal kawasan sekolah yang perlu diprioritaskan saat menambah atau memindahkan halte.',
  '**Bagi sekolah dan masyarakat:** membantu mengetahui halte terdekat dari sekolah atau rumah beserta perkiraan waktu jalan kakinya.',
], 'bullet'));

// ---------------- BAB 2
add(H1('LANDASAN TEORI'));
add(H2('Sistem Informasi Geografis'));
add(P('Sistem Informasi Geografis (SIG) adalah sistem berbasis komputer untuk mengumpulkan, menyimpan, mengolah, menganalisis, dan menampilkan data yang memiliki referensi lokasi di permukaan bumi (Prahasta, 2009). Longley dkk. (2015) menjelaskan bahwa kekuatan SIG ada pada kemampuannya menghubungkan data atribut dengan posisi geografis, sehingga pertanyaan seperti "apa yang ada di sekitar lokasi ini" atau "seberapa jauh objek A dari objek B" bisa dijawab secara terukur.'));
add(P('SIG terdiri dari beberapa komponen, yaitu perangkat keras, perangkat lunak, data, manusia, dan metode. Pada project ini, perangkat lunaknya berupa aplikasi web dan database spasial, datanya berasal dari survei lapangan dan OpenStreetMap, sedangkan metodenya berupa analisis buffer, jarak, overlay, kepadatan, dan pengelompokan.'));
add(H2('WebGIS'));
add(P('WebGIS adalah SIG yang memakai teknologi web sebagai media komunikasi antara komponen-komponennya (Fu & Sun, 2010). Pengguna cukup membuka browser, sementara pengolahan data dilakukan di server atau di sisi klien menggunakan JavaScript. Kelebihan utamanya adalah mudah diakses, tidak perlu instalasi, dan hasil analisis bisa dibagikan hanya dengan sebuah tautan.'));
add(P('Arsitektur WebGIS umumnya terdiri dari klien (browser), server aplikasi yang menyediakan layanan data atau analisis, dan server basis data. Peta dasar (basemap) biasanya diambil dari layanan tile, yaitu potongan gambar peta berukuran 256 × 256 piksel yang disusun menurut tingkat zoom.'));
add(H2('OpenLayers'));
add(P('OpenLayers adalah pustaka JavaScript sumber terbuka untuk menampilkan peta interaktif di halaman web (OpenLayers, 2026). Pustaka ini mendukung layer tile dari berbagai penyedia (misalnya OpenStreetMap, CARTO, dan Esri), layer vektor dari format GeoJSON maupun KML, proyeksi peta, gaya simbol yang dapat diprogram, popup (overlay), serta layer heatmap. Pada project ini OpenLayers versi 10 dipakai sebagai mesin peta utama.'));
add(H2('PostgreSQL dan PostGIS'));
add(P('PostgreSQL adalah sistem manajemen basis data relasional sumber terbuka. PostGIS merupakan ekstensi PostgreSQL yang menambahkan tipe data spasial, indeks spasial, dan ratusan fungsi analisis geografis (Obe & Hsu, 2021). PostGIS mengenal dua tipe utama, yaitu _geometry_ yang dihitung pada bidang datar sesuai sistem koordinatnya, dan _geography_ yang dihitung di permukaan elipsoid bumi sehingga hasil jarak dan luasnya langsung dalam meter.'));
add(P('Fungsi PostGIS yang dipakai dalam project ini antara lain ST_Buffer untuk membuat zona di sekitar objek, ST_Distance dan ST_DWithin untuk jarak, ST_Union untuk menggabungkan geometri, ST_Intersection dan ST_Area untuk overlay, ST_ClusterDBSCAN untuk pengelompokan, serta ST_ClosestPoint untuk mencari titik terdekat pada garis (PostGIS Project, 2026). Agar query cepat, kolom geometri diberi indeks GiST.'));
add(H2('Format Data dan Sistem Koordinat'));
add(P('Data hasil survei Avenza Maps diekspor dalam format KML (Keyhole Markup Language), yaitu format berbasis XML yang distandarkan oleh Open Geospatial Consortium (2008). Untuk dikirim ke browser, data diubah menjadi GeoJSON, format berbasis JSON untuk fitur geografis yang dibakukan dalam RFC 7946 (Butler dkk., 2016).'));
add(P('Semua data disimpan dalam sistem koordinat WGS 84 (EPSG:4326). Di peta, OpenLayers menampilkannya dalam proyeksi Web Mercator (EPSG:3857). Untuk perhitungan yang butuh satuan meter pada bidang datar, misalnya pengelompokan DBSCAN, data diproyeksikan sementara ke UTM zona 47N (EPSG:32647) yang mencakup wilayah Pekanbaru.'));
add(H2('OpenStreetMap dan Overpass'));
add(P('OpenStreetMap (OSM) adalah peta dunia yang dibuat bersama oleh sukarelawan dan dapat dipakai bebas dengan syarat mencantumkan atribusi sesuai lisensi Open Database License atau ODbL (OpenStreetMap Foundation, 2026). Data OSM dapat diambil per kategori melalui Overpass API, misalnya semua objek bertanda amenity=school di dalam suatu wilayah. Karena dibuat oleh sukarelawan, kelengkapan dan ketelitian data OSM bisa berbeda antar wilayah (Haklay, 2010). Hal ini perlu diperhatikan ketika data OSM dipakai untuk analisis.'));
add(H2('Analisis Spasial'));
add(P('Analisis spasial adalah proses mengolah data geografis untuk mendapatkan informasi baru, misalnya pola, hubungan, atau lokasi yang memenuhi syarat tertentu (Longley dkk., 2015). Jenis analisis yang dipakai dalam project ini dijelaskan pada subbab berikut.'));
add(H3('Analisis Buffer', true));
add(P('Buffer adalah zona dengan jarak tertentu di sekeliling objek. Untuk objek titik seperti halte, buffer berbentuk lingkaran dengan jari-jari sama dengan jarak yang ditentukan. Objek lain yang berada di dalam buffer dianggap berada dalam jangkauan. Pada project ini buffer dibuat di sekeliling setiap halte, lalu semua buffer digabung menjadi satu wilayah layanan.'));
add(H3('Spatial Query dan Analisis Jarak'));
add(P('Spatial query adalah pencarian data berdasarkan hubungan lokasinya, misalnya mencari semua sekolah dalam radius 500 m dari suatu titik, atau mencari satu halte yang paling dekat (nearest neighbour). Di PostGIS, query seperti ini ditulis dengan ST_DWithin dan ST_Distance, lalu diurutkan berdasarkan jaraknya.'));
add(H3('Analisis Overlay'));
add(P('Overlay adalah analisis yang menumpuk dua layer atau lebih untuk melihat bagian yang saling berpotongan. Pada project ini overlay dipakai untuk membandingkan poligon area sekolah hasil survei dengan poligon OSM, serta untuk menghitung titik fasilitas yang berada di dalam suatu area sekolah. Tingkat kecocokan dua poligon diukur dengan Intersection over Union (IoU), yang konsepnya sama dengan indeks Jaccard (Jaccard, 1912).'));
add(Eq('IoU = Luas(A ∩ B) / Luas(A ∪ B)'));
add(P('dimana A adalah poligon hasil survei dan B adalah poligon OSM. Luas gabungan dihitung sebagai Luas A + Luas B − Luas(A ∩ B). Nilai IoU berada di antara 0 (tidak berpotongan sama sekali) dan 1 (sama persis).', { noIndent: true }));
add(H3('Analisis Kepadatan (Heatmap)'));
add(P('Analisis kepadatan menunjukkan di mana objek terkumpul. Setiap titik diberi pengaruh yang menyebar dan melemah ke sekitarnya, lalu pengaruh semua titik dijumlahkan. Prinsip ini mirip dengan kernel density estimation (Silverman, 1986). Hasilnya ditampilkan sebagai gradasi warna: semakin panas warnanya, semakin padat sekolah di area itu.'));
add(H3('Pengelompokan DBSCAN'));
add(P('DBSCAN (Density-Based Spatial Clustering of Applications with Noise) adalah metode pengelompokan berdasarkan kepadatan titik (Ester dkk., 1996). Dua parameternya adalah eps, yaitu jarak maksimum antar titik yang dianggap bertetangga, dan minPts, yaitu jumlah minimum titik untuk membentuk kelompok. Titik yang tidak masuk kelompok mana pun disebut noise. Kelebihan DBSCAN adalah jumlah kelompok tidak perlu ditentukan di awal dan bentuk kelompok boleh tidak beraturan, sehingga cocok untuk sebaran sekolah di kota.'));
add(H2('Standar Jarak Jalan Kaki ke Halte'));
add(P('Pedoman Teknis Perekayasaan Tempat Perhentian Kendaraan Penumpang Umum (Direktorat Jenderal Perhubungan Darat, 1996) menetapkan jarak antar tempat henti berdasarkan tata guna lahan seperti pada Tabel 2.1. Semakin padat kegiatan di suatu kawasan, semakin rapat jarak halte yang disarankan.'));
add(Tbl('Jarak tempat henti menurut tata guna lahan', ['Tata guna lahan', 'Lokasi', 'Jarak tempat henti (m)'], [
  ['Pusat kegiatan sangat padat: pasar, pertokoan', 'CBD, kota', '200–300'],
  ['Padat: perkantoran, sekolah, jasa', 'Kota', '300–400'],
  ['Permukiman', 'Kota', '300–400'],
  ['Campuran padat: perumahan, sekolah, jasa', 'Pinggiran', '300–500'],
  ['Campuran jarang: perumahan, ladang, sawah, tanah kosong', 'Pinggiran', '500–1000'],
], [5, 2, 2], ['l', 'l', 'c']));
add(P('Sumber: Direktorat Jenderal Perhubungan Darat (1996).', { noIndent: true, p: { alignment: AlignmentType.CENTER } }));
add(P('Penelitian El-Geneidy dkk. (2014) di Montreal menunjukkan bahwa buffer 400 m di sekitar halte bus sudah lazim dipakai sebagai daerah layanan, dan 85% perjalanan dari rumah ke halte bus berjalan kaki tidak lebih dari sekitar 524 m. Berdasarkan dua acuan tersebut, project ini memakai radius bawaan **500 m** (sekitar 6 menit berjalan kaki dengan kecepatan 5 km/jam) dan menyediakan pilihan 300 m untuk kawasan padat.'));
add(H2('Vercel, Neon, dan Turf.js'));
add(P('Vercel adalah layanan hosting untuk aplikasi web yang menyediakan halaman statis sekaligus fungsi tanpa server (serverless function). Database untuk project ini disediakan oleh Neon, layanan PostgreSQL serverless yang mendukung ekstensi PostGIS dan terhubung langsung dengan Vercel melalui Vercel Marketplace (Neon, 2026; Vercel, 2026). Turf.js adalah pustaka JavaScript untuk analisis geospasial di browser (Turf.js, 2026). Pada project ini Turf.js dipakai sebagai cadangan, sehingga analisis tetap bisa berjalan di browser kalau database tidak bisa dihubungi.'));

// ---------------- BAB 3
add(H1('ANALISIS DAN PERANCANGAN'));
add(H2('Studi Kasus'));
add(P('Studi kasus yang diangkat adalah keterjangkauan halte transportasi umum dari sekolah di Kota Pekanbaru. Pertanyaan keputusan yang ingin dijawab adalah: **sekolah mana yang belum terjangkau halte dengan berjalan kaki, dan di mana halte baru sebaiknya ditambahkan?** Pengguna yang dibayangkan adalah pengelola transportasi kota, pihak sekolah, dan masyarakat umum yang ingin tahu halte terdekat dari suatu lokasi.'));
add(P('Analisis mencakup seluruh Kota Pekanbaru, sedangkan survei lapangan dilakukan di dua kawasan. Kawasan pertama berada di Rumbai, di sekitar SMPN 6, SMKN 5, SMAN 3, dan SMKN Olahraga. Kawasan kedua berada di pusat kota, di sekitar SMAN 1, SMPN 1, SMPN 5, SMPN 10, SMPN 14, dan SDN 51. Data survei di dua kawasan ini dipakai sebagai data detail sekaligus pembanding untuk data OSM.'));
add(H2('Data yang Digunakan'));
add(P('Data survei diambil pada 30 September 2026 menggunakan Avenza Maps lalu diekspor ke format XLS dan KML. Rinciannya dapat dilihat pada Tabel 3.1.'));
add(Tbl('Data hasil survei lapangan', ['File', 'Jenis geometri', 'Isi', 'Jumlah'], [
  ['PointAksesPendidikan.xls', 'Titik', 'Sekolah, halte, fasilitas pendukung, dan titik literasi', '31'],
  ['Area_sekolah.kml', 'Poligon', 'Batas area SDN 51, SMP 10, SMPN 14, SMPN 5, SMPN 6', '5'],
  ['Route_SMAN_Olahraga.kml', 'Garis (track)', 'Rute jalan kaki di sekitar SMKN Olahraga', '3'],
  ['Polyline_jalur.kml', 'Garis', 'Jalur jalan kaki di sekitar SMPN 6 dan SMPN 5', '3'],
], [3.6, 1.8, 4.2, 1.1], ['l', 'l', 'l', 'r']));
add(P('File polyline.xml yang ikut dikumpulkan ternyata berisi tiga jalur yang sama dengan Polyline_jalur.kml, hanya formatnya berupa track, sehingga cukup diimpor satu kali. Untuk menjangkau seluruh kota, data survei dilengkapi dengan data sekolah, halte, dan jalan dari OSM seperti pada Tabel 3.2.'));
add(Tbl('Data tambahan dari OpenStreetMap', ['File', 'Query Overpass', 'Jenis', 'Jumlah'], [
  ['export.kml', 'amenity=school (way)', 'Poligon', '211'],
  ['poligon.kml', 'amenity=school bernama (way, relation)', 'Poligon', '96'],
  ['titik.kml', 'amenity=school (node)', 'Titik', '73'],
  ['titiksekolah.kml', 'amenity=school bernama (out center)', 'Titik', '169'],
  ['haltepku.kml', 'highway=bus_stop, public_transport=platform, amenity=bus_station', 'Titik', '64'],
  ['jalankesekolah_1.kml', 'highway (jalan menuju sekolah)', 'Garis', '398'],
], [2.6, 4.4, 1.3, 1.1], ['l', 'l', 'l', 'r']));
add(H2('Pengolahan Data'));
add(P('Data mentah tidak bisa langsung dipakai karena formatnya berbeda-beda, ada yang ganda, dan ada yang bukan sekolah. Oleh karena itu penulis membuat skrip Python build_data.py yang membaca semua file sumber dan menghasilkan dua keluaran yang isinya sama, yaitu file seed.sql untuk database dan file GeoJSON untuk mode cadangan. Alurnya ditunjukkan pada Gambar 3.1.'));
add(Fig('alur_data.png', 'Alur pengolahan data', 14));
add(P('Langkah pertama adalah mengelompokkan 31 titik survei berdasarkan namanya. Titik yang diawali kata "Halte" masuk kategori halte; titik perpustakaan, pojok literasi, rumah baca, dan ruang belajar masuk kategori literasi; titik kantin, laboratorium, lapangan, main hall, masjid, UKS, dan TechnoPark masuk kategori fasilitas pendukung; sisanya adalah sekolah. Hasilnya 12 sekolah, 4 halte, 11 fasilitas pendukung, dan 4 titik literasi. Jenjang sekolah ditentukan dari nama dengan aturan pada Tabel 3.3.'));
add(Tbl('Aturan penentuan jenjang sekolah', ['Jenjang', 'Kata kunci pada nama', 'Contoh'], [
  ['TK/PAUD', 'TK, PAUD, PG, KB, taman kanak', 'Paud YLPI'],
  ['SD/MI', 'SD, SDN, SDIT, MI, MIN, sekolah dasar', 'SDN 114, MIN 1 Pekanbaru'],
  ['SMP/MTs', 'SMP, SMPN, MTs, MTsN, sekolah menengah pertama', 'MTsN 1 Kota Pekanbaru'],
  ['SMA/SMK/MA', 'SMA, SMAN, SMK, SMKN, MA, MAN', 'MAN 2 Kota Pekanbaru'],
  ['Campuran', 'Lebih dari satu jenjang dalam satu nama', 'TK, SMP, SMA Budhi Luhur'],
  ['Pesantren/Diniyah', 'Pesantren, ponpes, MDA, MDTA, tahfidz', 'Pondok Pesantren Babussalam'],
  ['SLB', 'SLB, luar biasa', 'SLB Cendana Pekanbaru'],
  ['Tidak diketahui', 'Tidak ada kata kunci di atas', 'Witama National Plus'],
], [2, 4, 3.5]));
add(P(`Langkah berikutnya adalah membersihkan data OSM. Dari ${B.poligon_raw_total} poligon pada dua file, terdapat ${B.poligon_unik} poligon unik karena ${B.poligon_raw_total - B.poligon_unik} poligon muncul di kedua file. Sebagian poligon ternyata bukan sekolah, melainkan ruang kelas, ruang BK, atau lapangan di dalam sekolah, bahkan ada kampus dan tempat kursus. Ringkasan proses pembersihan dapat dilihat pada Tabel 3.4.`));
add(Tbl('Hasil pembersihan data OSM', ['Tahap', 'Keterangan', 'Hasil'], [
  ['Gabung dua file poligon', 'Hapus poligon dengan ID OSM yang sama', `${B.poligon_unik} poligon`],
  ['Buang bukan sekolah', `Nama ruang kelas (VII 1, IX 3, …), R. BK, lapangan, STIE, kursus: ${B.buang_nama} poligon`, `${B.poligon_unik - B.buang_nama} poligon`],
  ['Buang bagian sekolah', `Poligon tanpa nama yang ≥ 80% berada di dalam sekolah lain: ${B.buang_dalam} poligon`, `${B.poligon_unik - B.buang_nama - B.buang_dalam} poligon`],
  ['Gabung nama sama', 'SMKN 2 Pekanbaru (8 bagian) dan Madrasah Diniyah Awaliyah (2 bagian) jadi MultiPolygon', `${B.hasil_bersih} poligon`],
  ['Titik sekolah OSM', `${B.titik_raw} titik, 2 dibuang (lapangan dan nama ganda); ${B.titik_osm_duplikat} titik sudah diwakili poligon`, `${B.titik_osm_akhir - B.titik_osm_duplikat} titik`],
  ['Titik sekolah tambahan', 'titiksekolah.kml: 96 titik adalah titik tengah poligon yang sudah ada dan 73 titik sama dengan titik.kml (dicek dari ID OSM)', '0 titik baru'],
  ['Titik sekolah survei', '9 dari 12 sekolah survei sudah ada di OSM', `${B.unit.survei} titik`],
  ['Halte OSM', `64 titik; 3 dibuang karena bukan halte umum (stasiun bus khusus Chevron, SPBU, agen travel); 3 digabung karena berjarak ≤ 30 m (Halte Bus UNRI dan Ramayana 2)`, `${nHalteOsm} halte`],
  ['Jalan OSM', 'Semua ruas dipakai apa adanya', '398 ruas'],
], [2.3, 5.2, 1.6], ['l', 'l', 'r']));
add(P(`Masalah terakhir adalah sekolah ganda antar sumber. Misalnya, titik survei "Smpn 14" dan poligon OSM "SMP Negeri 14 Pekanbaru" adalah sekolah yang sama. Sebaliknya, titik survei "Sd 149" letaknya hanya beberapa meter dari poligon "SMPN 6 Rumbai", tetapi jelas sekolah yang berbeda. Karena itu aturan yang dipakai adalah: titik dianggap ganda jika berjarak paling jauh 75 m dari sekolah OSM **dan** nama keduanya merujuk ke sekolah yang sama, yaitu jenjang dan nomornya sama, atau kata-kata namanya mirip. Setelah semua tahap ini, terdapat **${B.unit.total} unit sekolah** yang dianalisis, terdiri dari ${B.unit.osm_area} poligon OSM, ${B.unit.osm_titik} titik OSM, dan ${B.unit.survei} titik survei.`));
add(H2('Arsitektur Sistem'));
add(P('Arsitektur sistem ditunjukkan pada Gambar 3.2. Halaman web dibangun dengan Vite dan berisi OpenLayers untuk peta. Saat dibuka, halaman meminta data ke Vercel Functions di folder /api. Fungsi tersebut menjalankan query spasial ke database Neon (PostgreSQL + PostGIS) lalu mengembalikan hasilnya dalam format GeoJSON atau JSON.'));
add(Fig('arsitektur.png', 'Arsitektur sistem WebGIS Jangkau', 14.5));
add(P('Kalau API gagal, misalnya karena database sedang bermasalah, halaman otomatis mengambil salinan data dari file GeoJSON di folder /data dan menjalankan analisis yang sama dengan Turf.js di browser. Mekanisme ini sengaja dibuat supaya web tetap bisa didemokan walaupun koneksi ke database terganggu.'));
add(H2('Perancangan Basis Data'));
add(P('Rancangan basis data ditunjukkan pada Gambar 3.3. Terdapat lima tabel dan dua view. Tabel titik menyimpan semua data berbentuk titik, baik hasil survei, sekolah titik OSM, halte, maupun data yang ditambahkan admin. Tabel area_sekolah menyimpan poligon survei dan poligon OSM; kolom pusat berisi titik wakil poligon yang dipakai saat menghitung jarak. Tabel jalur menyimpan rute dan jalur survei, tabel jalan menyimpan 398 ruas jalan dari OSM, sedangkan tabel kategori berisi daftar kategori titik beserta warnanya.'));
add(Fig('erd.png', 'Rancangan basis data', 12.5));
add(P('View v_halte berisi semua titik berkategori halte, sedangkan view v_sekolah_analisis menggabungkan poligon OSM (memakai titik wakilnya) dengan titik sekolah yang bukan duplikat. Dengan view ini, kalau admin menambah sekolah atau halte baru, sekolah atau halte itu otomatis ikut dihitung pada analisis berikutnya. Semua kolom geometri memakai SRID 4326 dan diberi indeks GiST.'));
add(H2('Perancangan Analisis'));
add(P('Alur analisis keterjangkauan dan rekomendasi halte baru dapat dilihat pada Gambar 3.4. Parameter yang dipakai dirangkum pada Tabel 3.5.'));
add(Fig('alur_analisis.png', 'Alur analisis keterjangkauan dan usulan halte baru', 9));
add(Tbl('Parameter analisis', ['Parameter', 'Nilai', 'Alasan'], [
  ['Radius jangkauan', '500 m (bisa diatur 100–1000 m, pilihan cepat 300 m dan 1 km)', 'Acuan Dirjen Hubdat (1996) dan El-Geneidy dkk. (2014)'],
  ['Kecepatan jalan kaki', '5 km/jam (≈ 83 m/menit)', 'Untuk estimasi waktu tempuh'],
  ['Kecepatan sepeda', '15 km/jam', 'Pembanding waktu tempuh jalur'],
  ['eps DBSCAN', 'Sama dengan radius', 'Sekolah dalam satu kelompok bisa dilayani satu halte'],
  ['minPts DBSCAN', '2', 'Satu halte baru minimal melayani dua sekolah'],
  ['Jarak tempel ke jalan', '150 m', 'Halte usulan sebaiknya berada tepat di jalan (jalan OSM atau jalur survei)'],
  ['Jumlah usulan', '10 teratas', 'Diurutkan dari jumlah sekolah terbanyak'],
], [2.4, 3.6, 4], ['l', 'l', 'l']));
add(H2('Perancangan API'));
add(P('Komunikasi antara halaman web dan database dilakukan lewat lima endpoint yang dijelaskan pada Tabel 3.6. Semua pesan kesalahan dikembalikan dalam Bahasa Indonesia dengan format JSON.'));
add(Tbl('Daftar endpoint API', ['Endpoint', 'Method', 'Fungsi'], [
  ['/api/layers?layer=…', 'GET', 'Mengambil layer titik, area, jalur, jalan, sekolah, atau halte sebagai GeoJSON; bisa difilter kategori dan sumber'],
  ['/api/analysis?type=buffer', 'GET', 'Buffer halte dan status keterjangkauan setiap sekolah'],
  ['/api/analysis?type=recommend', 'GET', 'Usulan halte baru hasil DBSCAN'],
  ['/api/analysis?type=nearest', 'GET', 'Halte terdekat dan sekolah dalam radius dari titik yang diklik'],
  ['/api/analysis?type=overlay', 'GET', 'Perbandingan poligon survei dan OSM serta fasilitas di dalam area'],
  ['/api/stats', 'GET', 'Ringkasan jumlah data dan panjang jalur'],
  ['/api/titik', 'GET, POST, PUT, DELETE', 'Daftar titik dan CRUD admin (wajib header password admin)'],
  ['/api/health', 'GET', 'Cek koneksi database dan password admin'],
], [3.2, 1.8, 5], ['l', 'c', 'l']));
add(H2('Perancangan Antarmuka dan Visualisasi'));
add(P('Website terdiri dari empat halaman seperti pada Tabel 3.7. Sesuai ketentuan, halaman pertama tidak langsung menampilkan peta, tetapi berisi penjelasan profil web.'));
add(Tbl('Rancangan halaman', ['Halaman', 'Isi'], [
  ['Beranda', 'Profil web, latar belakang, wilayah dan sumber data, cara kerja analisis, fitur, dan pembuat. Bagian atas berisi diagram sebaran jarak sekolah ke halte (bukan peta).'],
  ['Peta', 'Peta OpenLayers dengan panel Layer (checkbox kategori, jenjang, sumber, area, jalur, hasil analisis, basemap) dan panel Analisis (radius, hasil buffer, usulan halte, query klik, overlay).'],
  ['Data', 'Tabel ringkasan, tabel keputusan jarak sekolah ke halte dengan pencarian dan filter, usulan halte, hasil overlay, panjang jalur, dan tautan unduh GeoJSON.'],
  ['Admin', 'Login dengan password, peta untuk memilih koordinat, formulir tambah dan ubah titik, serta tabel titik dengan tombol ubah dan hapus.'],
], [1.6, 8]));
add(P('Visualisasi data dirancang agar setiap jenis informasi punya cara tampil yang berbeda. Warna titik sekolah mengikuti warna seragam sekolah di Indonesia supaya mudah diingat: merah untuk SD, biru dongker untuk SMP, dan abu-abu untuk SMA. Halte digambar seperti rambu, yaitu kotak kuning berhuruf H. Rincian simbologi dapat dilihat pada Tabel 3.8.'));
add(Tbl('Simbologi peta', ['Objek', 'Bentuk', 'Warna / gaya', 'Keterangan'], [
  ['Sekolah', 'Lingkaran', 'Warna sesuai jenjang (merah SD, biru dongker SMP, abu-abu SMA, dst.)', 'Tidak diketahui: putih bergaris abu-abu'],
  ['Sekolah belum terjangkau', 'Lingkaran lebih besar', 'Garis tepi putus-putus biru dongker', 'Ukuran titik menunjukkan status'],
  ['Titik survei', 'Lingkaran', 'Garis tepi tebal biru dongker', 'Membedakan dari data OSM'],
  ['Halte', 'Kotak', 'Kuning dengan huruf H', 'Meniru rambu halte'],
  ['Fasilitas / literasi', 'Belah ketupat / segitiga', 'Abu-abu tua / ungu', 'Hanya data survei'],
  ['Area sekolah OSM', 'Poligon', 'Isi transparan sesuai jenjang', ''],
  ['Area sekolah survei', 'Poligon', 'Garis putus-putus biru dongker', ''],
  ['Rute / jalur survei', 'Garis', 'Abu-abu tebal / hijau toska putus-putus', ''],
  ['Jalan OSM', 'Garis', 'Oranye kecokelatan, lebih tebal untuk jalan utama', 'Tidak aktif saat peta dibuka'],
  ['Zona jangkauan', 'Poligon', 'Kuning transparan, tepi putus-putus', 'Hasil buffer'],
  ['Usulan halte baru', 'Kotak besar', 'Kuning dengan nomor peringkat', 'Hasil DBSCAN'],
], [2.3, 1.8, 3.6, 2.6]));

// ---------------- BAB 4
add(H1('IMPLEMENTASI DAN PEMBAHASAN'));
add(H2('Lingkungan Implementasi'));
add(P('Perangkat lunak dan layanan yang dipakai selama implementasi dapat dilihat pada Tabel 4.1.'));
add(Tbl('Lingkungan implementasi', ['Komponen', 'Teknologi', 'Keterangan'], [
  ['Peta', 'OpenLayers 10', 'Basemap OpenStreetMap dan citra Esri; CARTO jika API key diisi'],
  ['Analisis di browser', 'Turf.js 7', 'Untuk mode cadangan'],
  ['Frontend', 'Vite 6, HTML, CSS, JavaScript', 'Empat halaman (multi-page)'],
  ['Backend', 'Vercel Functions (Node.js 22), pg 8', 'Lima endpoint di folder /api'],
  ['Database', 'PostgreSQL + PostGIS 3 (Neon)', 'Terhubung lewat Vercel Marketplace; uji lokal memakai PostgreSQL 16'],
  ['Pengolahan data', 'Python 3, pandas, lxml, shapely, pyproj', 'Skrip build_data.py'],
  ['Pengujian', 'node:test, pytest, Playwright', 'Tes otomatis API, data, dan tampilan'],
  ['Survei', 'Avenza Maps', 'Pengambilan data 30 September 2026'],
], [2.2, 3.6, 4]));
add(H2('Implementasi Basis Data'));
add(P('Struktur tabel ditulis di file db/schema.sql, sedangkan isinya ada di db/seed.sql hasil skrip pengolahan data. Keduanya dijalankan sekaligus dengan perintah npm run db:setup. Skrip ini aman dijalankan berulang kali karena tabel lama dihapus dan dibuat ulang di dalam satu transaksi. Jumlah data setelah proses tersebut dapat dilihat pada Tabel 4.2.'));
add(Tbl('Jumlah data di database', ['Data', 'Jumlah'], [
  ['Titik hasil survei', nf(st.jumlah.titik_survei)],
  ['Area sekolah hasil survei', nf(st.jumlah.area_survei)],
  ['Rute dan jalur survei', nf(st.jumlah.jalur)],
  ['Poligon sekolah OSM (setelah dibersihkan)', nf(B.hasil_bersih)],
  ['Titik sekolah OSM', nf(B.titik_osm_akhir)],
  ['Halte (survei dan OSM)', nf(st.jumlah.halte)],
  ['Ruas jalan OSM', '398'],
  ['Unit sekolah yang dianalisis (v_sekolah_analisis)', nf(st.jumlah.sekolah_analisis)],
], [7, 2], ['l', 'r']));
add(P('Contoh query yang paling penting adalah query jarak setiap sekolah ke halte terdekat. Query ini dipakai oleh analisis buffer dan rekomendasi. Jarak dihitung dengan tipe geography sehingga hasilnya langsung dalam meter.', {}));
add(code([
  'SELECT s.uid, s.nama, s.jenjang, n.nama AS halte_terdekat, n.jarak',
  'FROM v_sekolah_analisis s',
  'LEFT JOIN LATERAL (',
  '  SELECT h.nama, ST_Distance(s.geom::geography, h.geom::geography) AS jarak',
  '  FROM v_halte h ORDER BY 2 LIMIT 1',
  ') n ON TRUE;',
]));
add(P('Untuk usulan halte baru, sekolah yang jaraknya lebih dari radius dikelompokkan dengan fungsi ST_ClusterDBSCAN setelah diproyeksikan ke UTM 47N. Titik tengah setiap kelompok dihitung dengan ST_Centroid, lalu ditempelkan ke jalan OSM atau jalur survei terdekat dengan ST_ClosestPoint jika jaraknya tidak lebih dari 150 m.'));
add(code([
  'ST_ClusterDBSCAN(ST_Transform(geom, 32647), eps := 500, minpoints := 2) OVER () AS cid',
]));
add(H2('Implementasi Halaman Web'));
add(P('[[Catatan untuk penulis: screenshot pada subbab ini diambil dari server lokal saat pengujian sehingga peta dasar (basemap) tidak tampil. Setelah web di-deploy ke Vercel, sebaiknya ganti gambar dengan screenshot dari web yang sudah online.]]', { noIndent: true }));
add(H3('Halaman Beranda', true));
const f41 = Fig('beranda.png', 'Halaman Beranda', 14);
add(P(`Halaman Beranda dapat dilihat pada ${f41.label}. Bagian atas berisi judul dan penjelasan singkat tentang Jangkau, lalu tombol untuk membuka peta dan tabel data. Di bawahnya ada diagram berbentuk jalan yang menunjukkan sebaran jarak sekolah ke halte terdekat. Setiap titik adalah satu sekolah, dan garis kuning menandai batas 500 m. Diagram ini sengaja dipakai sebagai pengganti peta karena ketentuan project meminta halaman utama tidak langsung menampilkan peta. Bagian bawah halaman berisi profil web, sumber data, cara kerja analisis, fitur, dan identitas pembuat.`));
add(f41);
add(H3('Halaman Peta dan Filter Layer'));
const f42 = Fig('peta.png', 'Halaman Peta dengan semua layer aktif', 14);
add(P(`${f42.label} memperlihatkan halaman Peta saat pertama dibuka. Panel di kiri berisi checkbox untuk setiap layer: titik (sekolah, titik survei, halte, fasilitas, literasi), jenjang sekolah, sumber data, area dan jalur, hasil analisis, serta pilihan peta dasar. Angka di sebelah kanan setiap pilihan menunjukkan jumlah fitur. Di pojok kanan atas ada label sumber data. Label "Database PostGIS" berarti data diambil langsung dari database.`));
add(f42);
const f43 = Fig('filter.png', 'Filter jenjang: hanya sekolah SD/MI yang ditampilkan', 14);
add(P(`Filter jenjang dicoba pada ${f43.label}. Semua jenjang kecuali SD/MI dimatikan, sehingga yang tampil hanya titik merah. Dari sini terlihat sebaran SD cukup merata, tetapi lebih rapat di bagian tengah kota. Filter ini bekerja langsung di browser tanpa memuat ulang data, sehingga perubahannya terasa cepat.`));
add(f43);
const f44 = Fig('popup.png', 'Popup informasi sekolah dan area sekolah hasil survei di sekitar SMPN 6', 14);
add(P(`Saat sebuah fitur diklik, muncul popup berisi atributnya. Pada ${f44.label}, titik survei SD 149 diklik dan popup menampilkan jenjang, sumber, status keterjangkauan, halte terdekat (${S500['Sd 149'].halte_terdekat}), dan jaraknya (${meter(S500['Sd 149'].jarak_halte_m)}). Gambar ini juga memperlihatkan poligon area sekolah hasil survei (garis putus-putus biru dongker) yang tumpang tindih dengan poligon OSM SMPN 6 Rumbai, titik-titik fasilitas berbentuk belah ketupat, serta jalur jalan kaki hasil survei berwarna hijau toska.`));
add(f44);
add(H3('Analisis Buffer dan Usulan Halte Baru'));
const f45 = Fig('buffer.png', 'Hasil analisis buffer 500 m dan usulan halte baru', 14);
add(P(`${f45.label} menunjukkan tab Analisis setelah tombol "Jalankan analisis" ditekan dengan radius 500 m. Zona kuning di sekitar halte adalah hasil buffer. Panel kiri menampilkan ringkasan: ${nf(r500.terlayani)} dari ${nf(r500.total)} sekolah (${nf(r500.persen, 1)}%) berada dalam 500 m dari halte, lengkap dengan grafik batang per jenjang. Di bawahnya ada daftar sekolah yang paling jauh dari halte. Kotak kuning bernomor di peta adalah usulan halte baru hasil DBSCAN, dan nomornya menunjukkan peringkat. Baris tabel dan item usulan bisa diklik untuk memperbesar peta ke lokasi tersebut.`));
add(f45);
add(H3('Spatial Query: Cari Halte Terdekat'));
const f46 = Fig('klik.png', 'Spatial query: halte terdekat dan sekolah di sekitar titik yang diklik', 14);
add(P(`Fitur spatial query dapat dilihat pada ${f46.label}. Setelah pilihan "Klik peta untuk mencari halte terdekat" diaktifkan, pengguna cukup mengklik lokasi mana pun, misalnya rumah. Sistem menggambar lingkaran radius dari titik itu, lalu menampilkan nama halte terdekat beserta jarak dan perkiraan waktu jalan kakinya, serta daftar sekolah di dalam radius. Query ini dijalankan di database dengan ST_DWithin dan ST_Distance.`));
add(f46);
add(H3('Peta Kepadatan Sekolah'));
const f47 = Fig('heatmap.png', 'Peta kepadatan sekolah (heatmap) dan usulan halte baru', 14);
add(P(`${f47.label} menampilkan layer heatmap. Warna oranye dan kuning menunjukkan kawasan dengan sekolah yang paling rapat, yaitu di sekitar pusat kota dan beberapa titik di selatan. Kalau dibandingkan dengan letak usulan halte (kotak bernomor), sebagian besar usulan memang jatuh di kawasan yang padat sekolah. Hal ini wajar karena DBSCAN membentuk kelompok dari sekolah-sekolah yang saling berdekatan.`));
add(f47);
add(H3('Overlay Area Survei dan OSM'));
const f48 = Fig('overlay.png', 'Perbandingan area sekolah hasil survei dengan poligon OSM', 14);
add(P(`Hasil overlay ditampilkan pada ${f48.label}. Tombol "Bandingkan area" menghitung nilai IoU setiap poligon survei terhadap poligon OSM yang paling banyak berpotongan dengannya. Di peta terlihat area SMPN 14 dan SDN 51 hasil survei (garis putus-putus) berada di atas poligon OSM masing-masing. Pembahasan angkanya ada pada subbab 4.4.3.`));
add(f48);
add(H3('Halaman Data'));
const f49 = Fig('data.png', 'Halaman Data (bagian atas)', 13);
add(P(`Halaman Data pada ${f49.label} berisi angka-angka yang sama dengan di peta, tetapi dalam bentuk tabel. Tabel keputusan "Jarak sekolah ke halte terdekat" bisa dicari berdasarkan nama dan difilter berdasarkan jenjang, status, dan radius. Pada gambar, kotak pencarian diisi "SMP Negeri 14" sehingga hanya satu baris yang tampil, yaitu SMP Negeri 14 Pekanbaru yang berjarak ${meter(S500['SMP Negeri 14 Pekanbaru'].jarak_halte_m)} dari ${S500['SMP Negeri 14 Pekanbaru'].halte_terdekat}. Halaman ini juga menyediakan tautan untuk mengunduh data GeoJSON.`));
add(f49);
add(H3('Halaman Admin'));
const f410 = Fig('admin.png', 'Halaman Admin untuk mengelola titik di database', 14);
add(P(`${f410.label} memperlihatkan halaman Admin setelah login. Admin bisa mengklik peta untuk mengisi koordinat secara otomatis, lalu mengisi nama, kategori, jenjang, dan keterangan. Setelah disimpan, titik langsung masuk ke tabel titik di database dan ikut dihitung pada analisis berikutnya. Pada gambar terlihat titik uji "Halte Uji UI <b>tebal</b>" yang sengaja diberi tag HTML. Tag tersebut tampil sebagai teks biasa, yang berarti input sudah aman dari penyisipan kode HTML.`));
add(f410);
add(H3('Mode Cadangan dan Tampilan Ponsel'));
const f411 = Fig('cadangan.png', 'Label sumber data saat mode cadangan aktif', 8);
add(P(`Jika database tidak bisa dihubungi, label di peta berubah menjadi "Data cadangan (GeoJSON)" seperti pada ${f411.label}. Pada mode ini peta dan analisis tetap berjalan menggunakan file GeoJSON dan Turf.js. Mode ini juga bisa dipaksa dengan menambahkan ?cadangan=1 di alamat halaman, sehingga mudah ditunjukkan saat presentasi.`));
add(f411);
const f412 = Fig('mobile.png', 'Halaman Peta pada layar ponsel', 6);
add(P(`Tampilan di layar ponsel dapat dilihat pada ${f412.label}. Peta ditampilkan di bagian atas, sedangkan panel layer dan analisis pindah ke bawah peta. Menu navigasi diringkas menjadi tombol "Menu".`));
add(f412);

add(H2('Hasil Analisis dan Pembahasan'));
add(H3('Keterjangkauan Sekolah terhadap Halte', true));
add(P('Hasil analisis buffer untuk tiga nilai radius dapat dilihat pada Tabel 4.3, sedangkan rinciannya per jenjang untuk radius 500 m ada pada Tabel 4.4.'));
add(Tbl('Keterjangkauan sekolah pada beberapa radius', ['Radius', 'Waktu jalan kaki', 'Sekolah terjangkau', 'Persentase'],
  ['300', '500', '1000'].map((r) => [meter(Number(r)), menit(Number(r) / 83.33), `${nf(R[r].ringkasan.terlayani)} dari ${nf(R[r].ringkasan.total)}`, `${nf(R[r].ringkasan.persen, 1)}%`]),
  [2, 2.5, 3, 2], ['l', 'l', 'r', 'r']));
add(Tbl('Keterjangkauan per jenjang pada radius 500 m', ['Jenjang', 'Jumlah sekolah', 'Terjangkau', 'Persentase'],
  J.filter((j) => r500.per_jenjang[j]).map((j) => [j, nf(r500.per_jenjang[j].total), nf(r500.per_jenjang[j].terlayani), pct(r500.per_jenjang[j].terlayani, r500.per_jenjang[j].total)]),
  [3, 2, 2, 2], ['l', 'r', 'r', 'r']));
const r1000 = R['1000'].ringkasan;
const pj = (j) => r500.per_jenjang[j] || { total: 0, terlayani: 0 };
const jauh = R['500'].terjauh;
add(P(`Dengan ${nf(nHalte)} halte di database, ${nf(r500.terlayani)} sekolah (${nf(r500.persen, 1)}%) berada dalam 500 m dari halte. Jika radius diperbesar menjadi 1 km, jumlahnya naik menjadi ${nf(r1000.terlayani)} sekolah (${nf(r1000.persen, 1)}%). Artinya ada ${nf(r1000.terlayani - r500.terlayani)} sekolah yang jaraknya ke halte antara 500 m dan 1 km, atau sekitar 6 sampai 12 menit berjalan kaki. Sekolah-sekolah ini sebenarnya tidak terlalu jauh, tetapi sudah melewati jarak jalan kaki yang nyaman menurut acuan pada BAB 2.`));
add(P(`Dilihat per jenjang (Tabel 4.4), SMA/SMK/MA sedikit lebih baik (${pct(pj('SMA/SMK/MA').terlayani, pj('SMA/SMK/MA').total)}) dibanding SMP/MTs (${pct(pj('SMP/MTs').terlayani, pj('SMP/MTs').total)}) dan SD/MI (${pct(pj('SD/MI').terlayani, pj('SD/MI').total)}). Hal ini cukup masuk akal karena banyak SMA berada di jalan utama yang dilewati bus. Yang paling rendah adalah pesantren dan madrasah diniyah (${nf(pj('Pesantren/Diniyah').terlayani)} dari ${nf(pj('Pesantren/Diniyah').total)}) serta SLB (${nf(pj('SLB').terlayani)} dari ${nf(pj('SLB').total)}), yang umumnya berada di kawasan permukiman atau pinggiran kota.`));
add(P(`Halte dari OSM sebagian besar berada di koridor utama seperti Jalan Jenderal Sudirman dan Jalan H.R. Soebrantas, sehingga sekolah di sepanjang koridor tersebut hampir semuanya terjangkau. Sebaliknya, sekolah terjauh berada di pinggiran kota bagian timur laut, misalnya ${jauh[0].nama} (${meter(jauh[0].jarak_halte_m)}), ${jauh[1].nama} (${meter(jauh[1].jarak_halte_m)}), dan ${jauh[2].nama} (${meter(jauh[2].jarak_halte_m)}).`));
add(P(`Di kawasan survei Rumbai, SMKN 5 dan SMAN 3 sudah terjangkau karena dekat dengan Halte Stadion (${meter(S500['SMK Negeri 5 Pekanbaru'].jarak_halte_m)} dan ${meter(S500['SMA Negeri 3 Pekanbaru'].jarak_halte_m)}). Namun SMPN 6 Rumbai, SD 149, dan SD/MTsN Al-Ittihad yang letaknya tidak jauh dari situ masih berjarak ${meter(S500['Sd 149'].jarak_halte_m)} sampai ${meter(S500['SMPN 6 Rumbai'].jarak_halte_m)} dari halte terdekat. Ini menunjukkan bahwa di dalam satu kawasan pun keterjangkauan halte bisa sangat berbeda.`));
add(H3('Usulan Halte Baru'));
const lokasi = (k, i) => `${k.snap ? (KJ[i].nama === 'Jalan tanpa nama' ? 'Jalan tanpa nama (OSM)' : KJ[i].nama) : 'Belum di jalan (tidak ada jalan ≤ 150 m)'} (${nf(k.lat, 5)}; ${nf(k.lon, 5)})`;
const kandRows = kand.map((k, i) => [String(k.rank), nf(k.jumlah_sekolah), k.sekolah.slice(0, 4).join(', ') + (k.sekolah.length > 4 ? `, dan ${k.sekolah.length - 4} lainnya` : ''), meter(k.jarak_rata_m), lokasi(k, i)]);
add(P(`Hasil pengelompokan DBSCAN pada radius 500 m menghasilkan usulan halte seperti pada Tabel 4.5. Setiap baris adalah satu titik usulan, beserta jumlah sekolah yang akan terjangkau jika halte dibangun di titik tersebut.`));
add(Tbl('Sepuluh usulan halte baru teratas (radius 500 m)', ['No', 'Jumlah sekolah', 'Nama sekolah', 'Jarak rata-rata', 'Lokasi (lat, lon)'], kandRows, [0.7, 1.4, 4.6, 1.5, 3.1], ['c', 'r', 'l', 'r', 'l']));
const nSnap = kand.filter((k) => k.snap).length;
add(P(`Usulan peringkat pertama dapat melayani ${kand[0].jumlah_sekolah} sekolah sekaligus dengan jarak rata-rata ${meter(kand[0].jarak_rata_m)}. Sebanyak ${nSnap} dari ${kand.length} usulan berhasil ditempelkan tepat di jalan, sehingga lokasinya realistis untuk dibangun halte. Usulan yang tidak ditempel berarti tidak ada jalan OSM atau jalur survei dalam 150 m dari titik tengah kelompoknya; untuk usulan seperti ini lokasi pastinya perlu dicek langsung di lapangan. Sebagian besar usulan berada di kawasan yang padat sekolah, sesuai dengan pola heatmap pada Gambar 4.7.`));
add(P(`Sebanyak ${nf(H.recommend.terisolasi)} sekolah belum terjangkau tetapi letaknya terpencar sehingga tidak masuk kelompok mana pun. Sekolah seperti ini lebih cocok dilayani dengan menambah halte satu per satu di rute yang sudah ada.`));
if (rumbai) {
  const ri = kand.indexOf(rumbai);
  add(P(`Untuk kawasan survei Rumbai, usulan peringkat ${rumbai.rank} melayani ${rumbai.sekolah.join(', ')} dengan jarak rata-rata hanya ${meter(rumbai.jarak_rata_m)}. Titiknya ditempelkan ke ${KJ[ri].nama} di depan SMPN 6 Rumbai. Usulan ini cocok dengan pengamatan saat survei, karena siswa ketiga sekolah tersebut memang harus berjalan cukup jauh ke Halte SMK Olahraga.`));
}
add(H3('Perbandingan Area Survei dan OSM'));
add(Tbl('Perbandingan poligon area sekolah hasil survei dan OSM', ['Area survei', 'Poligon OSM', 'Luas survei', 'Luas OSM', 'Luas irisan', 'IoU'],
  ov.banding.map((b) => [b.nama_survei, b.nama_osm, `${nf(b.luas_survei_m2)} m²`, `${nf(b.luas_osm_m2)} m²`, `${nf(b.luas_irisan_m2)} m²`, nf(b.iou, 3)]),
  [2.4, 2.8, 1.6, 1.6, 1.6, 1], ['l', 'l', 'r', 'r', 'r', 'r']));
const smp10 = ov.banding.find((b) => b.nama_survei === 'SMP 10');
const smpn5 = ov.banding.find((b) => b.nama_survei.startsWith('SMPN 5'));
add(P(`Tabel 4.6 menunjukkan bahwa semua poligon survei berpotongan dengan poligon OSM sekolah yang sama, jadi posisi survei sudah benar. Kecocokan tertinggi ada pada SMP 10 dengan IoU ${nf(smp10.iou, 3)}, artinya batas yang direkam saat survei hampir sama dengan batas di OSM. Nilai terendah ada pada SMPN 5 (IoU ${nf(smpn5.iou, 3)}). Poligon survei SMPN 5 luasnya hanya ${nf(smpn5.luas_survei_m2)} m², sedangkan poligon OSM-nya ${nf(smpn5.luas_osm_m2)} m². Hampir seluruh poligon survei berada di dalam poligon OSM, sehingga perbedaan ini kemungkinan terjadi karena saat survei hanya sebagian halaman sekolah yang dikelilingi, bukan karena posisinya salah.`));
add(H3('Fasilitas di Dalam Area Sekolah'));
add(Tbl('Fasilitas dan titik literasi di dalam area sekolah', ['Area', 'Sumber', 'Jumlah', 'Titik'],
  ov.fasilitas_dalam_area.map((f) => [f.area, f.sumber === 'osm' ? 'OSM' : 'Survei', String(f.jumlah), f.daftar.join(', ') || '–']),
  [2.6, 1.3, 1.4, 5.1], ['l', 'l', 'r', 'l']));
add(P('Overlay titik fasilitas terhadap area sekolah (Tabel 4.7) memperlihatkan hal yang serupa. Poligon survei SMPN 6 hanya memuat 3 titik fasilitas, sedangkan poligon OSM SMPN 6 Rumbai yang lebih luas memuat 7 titik, termasuk kantin dan laboratorium. Artinya, kantin dan laboratorium SMPN 6 yang disurvei sebenarnya berada di dalam lingkungan sekolah, hanya saja di luar batas poligon yang direkam. Untuk survei berikutnya, batas area sebaiknya direkam mengelilingi pagar sekolah secara penuh.'));
add(H3('Panjang Jalur Survei'));
add(Tbl('Panjang dan waktu tempuh jalur survei', ['Jalur', 'Jenis', 'Panjang', 'Jalan kaki', 'Sepeda'],
  jalur.map((j) => [j.nama, j.jenis === 'rute' ? 'Rute (track)' : 'Jalur (polyline)', meter(j.panjang_m), menit(j.jalan_menit), menit(j.sepeda_menit)]),
  [3.6, 2, 1.4, 1.4, 1.2], ['l', 'l', 'r', 'r', 'r']));
add(P('Panjang jalur dihitung dengan ST_Length pada tipe geography. Ketiga rute di sekitar SMKN Olahraga panjangnya hampir sama, sekitar 1,1 km, karena rute tersebut direkam berulang pada lintasan yang mirip. Jalur 2 paling panjang, yaitu sekitar 2 km atau 24 menit berjalan kaki, karena perekaman dilakukan pergi-pulang dari SMPN 6 sampai ke jalan besar. Waktu tempuh ini memberi gambaran bahwa jalan kaki lebih dari 10 menit sudah cukup berat bagi siswa, terutama di siang hari.'));
add(H3('Keterbatasan'));
add(list([
  `Data halte berasal dari survei (${nHalteSvy} halte) dan OSM (${nHalteOsm} halte). Halte OSM terkumpul di beberapa koridor utama, sehingga halte Trans Metro Pekanbaru di koridor lain yang belum dipetakan belum ikut dihitung. Dengan data halte resmi dari Dinas Perhubungan, persentase keterjangkauan kemungkinan lebih tinggi.`,
  'Jarak dihitung lurus, bukan menyusuri jalan, sehingga jarak sebenarnya bisa lebih panjang, terutama jika ada sungai atau jalan buntu.',
  'Data OSM dibuat oleh sukarelawan. Masih ada 25 poligon sekolah tanpa nama dan beberapa sekolah yang mungkin belum dipetakan.',
  'Usulan halte belum mempertimbangkan rute bus yang ada, lebar jalan, dan jumlah siswa di setiap sekolah.',
], 'bullet'));

add(H2('Pengujian'));
add(P('Pengujian dilakukan dengan dua cara, yaitu pengujian otomatis dan pengujian black-box. Pengujian otomatis terdiri dari 32 tes pipeline data (pytest), 59 tes API, database, dan analisis cadangan (node:test), serta 7 tes tampilan end-to-end dengan Playwright. Semua tes lulus. Salah satu tes penting adalah tes kesamaan hasil, yang memastikan status setiap sekolah dari database sama dengan hasil analisis cadangan di browser. Hasil pengujian black-box dapat dilihat pada Tabel 4.9.'));
add(Tbl('Pengujian black-box', ['No', 'Skenario', 'Hasil yang diharapkan', 'Hasil'], [
  ['1', 'Membuka Beranda', 'Profil web tampil, tidak ada peta data', 'Sesuai'],
  ['2', 'Mematikan checkbox Halte', 'Layer halte hilang dari peta', 'Sesuai'],
  ['3', 'Mematikan jenjang selain SD/MI', 'Hanya sekolah SD/MI yang tampil', 'Sesuai'],
  ['4', 'Menjalankan analisis radius 500 m', 'Zona buffer, ringkasan, dan usulan halte tampil', 'Sesuai'],
  ['5', 'Klik peta saat mode query aktif', 'Halte terdekat dan sekolah dalam radius tampil', 'Sesuai'],
  ['6', 'Database tidak bisa dihubungi', 'Label "Data cadangan", peta dan analisis tetap jalan', 'Sesuai'],
  ['7', 'Parameter radius=abc atau lon=999', 'Pesan kesalahan 400, bukan error server', 'Sesuai'],
  ['8', 'Login admin dengan password salah', 'Pesan "Password admin salah", data tidak berubah', 'Sesuai'],
  ['9', 'Tambah titik dengan nama kosong atau koordinat di luar Pekanbaru', 'Ditolak dengan pesan kesalahan', 'Sesuai'],
  ['10', 'Tambah, ubah, lalu hapus titik', 'Data berubah di database dan tabel', 'Sesuai'],
  ['11', 'Nama titik berisi tag HTML', 'Tampil sebagai teks biasa', 'Sesuai'],
  ['12', 'Membuka Peta di layar 390 px', 'Tata letak menyesuaikan, tidak ada error', 'Sesuai'],
], [0.6, 3.8, 4, 1.2], ['c', 'l', 'l', 'c']));
add(H2('Pemenuhan Ketentuan Project'));
add(P('Tabel 4.10 merangkum bagaimana setiap ketentuan project dipenuhi oleh WebGIS Jangkau.'));
add(Tbl('Pemenuhan ketentuan project', ['No', 'Ketentuan', 'Implementasi'], [
  ['1', 'OpenLayers sebagai basemap service', 'OpenLayers 10 dengan basemap OpenStreetMap dan citra Esri, ditambah CARTO bila API key diisi'],
  ['2', 'Filter data dengan checkbox atau list box', 'Checkbox kategori, jenjang, sumber, area, jalur, dan hasil analisis; list box di halaman Data'],
  ['3', 'Halaman home berisi profil web', 'Beranda berisi profil, data, cara kerja, fitur, dan pembuat tanpa peta'],
  ['4', 'Visualisasi data', 'Warna jenjang, bentuk per kategori, ukuran titik sesuai status, garis putus-putus, heatmap'],
  ['5', 'Minimal 3 layer data', 'Titik, area sekolah (survei dan OSM), rute dan jalur survei, jalan OSM, ditambah layer hasil analisis'],
  ['6', 'Analisis spasial untuk keputusan', 'Buffer, spatial query, overlay (IoU), density (heatmap), DBSCAN untuk usulan halte, dan panjang jalur'],
  ['7', 'Data spasial dikelola dengan database', 'PostgreSQL + PostGIS di Neon, view analisis, dan CRUD lewat halaman Admin'],
  ['8', 'Presentasi 9 dan 16 Desember 2026', 'Web online di Vercel dengan mode cadangan untuk demo'],
  ['9', 'Laporan akhir sampai BAB 4', 'Laporan ini'],
], [0.6, 3.4, 6], ['c', 'l', 'l']));

// ---------------- DAFTAR PUSTAKA
toc.push({ level: 1, text: 'DAFTAR PUSTAKA', key: 'DAFTAR PUSTAKA' });
body.push(new Paragraph({ heading: HeadingLevel.HEADING_1, pageBreakBefore: true, alignment: AlignmentType.CENTER, spacing: { after: 360 },
  children: [run('DAFTAR PUSTAKA', { size: 28, bold: true })] }));
const pustaka = [
  'Butler, H., Daly, M., Doyle, A., Gillies, S., Hagen, S., & Schaub, T. (2016). _The GeoJSON format_ (RFC 7946). Internet Engineering Task Force. https://doi.org/10.17487/RFC7946',
  'Direktorat Jenderal Perhubungan Darat. (1996). _Keputusan Direktur Jenderal Perhubungan Darat Nomor 271/HK.105/DRJD/96 tentang Pedoman Teknis Perekayasaan Tempat Perhentian Kendaraan Penumpang Umum_. Departemen Perhubungan.',
  'El-Geneidy, A., Grimsrud, M., Wasfi, R., Tétreault, P., & Surprenant-Legault, J. (2014). New evidence on walking distances to transit stops: Identifying redundancies and gaps using variable service areas. _Transportation, 41_(1), 193–210. https://doi.org/10.1007/s11116-013-9508-z',
  'Ester, M., Kriegel, H.-P., Sander, J., & Xu, X. (1996). A density-based algorithm for discovering clusters in large spatial databases with noise. Dalam _Proceedings of the Second International Conference on Knowledge Discovery and Data Mining_ (hlm. 226–231). AAAI Press.',
  'Fu, P., & Sun, J. (2010). _Web GIS: Principles and applications_. Esri Press.',
  'Haklay, M. (2010). How good is volunteered geographical information? A comparative study of OpenStreetMap and Ordnance Survey datasets. _Environment and Planning B: Planning and Design, 37_(4), 682–703. https://doi.org/10.1068/b35097',
  'Jaccard, P. (1912). The distribution of the flora in the alpine zone. _New Phytologist, 11_(2), 37–50.',
  'Longley, P. A., Goodchild, M. F., Maguire, D. J., & Rhind, D. W. (2015). _Geographic information science and systems_ (Edisi ke-4). Wiley.',
  'Melissa, D., Alwinda, Y., & Sebayang, M. (2019). Tinjauan kesesuaian fasilitas halte bus Trans Metro Pekanbaru koridor 3 terhadap standar Dirjend Perhubungan Darat tahun 2012 dan Wahana Tata Nugraha tahun 2010. _Jurnal Online Mahasiswa Fakultas Teknik Universitas Riau, 6_(1).',
  'Neon. (2026). _Neon Postgres native integration for Vercel_. Diakses 18 November 2026, dari https://neon.tech/docs/guides/vercel-native-integration',
  'Obe, R. O., & Hsu, L. S. (2021). _PostGIS in action_ (Edisi ke-3). Manning.',
  'OpenLayers. (2026). _OpenLayers documentation_. Diakses 18 November 2026, dari https://openlayers.org/doc/',
  'Open Geospatial Consortium. (2008). _OGC KML_ (Versi 2.2.0, OGC 07-147r2). Open Geospatial Consortium.',
  'OpenStreetMap Foundation. (2026). _Copyright and license_. Diakses 18 November 2026, dari https://www.openstreetmap.org/copyright',
  'PostGIS Project. (2026). _PostGIS documentation_. Diakses 18 November 2026, dari https://postgis.net/documentation/',
  'Prahasta, E. (2009). _Sistem informasi geografis: Konsep-konsep dasar (perspektif geodesi & geomatika)_. Informatika Bandung.',
  'Silverman, B. W. (1986). _Density estimation for statistics and data analysis_. Chapman and Hall.',
  'Turf.js. (2026). _Turf: Advanced geospatial analysis for browsers and Node.js_. Diakses 18 November 2026, dari https://turfjs.org/',
  'Vercel. (2026). _Postgres on Vercel_. Diakses 18 November 2026, dari https://vercel.com/docs/postgres',
];
pustaka.forEach((s) => body.push(new Paragraph({ children: rich(s), alignment: AlignmentType.LEFT, indent: { left: 567, hanging: 567 }, spacing: { line: 276, after: 160 } })));

// ================================================================= BAGIAN AWAL
const cover = [
  center('LAPORAN AKHIR PROJECT', 28, { bold: true, before: 400 }),
  center('SISTEM INFORMASI GEOGRAFIS', 28, { bold: true, after: 600 }),
  center('WEBGIS JANGKAU: ANALISIS KETERJANGKAUAN HALTE', 28, { bold: true }),
  center('TRANSPORTASI UMUM TERHADAP SEKOLAH', 28, { bold: true }),
  center('DI KOTA PEKANBARU', 28, { bold: true, after: 900 }),
  center('[[Logo Politeknik Caltex Riau]]', 24, { after: 900 }),
  center('Disusun oleh:', 24, { after: 120 }),
  center('David Geraldo Joshua Siagian', 24, { bold: true }),
  center('NIM 2455301043', 24),
  center('Kelas 3 TI A', 24, { after: 500 }),
  center('Dosen Pengampu:', 24),
  center('[[Nama dosen pengampu SIG]]', 24, { after: 1000 }),
  center('PROGRAM STUDI TEKNIK INFORMATIKA', 24, { bold: true }),
  center('JURUSAN TEKNOLOGI INFORMASI', 24, { bold: true }),
  center('POLITEKNIK CALTEX RIAU', 24, { bold: true }),
  center('PEKANBARU', 24, { bold: true }),
  center('2026', 24, { bold: true }),
];

const front = [];
const frontHead = (t, first) => {
  toc.unshift; // (diisi terpisah)
  return new Paragraph({ heading: HeadingLevel.HEADING_1, pageBreakBefore: !first, alignment: AlignmentType.CENTER, spacing: { after: 360 }, children: [run(t, { size: 28, bold: true })] });
};
front.push(frontHead('KATA PENGANTAR', true));
[
  'Puji syukur penulis panjatkan kepada Tuhan Yang Maha Esa karena atas berkat dan penyertaan-Nya penulis dapat menyelesaikan project akhir mata kuliah Sistem Informasi Geografis yang berjudul "WebGIS Jangkau: Analisis Keterjangkauan Halte Transportasi Umum terhadap Sekolah di Kota Pekanbaru".',
  'Project ini berangkat dari pertanyaan sederhana: seberapa jauh siswa harus berjalan kaki dari sekolah ke halte terdekat? Untuk menjawabnya, penulis melakukan survei lapangan, mengolah data OpenStreetMap, menyimpan semuanya di database spasial, lalu membangun WebGIS yang bisa diakses lewat browser.',
  'Penulis mengucapkan terima kasih kepada [[nama dosen pengampu]] selaku dosen pengampu mata kuliah Sistem Informasi Geografis atas bimbingannya, serta kepada teman-teman yang membantu selama survei dan pengerjaan project.',
  'Penulis menyadari laporan ini masih memiliki kekurangan, terutama pada kelengkapan data halte. Oleh karena itu, kritik dan saran sangat penulis harapkan untuk perbaikan ke depan. Semoga laporan dan WebGIS ini bermanfaat.',
].forEach((s) => front.push(P(s)));
front.push(new Paragraph({ alignment: AlignmentType.RIGHT, spacing: { before: 360 }, children: rich('Pekanbaru, [[tanggal]] Desember 2026') }));
front.push(new Paragraph({ alignment: AlignmentType.RIGHT, spacing: { before: 960 }, children: [run('Penulis')] }));

const tocLine = (e, indentTwip) => {
  const pg = PAGES[e.key] ?? '…';
  return new Paragraph({ spacing: { line: 300, after: 40 }, indent: { left: indentTwip, hanging: e.level === 'g' || e.level === 't' ? 1134 : 0, right: 567 },
    tabStops: [{ type: TabStopType.RIGHT, position: CW, leader: LeaderType.DOT }],
    children: [run(e.text, { bold: e.level === 1 }), new TextRun({ font: FONT, size: 24, children: [new Tab(), String(pg)] })] });
};
const frontEntries = [
  { level: 1, text: 'KATA PENGANTAR', key: 'KATA PENGANTAR' },
  { level: 1, text: 'DAFTAR ISI', key: 'DAFTAR ISI' },
  { level: 1, text: 'DAFTAR GAMBAR', key: 'DAFTAR GAMBAR' },
  { level: 1, text: 'DAFTAR TABEL', key: 'DAFTAR TABEL' },
];
front.push(frontHead('DAFTAR ISI'));
[...frontEntries, ...toc.filter((e) => typeof e.level === 'number')].forEach((e) => front.push(tocLine(e, e.level === 1 ? 0 : e.level === 2 ? 567 : 1134)));
front.push(frontHead('DAFTAR GAMBAR'));
toc.filter((e) => e.level === 'g').forEach((e) => front.push(tocLine(e, 1134)));
front.push(frontHead('DAFTAR TABEL'));
toc.filter((e) => e.level === 't').forEach((e) => front.push(tocLine(e, 1134)));

fs.writeFileSync(path.join(DIR, 'toc.json'), JSON.stringify([...frontEntries, ...toc], null, 1));

// ================================================================= DOKUMEN
const margin = { top: 1701, right: 1701, bottom: 1701, left: 2268 };
const footer = (fmt) => ({ default: new Footer({ children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ font: FONT, size: 22, children: [PageNumber.CURRENT] })] })] }) });
const doc = new Document({
  creator: 'David Geraldo Joshua Siagian',
  title: 'Laporan Akhir Project SIG - WebGIS Jangkau',
  styles: {
    default: { document: { run: { font: FONT, size: 24 } } },
    paragraphStyles: [
      { id: 'Heading1', name: 'Heading 1', basedOn: 'Normal', next: 'Normal', quickFormat: true, run: { font: FONT, size: 28, bold: true, color: '000000' }, paragraph: { spacing: { before: 0, after: 360 }, keepNext: true, outlineLevel: 0 } },
      { id: 'Heading2', name: 'Heading 2', basedOn: 'Normal', next: 'Normal', quickFormat: true, run: { font: FONT, size: 24, bold: true, color: '000000' }, paragraph: { spacing: { before: 240, after: 120 }, keepNext: true, outlineLevel: 1 } },
      { id: 'Heading3', name: 'Heading 3', basedOn: 'Normal', next: 'Normal', quickFormat: true, run: { font: FONT, size: 24, italics: true, color: '000000' }, paragraph: { spacing: { before: 200, after: 100 }, keepNext: true, outlineLevel: 2 } },
    ],
  },
  numbering: { config: [
    { reference: 'angka', levels: [{ level: 0, format: LevelFormat.DECIMAL, text: '%1.', alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 567, hanging: 397 } } } }] },
    { reference: 'bullet', levels: [{ level: 0, format: LevelFormat.BULLET, text: '•', alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 567, hanging: 397 } } } }] },
  ] },
  sections: [
    { properties: { page: { size: { width: 11906, height: 16838 }, margin: { top: 1134, right: 1134, bottom: 1134, left: 1418 } } }, children: cover },
    { properties: { page: { size: { width: 11906, height: 16838 }, margin, pageNumbers: { start: 1, formatType: NumberFormat.LOWER_ROMAN } } }, footers: footer(), children: front },
    { properties: { page: { size: { width: 11906, height: 16838 }, margin, pageNumbers: { start: 1, formatType: NumberFormat.DECIMAL } } }, footers: footer(), children: body },
  ],
});
Packer.toBuffer(doc).then((b) => {
  fs.writeFileSync(path.join(DIR, 'Laporan_Akhir_SIG_Jangkau.docx'), b);
  console.log('docx ok, entri toc:', toc.length);
});

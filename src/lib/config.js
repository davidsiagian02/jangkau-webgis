// Konstanta bersama frontend (nilai mengikuti docs/design.md)
export const RADIUS = { default: 500, min: 100, max: 1000, preset: [300, 500], apiMin: 50, apiMax: 3000 };
export const SNAP_M = 150;
export const TOP_N = 10;
export const KECEPATAN = { jalan_kmh: 5, sepeda_kmh: 15 };
export const BBOX = { minLat: 0.3, maxLat: 0.7, minLon: 101.2, maxLon: 101.7 };
export const PUSAT_PETA = [101.447, 0.515];

// Warna & bentuk penanda. Warna jenjang mengikuti warna seragam sekolah di Indonesia.
export const KATEGORI = {
  sekolah: { nama: 'Sekolah', warna: '#13284b', bentuk: 'lingkaran' },
  halte: { nama: 'Halte', warna: '#f5c400', bentuk: 'kotak' },
  fasilitas: { nama: 'Fasilitas pendukung', warna: '#495057', bentuk: 'belah ketupat' },
  literasi: { nama: 'Literasi', warna: '#7048e8', bentuk: 'segitiga' },
};

export const JENJANG = {
  'TK/PAUD': '#f08c00',
  'SD/MI': '#b3262d',
  'SMP/MTs': '#1f3a68',
  'SMA/SMK/MA': '#7a828c',
  Campuran: '#0b7285',
  'Pesantren/Diniyah': '#2b8a3e',
  SLB: '#9c36b5',
  'Tidak diketahui': '#ffffff',
};

export const JENJANG_KET = {
  'SD/MI': 'merah, seperti seragam SD',
  'SMP/MTs': 'biru dongker, seperti seragam SMP',
  'SMA/SMK/MA': 'abu-abu, seperti seragam SMA',
};

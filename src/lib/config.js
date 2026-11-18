// Konstanta bersama frontend (nilai mengikuti docs/design.md)
export const RADIUS = { default: 500, min: 100, max: 1000, preset: [300, 500], apiMin: 50, apiMax: 3000 };
export const SNAP_M = 150;
export const TOP_N = 10;
export const KECEPATAN = { jalan_kmh: 5, sepeda_kmh: 15 };
export const BBOX = { minLat: 0.3, maxLat: 0.7, minLon: 101.2, maxLon: 101.7 };
export const PUSAT_PETA = [101.447, 0.515];

export const KATEGORI = {
  sekolah: { nama: 'Sekolah', warna: '#1f4e8c', ikon: 'S' },
  halte: { nama: 'Halte', warna: '#d9480f', ikon: 'H' },
  fasilitas: { nama: 'Fasilitas Pendukung', warna: '#2b8a3e', ikon: 'F' },
  literasi: { nama: 'Literasi', warna: '#7048e8', ikon: 'L' },
};

export const JENJANG = {
  'TK/PAUD': '#f59f00',
  'SD/MI': '#e03131',
  'SMP/MTs': '#1971c2',
  'SMA/SMK/MA': '#5f3dc4',
  Campuran: '#0c8599',
  'Pesantren/Diniyah': '#2f9e44',
  SLB: '#c2255c',
  'Tidak diketahui': '#868e96',
};

-- Skema database WebGIS JANGKAU (PostgreSQL + PostGIS)
-- Aman dijalankan berulang kali: tabel lama dihapus lalu dibuat ulang.
CREATE EXTENSION IF NOT EXISTS postgis;

DROP VIEW IF EXISTS v_sekolah_analisis;
DROP VIEW IF EXISTS v_halte;
DROP TABLE IF EXISTS titik, area_sekolah, jalur, kategori CASCADE;

-- Referensi kategori titik (dipakai untuk legenda & validasi)
CREATE TABLE kategori (
  kode  text PRIMARY KEY,
  nama  text NOT NULL,
  warna text NOT NULL,
  ikon  text NOT NULL
);
INSERT INTO kategori (kode, nama, warna, ikon) VALUES
  ('sekolah',   'Sekolah',             '#13284b', 'lingkaran'),
  ('halte',     'Halte',               '#f5c400', 'kotak'),
  ('fasilitas', 'Fasilitas pendukung', '#495057', 'belah ketupat'),
  ('literasi',  'Literasi',            '#7048e8', 'segitiga');

-- Titik: hasil survei, sekolah titik OSM, halte (survei + OSM), dan input admin
CREATE TABLE titik (
  id           serial PRIMARY KEY,
  nama         text NOT NULL CHECK (length(trim(nama)) > 0),
  kategori     text NOT NULL REFERENCES kategori(kode),
  jenjang      text,
  deskripsi    text,
  sumber       text NOT NULL DEFAULT 'admin' CHECK (sumber IN ('survei', 'osm', 'admin')),
  osm_id       text,
  waktu_survei timestamptz,
  duplikat_osm text,          -- uid unit OSM yang sama (hasil dedup), NULL = sekolah berdiri sendiri
  geom         geometry(Point, 4326) NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX titik_geom_gix ON titik USING gist (geom);
CREATE INDEX titik_kategori_idx ON titik (kategori);

-- Area sekolah: poligon survei dan poligon OSM yang sudah dibersihkan
CREATE TABLE area_sekolah (
  id      serial PRIMARY KEY,
  nama    text NOT NULL,
  sumber  text NOT NULL CHECK (sumber IN ('survei', 'osm')),
  osm_id  text,
  jenjang text,
  tags    jsonb,
  pusat   geometry(Point, 4326) NOT NULL,          -- titik wakil (point on surface)
  geom    geometry(MultiPolygon, 4326) NOT NULL
);
CREATE INDEX area_sekolah_geom_gix ON area_sekolah USING gist (geom);

-- Jalur survei: rute (track) dan jalur (polyline)
CREATE TABLE jalur (
  id            serial PRIMARY KEY,
  nama          text NOT NULL,
  jenis         text NOT NULL CHECK (jenis IN ('rute', 'jalur')),
  waktu_mulai   timestamptz,
  waktu_selesai timestamptz,
  geom          geometry(LineString, 4326) NOT NULL
);
CREATE INDEX jalur_geom_gix ON jalur USING gist (geom);

-- Semua halte yang dipakai analisis
CREATE VIEW v_halte AS
  SELECT id, nama, sumber, geom FROM titik WHERE kategori = 'halte';

-- Unit analisis sekolah: poligon OSM (titik wakil) + titik sekolah yang bukan duplikat
CREATE VIEW v_sekolah_analisis AS
  SELECT 'osm-a' || id AS uid, nama, jenjang, sumber, pusat AS geom
    FROM area_sekolah WHERE sumber = 'osm'
  UNION ALL
  SELECT (CASE WHEN sumber = 'osm' THEN 'osm-t' ELSE 'svy-' END) || id AS uid, nama, jenjang, sumber, geom
    FROM titik WHERE kategori = 'sekolah' AND duplikat_osm IS NULL;

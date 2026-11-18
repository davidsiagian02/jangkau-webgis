// Query SQL (PostGIS). Jarak memakai geography (meter), klaster memakai UTM 47N (EPSG:32647).
const fc = (inner) => `SELECT json_build_object('type','FeatureCollection','features',COALESCE(json_agg(f),'[]'::json)) AS fc FROM (${inner}) f`;
const feat = (props, geom = 'geom') => `json_build_object('type','Feature','id',id,'properties',json_build_object(${props}),'geometry',ST_AsGeoJSON(${geom},7)::json)`;

export const LAYER = {
  titik: fc(`SELECT ${feat(`'id',id,'nama',nama,'kategori',kategori,'jenjang',jenjang,'deskripsi',deskripsi,'sumber',sumber,
    'osm_id',osm_id,'waktu_survei',waktu_survei,'duplikat_osm',duplikat_osm,'updated_at',updated_at`)} AS f
    FROM titik WHERE ($1::text[] IS NULL OR kategori = ANY($1)) AND ($2::text IS NULL OR sumber = $2) ORDER BY id`),
  area: fc(`SELECT ${feat(`'id',id,'nama',nama,'sumber',sumber,'osm_id',osm_id,'jenjang',jenjang,
    'luas_m2',round(ST_Area(geom::geography)::numeric,1)`)} AS f
    FROM area_sekolah WHERE ($1::text[] IS NULL OR TRUE) AND ($2::text IS NULL OR sumber = $2) ORDER BY id`),
  jalur: fc(`SELECT ${feat(`'id',id,'nama',nama,'jenis',jenis,'waktu_mulai',waktu_mulai,'waktu_selesai',waktu_selesai,
    'panjang_m',round(ST_Length(geom::geography)::numeric,1)`)} AS f
    FROM jalur WHERE ($1::text[] IS NULL OR TRUE) AND ($2::text IS NULL OR TRUE) ORDER BY id`),
  sekolah: fc(`SELECT json_build_object('type','Feature','id',uid,'properties',json_build_object('uid',uid,'nama',nama,
    'jenjang',jenjang,'sumber',sumber),'geometry',ST_AsGeoJSON(geom,7)::json) AS f
    FROM v_sekolah_analisis WHERE ($1::text[] IS NULL OR TRUE) AND ($2::text IS NULL OR sumber = $2) ORDER BY uid`),
  halte: fc(`SELECT ${feat(`'id',id,'nama',nama,'sumber',sumber,'kategori','halte'`)} AS f
    FROM v_halte WHERE ($1::text[] IS NULL OR TRUE) AND ($2::text IS NULL OR sumber = $2) ORDER BY id`),
};

// Jarak tiap sekolah ke halte terdekat
const JARAK = `SELECT s.uid, s.nama, s.jenjang, s.sumber, s.geom, n.nama AS halte_terdekat, n.jarak
  FROM v_sekolah_analisis s
  LEFT JOIN LATERAL (SELECT h.nama, ST_Distance(s.geom::geography, h.geom::geography) AS jarak
                     FROM v_halte h ORDER BY 2 LIMIT 1) n ON TRUE`;

export const BUFFER_SEKOLAH = `SELECT j.*, ST_AsGeoJSON(j.geom, 7)::json AS gj FROM (${JARAK}) j ORDER BY j.uid`;
export const BUFFER_UNION = `SELECT ST_AsGeoJSON(ST_Union(ST_Buffer(geom::geography, $1, 16)::geometry), 7)::json AS geom FROM v_halte`;

export const RECOMMEND = `
WITH s AS (${JARAK}),
tak AS (SELECT * FROM s WHERE jarak IS NULL OR jarak > $1),
cl AS (SELECT tak.*, ST_ClusterDBSCAN(ST_Transform(geom, 32647), eps := $1, minpoints := 2) OVER () AS cid FROM tak),
c AS (SELECT cid, ST_Transform(ST_Centroid(ST_Collect(ST_Transform(geom, 32647))), 4326) AS geom
      FROM cl WHERE cid IS NOT NULL GROUP BY cid),
sn AS (SELECT c.cid, c.geom, j.snap_geom FROM c
       LEFT JOIN LATERAL (SELECT ST_ClosestPoint(jl.geom, c.geom) AS snap_geom FROM jalur jl
                          WHERE ST_DWithin(jl.geom::geography, c.geom::geography, $2)
                          ORDER BY ST_Distance(jl.geom::geography, c.geom::geography) LIMIT 1) j ON TRUE),
k AS (SELECT cid, COALESCE(snap_geom, geom) AS geom, snap_geom IS NOT NULL AS snap FROM sn),
d AS (SELECT k.cid, k.geom, k.snap, t.nama, ST_Distance(k.geom::geography, t.geom::geography) AS jarak
      FROM k JOIN tak t ON ST_DWithin(k.geom::geography, t.geom::geography, $1))
SELECT ST_X(geom) AS lon, ST_Y(geom) AS lat, snap, count(*)::int AS jumlah_sekolah,
       json_agg(nama ORDER BY jarak) AS sekolah, round(avg(jarak)::numeric, 1)::float AS jarak_rata_m,
       (SELECT count(*)::int FROM cl WHERE cid IS NULL) AS terisolasi
FROM d GROUP BY cid, geom, snap
ORDER BY jumlah_sekolah DESC, jarak_rata_m ASC LIMIT $3`;
export const ISOLATED = `
WITH s AS (${JARAK}), tak AS (SELECT * FROM s WHERE jarak IS NULL OR jarak > $1),
cl AS (SELECT ST_ClusterDBSCAN(ST_Transform(geom, 32647), eps := $1, minpoints := 2) OVER () AS cid FROM tak)
SELECT count(*)::int AS n FROM cl WHERE cid IS NULL`;

export const NEAREST_HALTE = `SELECT nama, ST_Distance(geom::geography, ST_SetSRID(ST_MakePoint($1,$2),4326)::geography) AS jarak
  FROM v_halte ORDER BY 2 LIMIT 1`;
export const NEAREST_SEKOLAH = `SELECT nama, jenjang, ST_Distance(geom::geography, p::geography) AS jarak
  FROM v_sekolah_analisis, ST_SetSRID(ST_MakePoint($1,$2),4326) AS p
  WHERE ST_DWithin(geom::geography, p::geography, $3) ORDER BY 3`;

export const OVERLAY_BANDING = `
SELECT s.nama AS nama_survei, o.nama AS nama_osm, ST_Area(s.geom::geography) AS ls, ST_Area(o.geom::geography) AS lo,
       COALESCE(ST_Area(ST_Intersection(s.geom, o.geom)::geography), 0) AS li
FROM area_sekolah s
LEFT JOIN LATERAL (SELECT o.nama, o.geom FROM area_sekolah o
                   WHERE o.sumber = 'osm' AND ST_Intersects(o.geom, s.geom)
                   ORDER BY ST_Area(ST_Intersection(o.geom, s.geom)) DESC LIMIT 1) o ON TRUE
WHERE s.sumber = 'survei' ORDER BY s.id`;
export const OVERLAY_FASILITAS = `
SELECT a.nama AS area, a.sumber, count(t.id)::int AS jumlah,
       COALESCE(json_agg(t.nama ORDER BY t.id) FILTER (WHERE t.id IS NOT NULL), '[]'::json) AS daftar
FROM area_sekolah a
LEFT JOIN titik t ON t.kategori IN ('fasilitas', 'literasi') AND ST_Contains(a.geom, t.geom)
GROUP BY a.id HAVING count(t.id) > 0 OR a.sumber = 'survei' ORDER BY a.id`;

export const STATS = `SELECT
  (SELECT count(*)::int FROM titik WHERE sumber = 'survei') AS titik_survei,
  (SELECT count(*)::int FROM v_sekolah_analisis WHERE sumber = 'osm') AS sekolah_osm,
  (SELECT count(*)::int FROM v_halte) AS halte,
  (SELECT count(*)::int FROM jalur) AS jalur,
  (SELECT count(*)::int FROM area_sekolah WHERE sumber = 'survei') AS area_survei,
  (SELECT count(*)::int FROM v_sekolah_analisis) AS sekolah_analisis`;
export const STATS_KATEGORI = `SELECT kategori AS k, count(*)::int AS n FROM titik GROUP BY 1 ORDER BY 1`;
export const STATS_JENJANG = `SELECT COALESCE(jenjang, 'Tidak diketahui') AS k, count(*)::int AS n FROM v_sekolah_analisis GROUP BY 1 ORDER BY 1`;
export const STATS_JALUR = `SELECT nama, jenis, ST_Length(geom::geography) AS m FROM jalur ORDER BY id`;

export const TITIK_ONE = `SELECT ${feat(`'id',id,'nama',nama,'kategori',kategori,'jenjang',jenjang,'deskripsi',deskripsi,'sumber',sumber,
  'osm_id',osm_id,'waktu_survei',waktu_survei,'duplikat_osm',duplikat_osm,'updated_at',updated_at`)} AS f FROM titik WHERE id = $1`;
export const TITIK_INSERT = `INSERT INTO titik (nama, kategori, jenjang, deskripsi, sumber, geom)
  VALUES ($1, $2, $3, $4, 'admin', ST_SetSRID(ST_MakePoint($5, $6), 4326)) RETURNING id`;
export const TITIK_UPDATE = `UPDATE titik SET nama = $2, kategori = $3, jenjang = $4, deskripsi = $5,
  geom = ST_SetSRID(ST_MakePoint($6, $7), 4326), updated_at = now() WHERE id = $1 RETURNING id`;
export const TITIK_DELETE = `DELETE FROM titik WHERE id = $1 RETURNING id`;

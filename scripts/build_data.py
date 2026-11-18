"""Ubah data survei (Avenza) + OpenStreetMap menjadi GeoJSON cadangan dan seed SQL PostGIS.

Pakai:  python3 scripts/build_data.py data/source public/data db/seed.sql
"""
import json
import math
import re
import sys
from pathlib import Path

import pandas as pd
from lxml import etree
import numpy as np
import shapely
from pyproj import Transformer
from shapely.geometry import LineString, MultiPolygon, Point, Polygon, mapping, shape
from shapely.ops import unary_union

NS = {"k": "http://www.opengis.net/kml/2.2", "gx": "http://www.google.com/kml/ext/2.2"}
_TR = Transformer.from_crs(4326, 32647, always_xy=True)
UTM = lambda g: shapely.transform(g, lambda xy: np.column_stack(_TR.transform(xy[:, 0], xy[:, 1])))

KELAS = re.compile(r"^(VII|VIII|IX|X|XI|XII)\b|^R\. ?BK|^Lapangan\b|Bimbingan Konseling", re.I)
BUKAN_SEKOLAH = re.compile(r"\bSTIE\b|Kursus", re.I)
TANPA_NAMA = "Sekolah (tanpa nama di OSM)"
DEDUP_SURVEI_M = 75
GABUNG_NAMA_M = 300
GABUNG_HALTE_M = 30


# ---------------------------------------------------------------- klasifikasi
def classify_titik(title):
    """Kategori & jenjang untuk titik survei, dibaca dari judul titik."""
    t = title.strip().lower()
    if t.startswith("halte"):
        return ("halte", None)
    if re.search(r"perpustakaan|literasi|rumah baca|ruang belajar", t):
        return ("literasi", None)
    if re.search(r"kantin|\blab|lapangan|main hall|masjid|\buks\b|technopark", t):
        return ("fasilitas", None)
    if re.search(r"\bsd", t):
        return ("sekolah", "SD/MI")
    if re.search(r"\bsmp|\bmts", t):
        return ("sekolah", "SMP/MTs")
    if re.search(r"\bsma|\bsmk|\bman?\b", t):
        return ("sekolah", "SMA/SMK/MA")
    return ("sekolah", "Tidak diketahui")


_LEVEL = {
    "TK/PAUD": r"\b(tk|paud|pg|kb|taman kanak|playgroup|kindergarten)\b",
    "SD/MI": r"\b(sd|sdn|sdit|mi|min|mis|sekolah dasar|elementary|ibtida\w*)\b",
    "SMP/MTs": r"\b(smp|smpn|smpit|mts|mtsn|mtss|tsanawiyah|sekolah menengah pertama|junior high)\b",
    "SMA/SMK/MA": r"\b(sma|sman|smas|smk|smkn|skma|man|ma(?!')|aliyah|sekolah menengah atas|sekolah menengah kejuruan|senior high)\b",
}
_PESANTREN = r"pesantren|ponpes|pondok|diniyah awaliyah|\bmda\b|\bmdta\b|\bmdt\b|\btpa\b|taman pendidikan al|tahfidz|kuttab|ma'had"
_GRADES = {"1-6": "SD/MI", "7-9": "SMP/MTs", "10-12": "SMA/SMK/MA", "9-12": "SMA/SMK/MA"}


def jenjang_osm(name, grades):
    n = (name or "").lower()
    if re.search(r"\bslb\b|luar biasa", n):
        return "SLB"
    hits = [lvl for lvl, rx in _LEVEL.items() if re.search(rx, n)]
    if len(hits) >= 2:
        return "Campuran"
    if hits:
        return hits[0]
    if n and re.search(_PESANTREN, n):
        return "Pesantren/Diniyah"
    if grades:
        return _GRADES.get(grades.strip(), "Campuran" if "-" in grades else "Tidak diketahui")
    return "Tidak diketahui"


_KEY_LVL = [("sd", r"\b(sd|sdn|sdit|mi|min|sekolah dasar)\b"), ("smp", r"\b(smp|smpn|mts|mtsn|sekolah menengah pertama)\b"),
            ("smk", r"\b(smk|smkn|sekolah menengah kejuruan)\b"), ("sma", r"\b(sma|sman|man|ma(?!'))\b"),
            ("slb", r"\bslb\b"), ("tk", r"\b(tk|paud)\b")]
_STOP = {"negeri", "negri", "n", "pekanbaru", "kota", "sekolah", "school", "dan", "pku"}


def _key(name):
    n = name.lower()
    lvl = next((k for k, rx in _KEY_LVL if re.search(rx, n)), None)
    m = re.search(r"\d+", n)
    return lvl, (int(m.group()) if m else None)


def same_school(a, b):
    """Apakah dua nama merujuk ke sekolah yang sama? (dipakai untuk dedup antar sumber)"""
    if not a or not b or a == TANPA_NAMA or b == TANPA_NAMA:
        return True
    (la, na), (lb, nb) = _key(a), _key(b)
    if la and lb and na is not None and nb is not None:
        return (la, na) == (lb, nb)
    if la and lb and la != lb:
        return False
    tok = lambda s: {w for w in re.findall(r"[a-z0-9]+", s.lower()) if w not in _STOP}
    ta, tb = tok(a), tok(b)
    return bool(ta and tb) and len(ta & tb) / len(ta | tb) >= 0.5


# ---------------------------------------------------------------- pembaca KML
def _coords(text):
    return [tuple(map(float, c.split(",")[:2])) for c in text.split()]


def _tags(pm):
    return {d.get("name"): d.findtext("k:value", namespaces=NS) for d in pm.iter("{%s}Data" % NS["k"])}


def read_osm_kml(path):
    """Placemark OSM → list dict {osm_id, nama, tags, geom}."""
    out = []
    for pm in etree.parse(str(path)).iter("{%s}Placemark" % NS["k"]):
        tags = _tags(pm)
        pt = pm.find(".//k:Point/k:coordinates", NS)
        if pt is not None:
            geom = Point(_coords(pt.text)[0])
        else:
            polys = []
            for poly in pm.findall(".//k:Polygon", NS):
                outer = _coords(poly.find("k:outerBoundaryIs//k:coordinates", NS).text)
                inner = [_coords(i.text) for i in poly.findall("k:innerBoundaryIs//k:coordinates", NS)]
                polys.append(Polygon(outer, inner))
            geom = polys[0] if len(polys) == 1 else MultiPolygon(polys)
        nama = (tags.get("name") or pm.findtext("k:name", namespaces=NS) or "").strip() or None
        out.append({"osm_id": tags.get("@id"), "nama": nama, "tags": tags, "geom": geom})
    return out


def read_points_geojson(path):
    out = []
    for f in json.loads(Path(path).read_text())["features"]:
        g = shape(f["geometry"])
        if g.geom_type != "Point":
            g = g.centroid
        p = f.get("properties") or {}
        tags = p.get("tags", p)
        out.append({"osm_id": p.get("@id") or p.get("id"), "nama": (tags.get("name") or "").strip() or None,
                    "tags": tags, "geom": g})
    return out


# ---------------------------------------------------------------- pembersihan OSM
def clean_osm(features):
    """Bersihkan poligon sekolah OSM: buang ruang/kelas & non-sekolah, buang poligon tanpa nama
    yang ≥80% di dalam sekolah lain, gabungkan nama sama (≤300 m) jadi MultiPolygon."""
    seen, feats = set(), []
    for f in features:
        if f["osm_id"] in seen:
            continue
        seen.add(f["osm_id"])
        n = f["nama"] or ""
        if KELAS.search(n) or BUKAN_SEKOLAH.search(n):
            continue
        feats.append({**f, "utm": UTM(f["geom"])})

    keep = []
    for f in feats:
        inside = False
        for g in feats:
            if g is f or g["utm"].area <= f["utm"].area:
                continue
            if not g["utm"].intersects(f["utm"]):
                continue
            share = g["utm"].intersection(f["utm"]).area / f["utm"].area
            same = f["nama"] and g["nama"] and f["nama"].lower() == g["nama"].lower()
            if share >= 0.8 and (not f["nama"] or same):
                inside = True
                break
        if not inside:
            keep.append(f)

    merged, used = [], set()
    for i, f in enumerate(keep):
        if i in used:
            continue
        group = [f]
        if f["nama"]:
            for j in range(i + 1, len(keep)):
                g = keep[j]
                if j not in used and g["nama"] and g["nama"].lower() == f["nama"].lower() \
                        and g["utm"].distance(f["utm"]) <= GABUNG_NAMA_M:
                    group.append(g)
                    used.add(j)
        geom = unary_union([g["geom"] for g in group])
        if geom.geom_type == "Polygon":
            geom = MultiPolygon([geom])
        tags = {}
        for g in group:
            tags.update({k: v for k, v in g["tags"].items() if v})
        merged.append({"osm_id": ",".join(g["osm_id"] for g in group), "nama": f["nama"] or TANPA_NAMA,
                       "tags": tags, "geom": geom,
                       "jenjang": jenjang_osm(f["nama"], tags.get("grades"))})
    return merged


def dedup_points(points, radius_m, key=lambda p: True, existing=()):
    """Gabungkan titik yang berjarak ≤ radius_m (titik pertama dipertahankan)."""
    kept = list(existing)
    out = []
    for p in points:
        u = UTM(p["geom"])
        if any(key(p, q) and u.distance(UTM(q["geom"])) <= radius_m for q in kept):
            continue
        kept.append(p)
        out.append(p)
    return out


# ---------------------------------------------------------------- data survei
def read_survei_titik(path):
    df = pd.read_excel(path, sheet_name=0)
    out = []
    for r in df.itertuples(index=False):
        title = str(r.Title).strip()
        kategori, jenjang = classify_titik(title)
        desc = None if pd.isna(r.Description) else str(r.Description).strip()
        out.append({"nama": title, "kategori": kategori, "jenjang": jenjang, "deskripsi": desc,
                    "waktu_survei": f"{r[1]}+07:00" if not pd.isna(r[1]) else None,
                    "geom": Point(float(r.Longitude), float(r.Latitude))})
    return out


def read_survei_area(path):
    out = []
    for pm in etree.parse(str(path)).iter("{%s}Placemark" % NS["k"]):
        c = pm.find(".//k:coordinates", NS)
        out.append({"nama": pm.findtext("k:name", namespaces=NS).strip(),
                    "geom": MultiPolygon([Polygon(_coords(c.text))])})
    return out


def read_jalur(path, jenis, prefix):
    out = []
    for pm in etree.parse(str(path)).iter("{%s}Placemark" % NS["k"]):
        nama = pm.findtext("k:name", namespaces=NS).strip()
        track = pm.find(".//gx:Track", NS)
        if track is not None:
            cs = [tuple(map(float, c.text.split()[:2])) for c in track.findall("gx:coord", NS)]
            whens = [w.text for w in track.findall("k:when", NS)]
            t0, t1 = whens[0], whens[-1]
        else:
            cs = _coords(pm.find(".//k:LineString/k:coordinates", NS).text)
            t0 = pm.findtext(".//k:TimeStamp/k:when", namespaces=NS)
            t1 = None
        out.append({"nama": f"{prefix}{nama}", "jenis": jenis, "waktu_mulai": t0, "waktu_selesai": t1,
                    "geom": LineString(cs)})
    return out


# ---------------------------------------------------------------- keluaran
def _round(obj):
    if isinstance(obj, float):
        return round(obj, 7)
    if isinstance(obj, (list, tuple)):
        return [_round(x) for x in obj]
    if isinstance(obj, dict):
        return {k: _round(v) for k, v in obj.items()}
    return obj


def _fc(rows, props):
    return {"type": "FeatureCollection", "features": [
        {"type": "Feature", "id": r.get("uid", r.get("id")),
         "properties": {k: r.get(k) for k in props},
         "geometry": _round(mapping(r["geom"]))} for r in rows]}


def _q(v):
    if v is None:
        return "NULL"
    if isinstance(v, (int, float)):
        return repr(v)
    return "'" + str(v).replace("'", "''") + "'"


def build(src_dir, out_dir, seed_path):
    src_dir, out_dir, seed_path = Path(src_dir), Path(out_dir), Path(seed_path)
    out_dir.mkdir(parents=True, exist_ok=True)
    seed_path.parent.mkdir(parents=True, exist_ok=True)

    # --- titik
    titik = []
    for r in read_survei_titik(src_dir / "titik_survei.xls"):
        titik.append({**r, "sumber": "survei", "osm_id": None})
    survei_halte = [t for t in titik if t["kategori"] == "halte"]

    osm_area_raw = []
    for f in sorted(src_dir.glob("osm_sekolah_poligon*.kml")):
        osm_area_raw += read_osm_kml(f)
    osm_area = clean_osm(osm_area_raw)

    osm_pt_raw = []
    for f in sorted(src_dir.glob("osm_sekolah_titik*.kml")):
        osm_pt_raw += read_osm_kml(f)
    osm_pt = dedup_points([p for p in osm_pt_raw if p["nama"] and not KELAS.search(p["nama"])], GABUNG_NAMA_M,
                          key=lambda p, q: p["nama"].lower() == q["nama"].lower())
    for p in osm_pt:
        titik.append({"nama": p["nama"], "kategori": "sekolah", "jenjang": jenjang_osm(p["nama"], p["tags"].get("grades")),
                      "deskripsi": p["tags"].get("addr:street"), "sumber": "osm", "osm_id": p["osm_id"],
                      "waktu_survei": None, "geom": p["geom"]})

    halte_raw = []
    for f in sorted(src_dir.glob("halte_osm*")):
        halte_raw += read_points_geojson(f) if f.suffix.lower() in (".geojson", ".json") else read_osm_kml(f)
    halte_osm = dedup_points(halte_raw, GABUNG_HALTE_M, key=lambda p, q: True, existing=survei_halte)
    for h in halte_osm:
        titik.append({"nama": h["nama"] or "Halte (OSM)", "kategori": "halte", "jenjang": None,
                      "deskripsi": h["tags"].get("route_ref") or h["tags"].get("network"), "sumber": "osm",
                      "osm_id": h["osm_id"], "waktu_survei": None, "geom": h["geom"]})
    for i, t in enumerate(titik, 1):
        t["id"] = i

    # --- area
    area = []
    for r in read_survei_area(src_dir / "area_sekolah_survei.kml"):
        area.append({**r, "sumber": "survei", "osm_id": None, "jenjang": classify_titik(r["nama"])[1], "tags": None})
    for r in osm_area:
        area.append({**r, "sumber": "osm"})
    for i, a in enumerate(area, 1):
        a["id"] = i
        a["luas_m2"] = round(UTM(a["geom"]).area, 1)
        a["pusat"] = a["geom"].representative_point()

    # --- jalur
    jalur = read_jalur(src_dir / "rute_sman_olahraga.kml", "rute", "Rute SMAN Olahraga - ") + \
        read_jalur(src_dir / "jalur_survei.kml", "jalur", "")
    for i, j in enumerate(jalur, 1):
        j["id"] = i
        j["panjang_m"] = round(UTM(j["geom"]).length, 1)

    # --- unit analisis sekolah (aturan sama dengan view v_sekolah_analisis)
    # Titik sekolah (OSM/survei) dianggap duplikat bila <= 75 m dari unit OSM dan namanya sekolah yang sama.
    unit = []
    for a in area:
        if a["sumber"] == "osm":
            unit.append({"uid": f"osm-a{a['id']}", "nama": a["nama"], "jenjang": a["jenjang"], "sumber": "osm",
                         "utm": UTM(a["geom"]), "geom": a["pusat"]})
    for sumber in ("osm", "survei"):
        for t in titik:
            if t["kategori"] != "sekolah" or t["sumber"] != sumber:
                continue
            u = UTM(t["geom"])
            match = next((x for x in unit if x["utm"].distance(u) <= DEDUP_SURVEI_M
                          and same_school(t["nama"], x["nama"])), None)
            t["duplikat_osm"] = match["uid"] if match else None
            if not match:
                unit.append({"uid": f"{'osm-t' if sumber == 'osm' else 'svy-'}{t['id']}", "nama": t["nama"],
                             "jenjang": t["jenjang"], "sumber": sumber, "utm": u, "geom": t["geom"]})
    for t in titik:
        t.setdefault("duplikat_osm", None)

    # --- GeoJSON
    files = {
        "titik": _fc(titik, ["id", "nama", "kategori", "jenjang", "deskripsi", "sumber", "osm_id", "waktu_survei",
                              "duplikat_osm"]),
        "area": _fc(area, ["id", "nama", "sumber", "osm_id", "jenjang", "luas_m2"]),
        "jalur": _fc(jalur, ["id", "nama", "jenis", "waktu_mulai", "waktu_selesai", "panjang_m"]),
        "sekolah_analisis": _fc(unit, ["uid", "nama", "jenjang", "sumber"]),
    }
    for name, fc in files.items():
        (out_dir / f"{name}.geojson").write_text(json.dumps(fc, ensure_ascii=False, separators=(",", ":")))

    # --- seed SQL
    L = ["-- Dibuat otomatis oleh scripts/build_data.py. Jangan diedit manual.", "BEGIN;",
         "TRUNCATE titik, area_sekolah, jalur RESTART IDENTITY;"]
    for t in titik:
        L.append("INSERT INTO titik (id,nama,kategori,jenjang,deskripsi,sumber,osm_id,waktu_survei,duplikat_osm,geom) "
                 f"VALUES ({t['id']},{_q(t['nama'])},{_q(t['kategori'])},{_q(t['jenjang'])},{_q(t['deskripsi'])},"
                 f"{_q(t['sumber'])},{_q(t['osm_id'])},{_q(t['waktu_survei'])},{_q(t['duplikat_osm'])},"
                 f"ST_SetSRID(ST_MakePoint({t['geom'].x:.7f},{t['geom'].y:.7f}),4326));")
    for a in area:
        tags = json.dumps(a["tags"], ensure_ascii=False) if a["tags"] else None
        L.append("INSERT INTO area_sekolah (id,nama,sumber,osm_id,jenjang,tags,pusat,geom) VALUES "
                 f"({a['id']},{_q(a['nama'])},{_q(a['sumber'])},{_q(a['osm_id'])},{_q(a['jenjang'])},"
                 f"{_q(tags)}::jsonb,ST_SetSRID(ST_MakePoint({a['pusat'].x:.7f},{a['pusat'].y:.7f}),4326),"
                 f"ST_Multi(ST_GeomFromText({_q(a['geom'].wkt)},4326)));")
    for j in jalur:
        L.append("INSERT INTO jalur (id,nama,jenis,waktu_mulai,waktu_selesai,geom) VALUES "
                 f"({j['id']},{_q(j['nama'])},{_q(j['jenis'])},{_q(j['waktu_mulai'])},{_q(j['waktu_selesai'])},"
                 f"ST_GeomFromText({_q(j['geom'].wkt)},4326));")
    for tbl in ("titik", "area_sekolah", "jalur"):
        L.append(f"SELECT setval(pg_get_serial_sequence('{tbl}','id'), (SELECT MAX(id) FROM {tbl}));")
    L.append("COMMIT;")
    seed_path.write_text("\n".join(L) + "\n")

    return {"titik": len(titik), "area": len(area), "jalur": len(jalur), "sekolah_analisis": len(unit),
            "halte": sum(1 for t in titik if t["kategori"] == "halte"),
            "area_osm": len(osm_area), "titik_osm": len(osm_pt)}


if __name__ == "__main__":
    src, out, seed = (sys.argv[1:4] + [None] * 3)[:3]
    print(build(src or "data/source", out or "public/data", seed or "db/seed.sql"))

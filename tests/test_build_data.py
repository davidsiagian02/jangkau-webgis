import json
import re
import shutil
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
import build_data as bd  # noqa: E402

SRC = ROOT / "data" / "source"
KELAS = re.compile(r"^(VII|VIII|IX|X|XI|XII)\b|^R\. ?BK|Lapangan Upacara|Bimbingan Konseling|STIE|Kursus", re.I)


@pytest.fixture(scope="module")
def out(tmp_path_factory):
    d = tmp_path_factory.mktemp("out")
    src = d / "src"
    shutil.copytree(SRC, src)
    for f in src.glob("halte_osm*"):
        f.unlink()  # build tanpa file halte OSM
    counts = bd.build(src, d / "geo", d / "seed.sql")
    load = lambda n: json.loads((d / "geo" / f"{n}.geojson").read_text())
    return {"counts": counts, "titik": load("titik"), "area": load("area"), "jalur": load("jalur"),
            "sekolah": load("sekolah_analisis"), "seed": (d / "seed.sql").read_text()}


def _props(fc, **flt):
    return [f["properties"] for f in fc["features"] if all(f["properties"].get(k) == v for k, v in flt.items())]


def test_counts(out):
    survei = _props(out["titik"], sumber="survei")
    assert len(survei) == 31
    kat = {}
    for p in survei:
        kat[p["kategori"]] = kat.get(p["kategori"], 0) + 1
    assert kat == {"sekolah": 12, "halte": 4, "fasilitas": 11, "literasi": 4}
    assert len(_props(out["area"], sumber="survei")) == 5
    jenis = [p["jenis"] for p in _props(out["jalur"])]
    assert sorted(jenis) == ["jalur"] * 3 + ["rute"] * 3


def test_osm_cleaning(out):
    osm = _props(out["area"], sumber="osm")
    names = [p["nama"] for p in osm]
    assert not [n for n in names if KELAS.search(n)]
    assert names.count("SMKN 2 Pekanbaru") == 1
    smkn2 = next(f for f in out["area"]["features"] if f["properties"]["nama"] == "SMKN 2 Pekanbaru")
    assert smkn2["geometry"]["type"] == "MultiPolygon"
    assert 150 <= len(osm) <= 200
    assert "SMP Islam YLPI" in names and "SMA Serirama YLPI" in names


@pytest.mark.parametrize("nama,grades,expected", [
    ("SDN 114", None, "SD/MI"),
    ("MIN 1 Pekanbaru", None, "SD/MI"),
    ("MTsN 1 Kota Pekanbaru", "7-9", "SMP/MTs"),
    ("SMA Negeri 3 Pekanbaru", None, "SMA/SMK/MA"),
    ("MAN 2 Kota Pekanbaru", "10-12", "SMA/SMK/MA"),
    ("TK, SMP, SMA Budhi Luhur", None, "Campuran"),
    ("Pondok Pesantren Babussalam", None, "Pesantren/Diniyah"),
    ("MDTA Al-Furqon", None, "Pesantren/Diniyah"),
    ("SLB Cendana Pekanbaru", None, "SLB"),
    ("Paud YLPI", None, "TK/PAUD"),
    (None, None, "Tidak diketahui"),
])
def test_jenjang(nama, grades, expected):
    assert bd.jenjang_osm(nama, grades) == expected


def test_classify_titik():
    assert bd.classify_titik("Halte Smpn 14") == ("halte", None)
    assert bd.classify_titik("Sman 3 Pekanbaru") == ("sekolah", "SMA/SMK/MA")
    assert bd.classify_titik("Sd 149") == ("sekolah", "SD/MI")
    assert bd.classify_titik("Smp Al Ittihad") == ("sekolah", "SMP/MTs")
    assert bd.classify_titik("Pojok Literasi Smp 5") == ("literasi", None)
    assert bd.classify_titik("UKS Smpn 6") == ("fasilitas", None)


def test_dedup(out):
    names = {p["nama"] for p in _props(out["sekolah"])}
    uids = [p["uid"] for p in _props(out["sekolah"])]
    assert len(uids) == len(set(uids))
    assert "Smpn 14" not in names  # sekolah yang sama dengan poligon OSM SMP Negeri 14
    assert "SMP 6" not in names  # sama dengan poligon OSM "SMPN 6 Rumbai"
    assert "SMP Negeri 14 Pekanbaru" in names
    assert "Sd 149" in names  # dekat poligon SMPN 6 Rumbai, tapi sekolah lain
    dup = {p["nama"]: p["duplikat_osm"] for p in _props(out["titik"], sumber="survei", kategori="sekolah")}
    assert dup["Smpn 14"] and dup["SMP 6"] and dup["Sd 149"] is None


@pytest.mark.parametrize("a,b,same", [
    ("Smpn 14", "SMP Negeri 14 Pekanbaru", True),
    ("SMP 6", "SMPN 6 Rumbai", True),
    ("Sd 149", "SMPN 6 Rumbai", False),
    ("SDN 143", "SDN 77", False),
    ("Sman 3 Pekanbaru", "SMA Negeri 3 Pekanbaru", True),
    ("Smkn 5", "SMK Negeri 5 Pekanbaru", True),
    ("SMA NEGERI 2 PEKANBARU", "SMA Negeri 2 Pekanbaru", True),
    ("SD Santa Maria Pekanbaru", "SMP Santa Maria Pekanbaru", False),
    ("Sekolah (tanpa nama di OSM)", "SMP Kartika 1-5", True),
])
def test_same_school(a, b, same):
    assert bd.same_school(a, b) is same


def test_titik_osm_bukan_lapangan(out):
    assert "Lapangan SMA YLPI" not in {p["nama"] for p in _props(out["titik"], sumber="osm")}


def test_halte_optional(out):
    assert len(_props(out["titik"], kategori="halte")) == 4


def test_seed_sql(out):
    s = out["seed"]
    for t in ("INSERT INTO titik", "INSERT INTO area_sekolah", "INSERT INTO jalur"):
        assert t in s
    assert "Ma''had Tahfidz" in s  # kutip tunggal di-escape


def test_halte_osm_merge(tmp_path):
    src = tmp_path / "src"
    shutil.copytree(SRC, src)
    gj = {"type": "FeatureCollection", "features": [
        {"type": "Feature", "properties": {"name": "Halte A", "@id": "node/1"},
         "geometry": {"type": "Point", "coordinates": [101.4500, 0.5100]}},
        {"type": "Feature", "properties": {"@id": "node/2"},  # 11 m dari Halte A → digabung
         "geometry": {"type": "Point", "coordinates": [101.4501, 0.5100]}},
        {"type": "Feature", "properties": {"@id": "node/3"},
         "geometry": {"type": "Point", "coordinates": [101.4600, 0.5100]}},
    ]}
    (src / "halte_osm.geojson").write_text(json.dumps(gj))
    bd.build(src, tmp_path / "geo", tmp_path / "seed.sql")
    titik = json.loads((tmp_path / "geo" / "titik.geojson").read_text())
    osm_halte = _props(titik, kategori="halte", sumber="osm")
    assert len(osm_halte) == 2
    assert {"Halte A", "Halte (OSM)"} == {p["nama"] for p in osm_halte}

"""Tes UI end-to-end (Playwright): vite preview + API lokal + PostGIS lokal.

Jalankan:  python3 -m pytest tests/test_ui.py -q
"""
import os
import re
import socket
import subprocess
import time
from pathlib import Path

import pytest
from playwright.sync_api import expect, sync_playwright

ROOT = Path(__file__).resolve().parents[1]
DB = os.environ.get("TEST_DATABASE_URL", "postgresql://root@/jangkau_test?host=/var/run/postgresql")
KEY = "rahasia-ui"
BASE = "http://localhost:4173"
SHOTS = ROOT / "docs" / "screenshots"
TILE_ERR = re.compile(r"tile|openstreetmap|cartocdn|arcgisonline|Failed to load resource|ERR_TUNNEL|net::", re.I)


def _wait(port, t=40):
    end = time.time() + t
    while time.time() < end:
        with socket.socket() as s:
            if s.connect_ex(("127.0.0.1", port)) == 0:
                return
        time.sleep(0.3)
    raise RuntimeError(f"port {port} tidak terbuka")


@pytest.fixture(scope="module")
def servers():
    env = {**os.environ, "DATABASE_URL": DB, "ADMIN_PASSWORD": KEY}
    subprocess.run(["node", "scripts/setup-db.js"], cwd=ROOT, env=env, check=True, capture_output=True)
    subprocess.run(["npx", "vite", "build"], cwd=ROOT, check=True, capture_output=True)
    api = subprocess.Popen(["node", "scripts/api-dev.js"], cwd=ROOT, env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    web = subprocess.Popen(["npx", "vite", "preview", "--port", "4173", "--strictPort"], cwd=ROOT,
                           stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    _wait(3001)
    _wait(4173)
    yield
    api.terminate()
    web.terminate()


@pytest.fixture()
def page(servers):
    SHOTS.mkdir(parents=True, exist_ok=True)
    with sync_playwright() as p:
        b = p.chromium.launch()
        pg = b.new_page(viewport={"width": 1440, "height": 900})
        pg.errors = []
        pg.on("console", lambda m: m.type == "error" and not TILE_ERR.search(m.text) and pg.errors.append(m.text))
        pg.on("pageerror", lambda e: pg.errors.append(str(e)))
        yield pg
        b.close()


def test_nav_desktop_pil(page):
    page.goto(BASE + "/")
    pill = page.locator("nav.pill")
    expect(pill).to_be_visible()
    for teks in ("Beranda", "Peta", "Data"):
        expect(pill.get_by_role("link", name=teks, exact=True)).to_be_visible()
    assert page.locator("nav a[href*='admin']").count() == 0
    expect(page.locator("nav.tabbar")).to_be_hidden()


def test_nav_mobile_tabbar(page):
    page.set_viewport_size({"width": 390, "height": 844})
    page.goto(BASE + "/data.html")
    tab = page.locator("nav.tabbar")
    expect(tab).to_be_visible()
    expect(page.locator("nav.pill")).to_be_hidden()
    assert tab.locator("a, button").count() == 4
    expect(tab.locator("a[aria-current='page']")).to_have_text(re.compile("Data"))


def test_admin_di_footer(page):
    page.goto(BASE + "/")
    expect(page.locator("footer a.masuk-pengelola")).to_have_attribute("href", "/admin.html")


def test_tema_tersimpan(page):
    page.goto(BASE + "/")
    awal = page.evaluate("document.documentElement.dataset.theme")
    page.locator("nav.pill [data-theme-toggle]").click()
    baru = page.evaluate("document.documentElement.dataset.theme")
    assert {awal, baru} == {"light", "dark"}
    page.reload()
    assert page.evaluate("document.documentElement.dataset.theme") == baru


def test_tema_tanpa_localstorage(page):
    page.add_init_script("Object.defineProperty(window, 'localStorage', { get() { throw new Error('diblokir'); } });")
    page.goto(BASE + "/")
    assert page.evaluate("document.documentElement.dataset.theme") in ("light", "dark")
    page.locator("nav.pill [data-theme-toggle]").click()
    assert page.errors == []


def test_ukuran_js_beranda(servers):
    import gzip, re as _re
    html = (ROOT / "dist" / "index.html").read_text()
    srcs = set(_re.findall(r'<script type="module"[^>]*src="([^"]+)"', html)) | set(_re.findall(r'<link rel="modulepreload"[^>]*href="([^"]+)"', html))
    total = sum(len(gzip.compress((ROOT / "dist" / s.lstrip("/")).read_bytes())) for s in srcs)
    assert total <= 25_000, f"JS Beranda {total} byte gzip"


TERLARANG = re.compile(r"PostGIS|GeoJSON|\bIoU\b|DBSCAN|environment|ADMIN_PASSWORD|\bOSM\b|unit analisis|\bAPI\b", re.I)


def teks_publik(page):
    return page.evaluate("""() => {
      const sembunyi = [...document.querySelectorAll('.istilah, .ol-attribution')];
      sembunyi.forEach((e) => { e.dataset.d = e.style.display; e.style.display = 'none'; });
      const t = document.body.innerText;
      sembunyi.forEach((e) => { e.style.display = e.dataset.d; });
      return t;
    }""")


@pytest.mark.parametrize("path", ["/", "/peta.html", "/data.html"])
def test_bahasa_publik(page, path):
    page.goto(BASE + path)
    page.wait_for_timeout(1500)
    temuan = sorted(set(m.group(0) for m in TERLARANG.finditer(teks_publik(page))))
    assert temuan == [], f"istilah teknis terlihat di {path}: {temuan}"


def test_diorama(page):
    page.goto(BASE + "/")
    d = page.locator("[data-diorama]")
    expect(d).to_be_visible()
    assert d.locator(".gedung").count() >= 3
    assert d.locator(".halte").count() >= 1
    assert d.locator(".bus").count() == 1
    assert d.locator(".cincin").count() >= 1
    assert page.evaluate("getComputedStyle(document.querySelector('[data-diorama] .bus')).animationName") != "none"


def test_diorama_reduced_motion(page):
    page.emulate_media(reduced_motion="reduce")
    page.goto(BASE + "/")
    assert page.evaluate("getComputedStyle(document.querySelector('[data-diorama] .bus')).animationName") == "none"
    assert page.errors == []


def test_beranda_tanpa_peta(page):
    page.goto(BASE + "/")
    expect(page.locator("h1")).to_be_visible()
    assert page.locator(".ol-viewport").count() == 0
    expect(page.locator("[data-strip] .strip-sekolah").first).to_be_visible(timeout=15000)
    page.screenshot(path=str(SHOTS / "01-beranda.png"), full_page=True)
    assert page.errors == []


def test_basemap_carto_bawaan(page):
    # kunci peta CARTO sudah tertanam: tanpa .env pun peta polos CARTO jadi peta dasar
    carto = []
    page.on("request", lambda r: "cartocdn" in r.url and carto.append(r.url))
    page.goto(BASE + "/peta.html")
    page.wait_for_function("window.__jangkau && window.__jangkau.ready === true", timeout=20000)
    page.wait_for_timeout(800)
    assert page.evaluate("window.__jangkau.map.getLayers().item(0).get('basemap')") == "terang"
    expect(page.locator("input[name='basemap'][value='terang']")).to_be_checked()
    expect(page.locator("input[name='basemap'][value='terang']")).to_be_visible()
    assert carto and all("key=cb1_5bmx_1_86a3fc9b366d983e9445e12f" in u and "light_all" in u for u in carto)


def test_peta_layer_dan_filter(page):
    page.goto(BASE + "/peta.html")
    page.wait_for_function("window.__jangkau && window.__jangkau.ready === true", timeout=20000)
    assert page.locator("[data-layer-toggle]").count() >= 5
    expect(page.locator("[data-sumber-badge]")).to_have_text(re.compile("Data terkini"))
    page.screenshot(path=str(SHOTS / "02-peta.png"))
    page.locator("[data-layer-toggle='halte']").uncheck()
    assert page.evaluate("window.__jangkau.layers.halte.getVisible()") is False
    page.locator("[data-layer-toggle='halte']").check()
    assert page.evaluate("window.__jangkau.layers.halte.getVisible()") is True
    page.locator("[data-layer-toggle='jalan']").check()
    assert page.evaluate("window.__jangkau.layers.jalan.getVisible()") is True
    assert page.evaluate("window.__jangkau.layers.jalan.getSource().getFeatures().length") > 300
    # filter jenjang: matikan SD/MI → tidak ada fitur SD/MI yang terlihat
    page.locator("[data-jenjang-toggle='SD/MI']").uncheck()
    hidden = page.evaluate("window.__jangkau.visibleJenjang().includes('SD/MI')")
    assert hidden is False
    assert page.errors == []


def test_peta_analisis_buffer_dan_rekomendasi(page):
    page.goto(BASE + "/peta.html")
    page.wait_for_function("window.__jangkau && window.__jangkau.ready === true", timeout=20000)
    page.locator("[data-tab='analisis']").click()
    page.locator("[data-preset='500']").click()
    page.locator("[data-run-analysis]").click()
    expect(page.locator("[data-hasil-sekolah] tbody tr").first).to_be_visible(timeout=20000)
    expect(page.locator("[data-rekomendasi] li").first).to_be_visible(timeout=20000)
    assert page.evaluate("window.__jangkau.layers.buffer.getSource().getFeatures().length") == 1
    expect(page.locator("[data-run-analysis]")).to_be_enabled(timeout=20000)
    page.wait_for_timeout(300)
    page.screenshot(path=str(SHOTS / "03-analisis-buffer.png"))
    page.locator("[data-hasil-sekolah] tbody tr").first.click()  # zoom ke sekolah terjauh
    page.wait_for_timeout(600)
    # spatial query klik
    page.locator("[data-click-mode]").check()
    page.mouse.click(900, 450)
    expect(page.locator("[data-hasil-klik]")).to_contain_text(re.compile("Halte terdekat"), timeout=15000)
    page.screenshot(path=str(SHOTS / "04-query-klik.png"))
    assert page.errors == []


def test_peta_mode_cadangan(page):
    page.route("**/api/**", lambda r: r.abort())
    page.goto(BASE + "/peta.html")
    page.wait_for_function("window.__jangkau && window.__jangkau.ready === true", timeout=20000)
    expect(page.locator("[data-sumber-badge]")).to_have_text(re.compile("Data salinan"))
    assert page.evaluate("window.__jangkau.layers.sekolah.getSource().getFeatures().length") > 100
    page.locator("[data-tab='analisis']").click()
    page.locator("[data-run-analysis]").click()
    expect(page.locator("[data-hasil-sekolah] tbody tr").first).to_be_visible(timeout=20000)


def test_halaman_data(page):
    page.goto(BASE + "/data.html")
    expect(page.locator("[data-tabel-keputusan] tbody tr").first).to_be_visible(timeout=20000)
    expect(page.locator("[data-tabel-overlay] tbody tr")).to_have_count(5)
    page.locator("[data-cari]").fill("SMP Negeri 14")
    expect(page.locator("[data-tabel-keputusan] tbody tr").first).to_contain_text("SMP Negeri 14")
    page.screenshot(path=str(SHOTS / "05-data.png"), full_page=True)
    assert page.errors == []


def test_admin_crud(page):
    page.goto(BASE + "/admin.html")
    page.locator("[data-password]").fill("salah")
    page.locator("[data-login]").click()
    expect(page.locator("[data-login-error]")).to_contain_text("Kata sandi salah")
    page.locator("[data-password]").fill(KEY)
    page.locator("[data-login]").click()
    expect(page.locator("[data-admin-app]")).to_be_visible(timeout=15000)
    expect(page.locator("[data-batal]")).to_be_hidden()
    page.locator("[name='nama']").fill("Halte Uji UI <b>tebal</b>")
    page.locator("[name='kategori']").select_option("halte")
    page.locator("[name='lon']").fill("101.4512")
    page.locator("[name='lat']").fill("0.5123")
    page.locator("[data-simpan]").click()
    row = page.locator("[data-tabel-titik] tbody tr", has_text="Halte Uji UI")
    expect(row).to_have_count(1, timeout=15000)
    assert row.locator("b").count() == 0  # HTML tampil sebagai teks
    page.screenshot(path=str(SHOTS / "06-admin.png"))
    page.once("dialog", lambda d: d.accept())
    row.locator("[data-hapus]").click()
    expect(page.locator("[data-tabel-titik] tbody tr", has_text="Halte Uji UI")).to_have_count(0, timeout=15000)
    assert page.errors == []


def test_data_tampilkan_lebih(page):
    page.goto(BASE + "/data.html")
    rows = page.locator("[data-tabel-keputusan] tbody tr")
    expect(rows).to_have_count(25, timeout=20000)
    page.locator("[data-lebih]").click()
    expect(rows).to_have_count(50)
    page.locator("[data-f-status]").select_option("ok")
    expect(page.locator("[data-keputusan-info]")).to_contain_text("dari 55 sekolah")
    assert page.errors == []


def test_data_mobile(page):
    page.set_viewport_size({"width": 390, "height": 844})
    page.goto(BASE + "/data.html")
    row = page.locator("[data-tabel-keputusan] tbody tr").first
    expect(row).to_be_visible(timeout=20000)
    # baris tabel menjadi kartu bertumpuk: kepala tabel disembunyikan, sel diberi label sendiri
    expect(page.locator("[data-tabel-keputusan] thead")).to_be_hidden()
    assert page.evaluate("getComputedStyle(document.querySelector('[data-tabel-keputusan] tbody tr')).display") != "table-row"
    assert row.locator("td[data-label]").count() >= 5
    assert page.evaluate("document.documentElement.scrollWidth") <= 390
    assert page.errors == []


def test_admin_tanpa_istilah(page):
    page.goto(BASE + "/admin.html")
    expect(page.locator("[data-password]")).to_be_visible()
    temuan = sorted(set(m.group(0) for m in TERLARANG.finditer(teks_publik(page))))
    assert temuan == [], f"istilah teknis terlihat di halaman pengelola: {temuan}"
    expect(page.locator("label[for='pw']")).to_have_text("Kata sandi pengelola")
    assert page.errors == []


def test_peta_bahasa_analisis(page):
    page.goto(BASE + "/peta.html")
    page.wait_for_function("window.__jangkau && window.__jangkau.ready === true", timeout=20000)
    page.locator("[data-tab='analisis']").click()
    page.locator("[data-run-overlay]").click()
    expect(page.locator("[data-hasil-overlay] tbody tr").first).to_be_visible(timeout=15000)
    temuan = sorted(set(m.group(0) for m in TERLARANG.finditer(teks_publik(page))))
    assert temuan == [], f"istilah teknis terlihat di tab Analisis: {temuan}"


def test_peta_tema_gelap(page):
    carto = []
    page.on("request", lambda r: "cartocdn" in r.url and carto.append(r.url))
    page.add_init_script("try{localStorage.setItem('jangkau-tema','dark')}catch(e){}")
    page.goto(BASE + "/peta.html")
    page.wait_for_function("window.__jangkau && window.__jangkau.ready === true", timeout=20000)
    page.wait_for_timeout(800)
    # peta CARTO memakai versi gelapnya sendiri
    assert carto and all("dark_all" in u for u in carto)
    # OpenStreetMap digelapkan lewat filter, dan filter hilang di tema terang
    page.locator("input[name='basemap'][value='osm']").check()
    assert page.evaluate("getComputedStyle(document.querySelector('.basemap')).filter") != "none"
    page.locator(".pill [data-theme-toggle]").click()
    page.wait_for_timeout(400)
    assert page.evaluate("getComputedStyle(document.querySelector('.basemap')).filter") == "none"
    assert page.errors == []


def test_peta_mobile_sheet(page):
    page.set_viewport_size({"width": 390, "height": 844})
    page.goto(BASE + "/peta.html")
    page.wait_for_function("window.__jangkau && window.__jangkau.ready === true", timeout=20000)
    sheet = page.locator("[data-sheet]")
    expect(sheet).to_have_attribute("data-state", "intip")
    page.locator("[data-sheet-handle]").click()
    expect(sheet).to_have_attribute("data-state", "setengah")
    # lembar tidak menutupi tab bar: wadah peta berhenti di atas tab bar dan memotong isinya
    tab = page.locator(".tabbar").bounding_box()
    wadah = page.locator(".peta").bounding_box()
    assert wadah["y"] + wadah["height"] <= tab["y"] + 1
    assert page.evaluate("getComputedStyle(document.querySelector('.peta')).overflow") in ("hidden", "clip")
    assert page.errors == []


def test_mobile_peta(page):
    page.set_viewport_size({"width": 390, "height": 844})
    page.goto(BASE + "/peta.html")
    page.wait_for_function("window.__jangkau && window.__jangkau.ready === true", timeout=20000)
    page.screenshot(path=str(SHOTS / "07-peta-mobile.png"))
    assert page.errors == []

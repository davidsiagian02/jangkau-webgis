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


def test_beranda_tanpa_peta(page):
    page.goto(BASE + "/")
    expect(page.locator("h1")).to_be_visible()
    assert page.locator(".ol-viewport").count() == 0
    expect(page.locator("[data-strip] .strip-sekolah").first).to_be_visible(timeout=15000)
    page.screenshot(path=str(SHOTS / "01-beranda.png"), full_page=True)
    assert page.errors == []


def test_basemap_tanpa_api_key_carto(page):
    carto = []
    page.on("request", lambda r: "cartocdn" in r.url and carto.append(r.url))
    page.goto(BASE + "/peta.html")
    page.wait_for_function("window.__jangkau && window.__jangkau.ready === true", timeout=20000)
    page.wait_for_timeout(500)
    assert page.evaluate("window.__jangkau.map.getLayers().item(0).get('basemap')") == "osm"
    expect(page.locator("input[name='basemap'][value='osm']")).to_be_checked()
    expect(page.locator("input[name='basemap'][value='terang']")).to_be_hidden()
    assert carto == []


def test_peta_layer_dan_filter(page):
    page.goto(BASE + "/peta.html")
    page.wait_for_function("window.__jangkau && window.__jangkau.ready === true", timeout=20000)
    assert page.locator("[data-layer-toggle]").count() >= 5
    expect(page.locator("[data-sumber-badge]")).to_have_text(re.compile("Database PostGIS"))
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
    expect(page.locator("[data-sumber-badge]")).to_have_text(re.compile("Data cadangan"))
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
    expect(page.locator("[data-login-error]")).to_contain_text("Password admin salah")
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


def test_mobile_peta(page):
    page.set_viewport_size({"width": 390, "height": 844})
    page.goto(BASE + "/peta.html")
    page.wait_for_function("window.__jangkau && window.__jangkau.ready === true", timeout=20000)
    page.screenshot(path=str(SHOTS / "07-peta-mobile.png"))
    assert page.errors == []

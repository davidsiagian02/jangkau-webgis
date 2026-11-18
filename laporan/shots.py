"""Screenshot tambahan untuk laporan (butuh server seperti tests/test_ui.py)."""
import os, subprocess, time, socket, sys
from pathlib import Path
from playwright.sync_api import sync_playwright
ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "docs" / "screenshots"
DB = "postgresql://root@/jangkau_test?host=/var/run/postgresql"
env = {**os.environ, "DATABASE_URL": DB, "ADMIN_PASSWORD": "x"}
subprocess.run(["npx", "vite", "build"], cwd=ROOT, check=True, capture_output=True)
api = subprocess.Popen(["node", "scripts/api-dev.js"], cwd=ROOT, env=env, stdout=subprocess.DEVNULL)
web = subprocess.Popen(["npx", "vite", "preview", "--port", "4174", "--strictPort"], cwd=ROOT, stdout=subprocess.DEVNULL)
for port in (3001, 4174):
    for _ in range(100):
        with socket.socket() as s:
            if s.connect_ex(("127.0.0.1", port)) == 0: break
        time.sleep(0.2)
B = "http://localhost:4174"
try:
    with sync_playwright() as p:
        b = p.chromium.launch(); pg = b.new_page(viewport={"width": 1440, "height": 900})
        ready = lambda: pg.wait_for_function("window.__jangkau && window.__jangkau.ready === true", timeout=30000)
        def view(lon, lat, z):
            pg.evaluate(f"(() => {{ const m = window.__jangkau.map; m.getView().setCenter([{lon}*20037508.34/180, Math.log(Math.tan((90+{lat})*Math.PI/360))/(Math.PI/180)*20037508.34/180]); m.getView().setZoom({z}); }})()")
            pg.wait_for_timeout(700)
        pg.goto(B + "/peta.html"); ready()
        pg.locator("[data-layer-toggle='heatmap']").check(); pg.locator("[data-layer-toggle='sekolah']").uncheck()
        pg.locator("[data-layer-toggle='area_osm']").uncheck(); pg.wait_for_timeout(600)
        pg.screenshot(path=str(OUT / "08-heatmap.png"))
        pg.goto(B + "/peta.html"); ready()
        for j in ["TK/PAUD", "SMP/MTs", "SMA/SMK/MA", "Campuran", "Pesantren/Diniyah", "SLB", "Tidak diketahui"]:
            pg.locator(f"[data-jenjang-toggle='{j}']").uncheck()
        pg.wait_for_timeout(500); pg.screenshot(path=str(OUT / "09-filter-sd.png"))
        pg.goto(B + "/peta.html"); ready(); view(101.4365, 0.5725, 17)
        box = pg.locator("#map").bounding_box()
        px = pg.evaluate("(() => { const m = window.__jangkau.map; const f = window.__jangkau.layers.sekolah_survei.getSource().getFeatures().find(x => x.get('nama') === 'Sd 149'); return m.getPixelFromCoordinate(f.getGeometry().getCoordinates()); })()")
        pg.mouse.click(box["x"] + px[0], box["y"] + px[1]); pg.wait_for_timeout(600)
        pg.screenshot(path=str(OUT / "10-popup-area-survei.png"))
        pg.locator("[data-tab='analisis']").click(); pg.locator("[data-run-overlay]").click()
        pg.wait_for_selector("[data-hasil-overlay] tbody tr"); view(101.4545, 0.5262, 17)
        pg.evaluate("document.querySelector('[data-run-overlay]').scrollIntoView()"); pg.wait_for_timeout(500)
        pg.screenshot(path=str(OUT / "11-overlay.png"))
        pg.goto(B + "/peta.html?cadangan=1"); ready(); pg.wait_for_timeout(400)
        pg.screenshot(path=str(OUT / "12-mode-cadangan.png"), clip={"x": 1000, "y": 56, "width": 440, "height": 120})
        b.close()
finally:
    api.terminate(); web.terminate()
print("ok")

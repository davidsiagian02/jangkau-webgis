"""Pasang kerangka bersama (head tema, navbar pil/tab bar, footer) ke keempat halaman HTML."""
import re, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
LOGO = (ROOT / "public" / "logo.svg").read_text().replace('xmlns="http://www.w3.org/2000/svg" ', '').strip()
LOGO = LOGO.replace("<svg ", '<svg class="logo" aria-hidden="true" focusable="false" ', 1)

I = {
 "home": '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1h-4.5v-6h-5v6H5a1 1 0 0 1-1-1z"/></svg>',
 "peta": '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 4-5 2v14l5-2 6 2 5-2V4l-5 2z"/><path d="M9 4v14M15 6v14"/></svg>',
 "data": '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="4" width="16" height="16" rx="2"/><path d="M4 9.5h16M4 14.5h16M10 9.5V20"/></svg>',
 "tema": '<svg viewBox="0 0 24 24" aria-hidden="true" class="ikon-tema"><circle cx="12" cy="12" r="4.2" class="matahari"/><path class="sinar" d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4"/><path class="bulan" d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/></svg>',
}

HEAD = """  <meta name="theme-color" content="#F5F7FA" media="(prefers-color-scheme: light)" />
  <meta name="theme-color" content="#0D1626" media="(prefers-color-scheme: dark)" />
  <script>try{var t=localStorage.getItem('jangkau-tema')}catch(e){}document.documentElement.dataset.theme=(t==='dark'||t==='light')?t:(matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light')</script>
"""

def nav(page):
    cur = lambda p: ' aria-current="page"' if p == page else ''
    return f"""  <a class="lewati" href="#isi">Lewati ke konten</a>
  <nav class="pill" aria-label="Navigasi utama">
    <a class="merek" href="/" aria-label="Jangkau, ke beranda">{LOGO}<span>Jangkau</span></a>
    <span class="pill-tautan">
      <a href="/"{cur('index')}>Beranda</a>
      <a href="/peta.html"{cur('peta')}>Peta</a>
      <a href="/data.html"{cur('data')}>Data</a>
    </span>
    <button class="tombol-tema" type="button" data-theme-toggle aria-label="Ganti ke tema gelap">{I['tema']}</button>
  </nav>
  <a class="merek-hp" href="/" aria-label="Jangkau, ke beranda">{LOGO}<span>Jangkau</span></a>
  <nav class="tabbar" aria-label="Navigasi utama">
    <a href="/"{cur('index')}>{I['home']}<span>Beranda</span></a>
    <a href="/peta.html"{cur('peta')}>{I['peta']}<span>Peta</span></a>
    <a href="/data.html"{cur('data')}>{I['data']}<span>Data</span></a>
    <button type="button" data-theme-toggle aria-label="Ganti ke tema gelap">{I['tema']}<span>Tema</span></button>
  </nav>"""

FOOTER = f"""  <footer class="kaki">
    <div class="kaki-merek">{LOGO}<p><b>Jangkau</b><br />Jarak jalan kaki sekolah ke halte di Kota Pekanbaru.</p></div>
    <p class="kaki-kecil">Data peta © kontributor <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>. Survei lapangan 30 September 2026.<br />Project akhir Sistem Informasi Geografis, Politeknik Caltex Riau, 2026.</p>
    <a class="masuk-pengelola" href="/admin.html">Masuk pengelola</a>
  </footer>"""

PAGES = {"index.html": "index", "peta.html": "peta", "data.html": "data", "admin.html": "admin"}
for f, page in PAGES.items():
    p = ROOT / f
    s = p.read_text()
    s = re.sub(r"\s*<meta name=\"theme-color\".*?\n|\s*<script>try\{var t=localStorage.*?</script>\n", "\n", s)
    s = s.replace('  <link rel="icon" href="/favicon.svg" type="image/svg+xml" />\n', '  <link rel="icon" href="/favicon.svg" type="image/svg+xml" />\n' + HEAD, 1)
    s = re.sub(r"\n{3,}", "\n\n", s)
    s = re.sub(r'<body class="([^"]+)"[^>]*>', rf'<body class="\1" data-page="{page}">', s, count=1)
    s = re.sub(r"  (<a class=\"lewati\".*?</nav>\n  <a class=\"merek-hp\".*?</nav>|<header class=\"nav\">.*?</header>)", nav(page), s, count=1, flags=re.S)
    if page != "peta":
        if re.search(r"<footer class=\"(footer|kaki)\">", s):
            s = re.sub(r"  <footer class=\"(footer|kaki)\">.*?</footer>", FOOTER, s, count=1, flags=re.S)
        else:
            s = s.replace("  </main>\n", "  </main>\n" + FOOTER + "\n", 1)
    s = re.sub(r"<main( class=\"[^\"]*\")?( id=\"isi\")?>", lambda m: f"<main{m.group(1) or ''} id=\"isi\">", s, count=1)
    p.write_text(s)
    print(f, "ok")

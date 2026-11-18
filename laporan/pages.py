"""Cari nomor halaman setiap judul/keterangan dari PDF pass 1 → laporan/pages.json"""
import json, re, subprocess, sys
from pathlib import Path
D = Path(__file__).parent
pdf = sys.argv[1]
n = int(re.search(r"Pages:\s+(\d+)", subprocess.run(["pdfinfo", pdf], capture_output=True, text=True).stdout).group(1))
pages = [subprocess.run(["pdftotext", "-f", str(i), "-l", str(i), pdf, "-"], capture_output=True, text=True).stdout for i in range(1, n + 1)]
norm = lambda s: re.sub(r"\s+", " ", s).strip()
first = lambda t: next((l.strip() for l in t.splitlines() if l.strip()), "")
body_start = next(i for i, t in enumerate(pages) if first(t) == "BAB 1")
front_start = 1  # halaman ke-2 fisik (indeks 1) = i
roman = lambda k: ["i","ii","iii","iv","v","vi","vii","viii","ix","x","xi","xii","xiii","xiv","xv"][k]
toc = json.loads((D / "toc.json").read_text())
out, cur = {}, body_start
for e in toc:
    key = e["key"]
    if key in ("KATA PENGANTAR", "DAFTAR ISI", "DAFTAR GAMBAR", "DAFTAR TABEL"):
        i = next(i for i in range(front_start, body_start) if first(pages[i]) == key)
        out[key] = roman(i - front_start); continue
    if e["level"] == 1:
        i = next(i for i in range(cur, n) if first(pages[i]) == key)
    else:
        k = norm(key)
        i = next(i for i in range(cur, n) if k in norm(pages[i]))
    if e["level"] in (1, 2, 3): cur = i
    out[key] = str(i - body_start + 1)
(D / "pages.json").write_text(json.dumps(out, ensure_ascii=False, indent=1))
print("halaman isi:", n - body_start, "| bagian awal:", body_start - front_start, "| entri:", len(out))

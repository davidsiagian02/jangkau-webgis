#!/bin/sh
# Bangun laporan: data → docx (pass 1) → pdf → nomor halaman → docx (pass 2) → pdf
set -e
cd "$(dirname "$0")"
node collect.mjs
rm -f pages.json
node build_laporan.cjs
python3 render.py Laporan_Akhir_SIG_Jangkau.docx pass1.pdf pass1.docx
python3 pages.py pass1.pdf
node build_laporan.cjs
python3 render.py Laporan_Akhir_SIG_Jangkau.docx Laporan_Akhir_SIG_Jangkau.pdf tmp.docx
cp pages.json pages_pass2.json && python3 pages.py Laporan_Akhir_SIG_Jangkau.pdf
cmp -s pages.json pages_pass2.json && echo "nomor halaman stabil" || echo "PERINGATAN: nomor halaman berubah, jalankan ulang"
rm -f pass1.pdf pass1.docx tmp.docx pages_pass2.json

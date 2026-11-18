import { initLayout, setBadge } from '../lib/layout.js';
import '../styles/data.css';
import { getAnalysis, getStats } from '../lib/api.js';
import { JENJANG, JENJANG_LABEL } from '../lib/config.js';
import { escapeHtml, fmtAngka, fmtMenit, fmtMeter } from '../lib/util.js';

initLayout();
const $ = (s) => document.querySelector(s);
const badge = $('[data-sumber-badge]');
const seen = new Set();
const note = (s) => { seen.add(s); setBadge(badge, seen.has('cadangan') ? 'cadangan' : 'database'); };
const jenjangNama = (j) => JENJANG_LABEL[j] || j || 'Belum diketahui';
const sw = (j) => `<span class="swatch${j === 'Tidak diketahui' ? ' kosong' : ''}" data-j="${escapeHtml(j || '')}" style="background:${JENJANG[j] || '#fff'}"></span>`;
const asal = (s) => ({ osm: 'OpenStreetMap', survei: 'Survei lapangan', admin: 'Tambahan pengelola' })[s] || s;
// sel tabel dengan label sendiri, dipakai saat tabel ditumpuk di layar HP
const td = (label, isi, cls = '') => `<td data-label="${label}"${cls ? ` class="${cls}"` : ''}>${isi}</td>`;
const GAGAL = '<span class="error">Data belum bisa dimuat. Coba muat ulang halaman.</span>';

let sekolah = [];
let tampil = [];
let radius = 500;
const PER_HALAMAN = 25;
let batas = PER_HALAMAN;

$('[data-f-jenjang]').insertAdjacentHTML('beforeend', Object.keys(JENJANG).map((j) => `<option value="${escapeHtml(j)}">${escapeHtml(jenjangNama(j))}</option>`).join(''));

function renderKeputusan() {
  const q = $('[data-cari]').value.trim().toLowerCase();
  const j = $('[data-f-jenjang]').value;
  const st = $('[data-f-status]').value;
  tampil = sekolah.filter((p) => (!q || p.nama.toLowerCase().includes(q)) && (!j || p.jenjang === j)
    && (!st || (st === 'ok') === p.terlayani));
  $('[data-tabel-keputusan] tbody').innerHTML = tampil.slice(0, batas).map((p, i) => `<tr>
    ${td('No', i + 1, 'num no')}${td('Sekolah', escapeHtml(p.nama), 'nama')}${td('Jenjang', `<span>${sw(p.jenjang)} ${escapeHtml(jenjangNama(p.jenjang))}</span>`)}${td('Asal data', asal(p.sumber))}
    ${td('Halte terdekat', escapeHtml(p.halte_terdekat || '–'))}${td('Jarak', fmtMeter(p.jarak_halte_m), 'num')}
    ${td('Jalan kaki', p.jarak_halte_m === null ? '–' : fmtMenit(p.jarak_halte_m / 83.33), 'num')}
    ${td('Status', `<span class="status ${p.terlayani ? 'ok' : 'no'}">${p.terlayani ? 'Terjangkau' : 'Belum terjangkau'}</span>`, 'st')}</tr>`).join('')
    || '<tr class="kosong"><td colspan="8">Tidak ada sekolah yang cocok. Coba ubah kata kunci atau saringan.</td></tr>';
  const n = Math.min(batas, tampil.length);
  $('[data-keputusan-info]').textContent = `Menampilkan ${fmtAngka(n)} dari ${fmtAngka(tampil.length)} sekolah.`;
  const lebih = $('[data-lebih]');
  lebih.hidden = n >= tampil.length;
  lebih.textContent = `Tampilkan ${fmtAngka(Math.min(PER_HALAMAN, tampil.length - n))} sekolah lagi`;
}

// Unduh baris yang sedang tampil sebagai CSV (dibuka langsung oleh Excel / Google Sheets).
function unduhCsv() {
  const kolom = ['Sekolah', 'Jenjang', 'Asal data', 'Halte terdekat', 'Jarak (m)', 'Jalan kaki (menit)', 'Status'];
  const sel = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const baris = tampil.map((p) => [p.nama, jenjangNama(p.jenjang), asal(p.sumber), p.halte_terdekat || '',
    p.jarak_halte_m === null ? '' : Math.round(p.jarak_halte_m), p.jarak_halte_m === null ? '' : Math.round(p.jarak_halte_m / 83.33),
    p.terlayani ? 'Terjangkau' : 'Belum terjangkau'].map(sel).join(';'));
  const blob = new Blob([`﻿${[kolom.map(sel).join(';'), ...baris].join('\r\n')}`], { type: 'text/csv;charset=utf-8' });
  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: `jarak-sekolah-ke-halte-${radius}m.csv` });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

async function loadAnalisis() {
  const [{ data: b, sumber: s1 }, { data: k, sumber: s2 }] = await Promise.all([getAnalysis('buffer', { radius }), getAnalysis('recommend', { radius })]);
  note(s1); note(s2);
  sekolah = b.sekolah.features.map((f) => f.properties).sort((a, c) => (c.jarak_halte_m ?? 1e9) - (a.jarak_halte_m ?? 1e9));
  renderKeputusan();
  const g = b.ringkasan;
  $('[data-tabel-ringkasan] tbody').querySelector('[data-r=terlayani]')?.remove();
  $('[data-tabel-ringkasan] tbody').insertAdjacentHTML('beforeend', `<tr data-r="terlayani"><th>Sekolah yang berjarak ${fmtMeter(radius)} atau kurang dari halte</th><td class="num">${fmtAngka(g.terlayani)} dari ${fmtAngka(g.total)} (${fmtAngka(g.persen, 1)}%)</td></tr>`);
  $('[data-tabel-rekomendasi] tbody').innerHTML = k.kandidat.features.map((f) => {
    const p = f.properties;
    const [lon, lat] = f.geometry.coordinates;
    const peta = `https://www.openstreetmap.org/?mlat=${lat.toFixed(6)}&mlon=${lon.toFixed(6)}#map=18/${lat.toFixed(6)}/${lon.toFixed(6)}`;
    return `<tr>${td('Urutan', p.rank, 'num no')}${td('Sekolah terjangkau', p.jumlah_sekolah, 'num')}${td('Sekolah', p.sekolah.map(escapeHtml).join(', '), 'nama')}
      ${td('Jarak rata-rata', fmtMeter(p.jarak_rata_m), 'num')}${td('Lokasi', `<a href="${peta}" target="_blank" rel="noopener">${lat.toFixed(5)}, ${lon.toFixed(5)}</a>`)}</tr>`;
  }).join('') || '<tr class="kosong"><td colspan="5">Tidak ada usulan pada jarak ini.</td></tr>';
}

async function main() {
  try {
    const [{ data: st, sumber }, { data: ov, sumber: s2 }] = await Promise.all([getStats(), getAnalysis('overlay')]);
    note(sumber); note(s2);
    const J = st.jumlah;
    const rows = [['Titik hasil survei', J.titik_survei], ['Batas sekolah hasil survei', J.area_survei], ['Jalur yang disurvei', J.jalur],
      ['Sekolah dari OpenStreetMap', J.sekolah_osm], ['Halte bus (survei dan OpenStreetMap)', J.halte], ['Sekolah yang dihitung jaraknya', J.sekolah_analisis]];
    $('[data-tabel-ringkasan] tbody').innerHTML = rows.map(([k, v]) => `<tr><th>${k}</th><td class="num">${fmtAngka(v)}</td></tr>`).join('');
    $('[data-tabel-jalur] tbody').innerHTML = st.jalur.map((j) => `<tr>${td('Jalur', escapeHtml(j.nama), 'nama')}${td('Jenis', j.jenis === 'rute' ? 'Rute yang direkam' : 'Jalur yang digambar')}
      ${td('Panjang', fmtMeter(j.panjang_m), 'num')}${td('Jalan kaki', fmtMenit(j.jalan_menit), 'num')}${td('Sepeda', fmtMenit(j.sepeda_menit), 'num')}</tr>`).join('');
    $('[data-tabel-overlay] tbody').innerHTML = ov.banding.map((b) => `<tr>${td('Hasil survei', escapeHtml(b.nama_survei), 'nama')}${td('Di OpenStreetMap', escapeHtml(b.nama_osm || 'Belum ada'))}
      ${td('Luas survei', `${fmtAngka(b.luas_survei_m2)} m²`, 'num')}${td('Luas di OpenStreetMap', b.luas_osm_m2 ? `${fmtAngka(b.luas_osm_m2)} m²` : '–', 'num')}
      ${td('Luas yang bertumpuk', `${fmtAngka(b.luas_irisan_m2)} m²`, 'num')}${td('Kecocokan', `${fmtAngka(b.iou * 100, 0)}%`, 'num')}</tr>`).join('');
    $('[data-tabel-fasilitas] tbody').innerHTML = ov.fasilitas_dalam_area.map((f) => `<tr>${td('Sekolah', escapeHtml(f.area), 'nama')}${td('Asal data', asal(f.sumber))}
      ${td('Jumlah', f.jumlah, 'num')}${td('Isinya', f.daftar.map(escapeHtml).join(', ') || '–')}</tr>`).join('');
    await loadAnalisis();
  } catch (e) {
    $('[data-keputusan-info]').innerHTML = GAGAL;
  }
}

for (const s of ['[data-cari]', '[data-f-jenjang]', '[data-f-status]']) $(s).addEventListener('input', () => { batas = PER_HALAMAN; renderKeputusan(); });
$('[data-lebih]').addEventListener('click', () => { batas += PER_HALAMAN; renderKeputusan(); });
$('[data-f-radius]').addEventListener('change', (e) => { radius = Number(e.target.value); loadAnalisis().catch(() => { $('[data-keputusan-info]').innerHTML = GAGAL; }); });
$('[data-unduh-csv]').addEventListener('click', unduhCsv);
main();

import { initLayout as initNav, setBadge } from '../lib/layout.js';
import '../styles/data.css';
import { getAnalysis, getStats } from '../lib/api.js';
import { JENJANG } from '../lib/config.js';
import { escapeHtml, fmtAngka, fmtMenit, fmtMeter } from '../lib/util.js';

initNav();
const $ = (s) => document.querySelector(s);
const badge = $('[data-sumber-badge]');
const seen = new Set();
const note = (s) => { seen.add(s); setBadge(badge, seen.has('cadangan') ? 'cadangan' : 'database'); };
const sw = (j) => `<span class="swatch${j === 'Tidak diketahui' ? ' kosong' : ''}" style="background:${JENJANG[j] || '#fff'}"></span>`;
const sumberNama = (s) => ({ osm: 'OpenStreetMap', survei: 'Survei', admin: 'Input admin' })[s] || s;

let sekolah = [];
let radius = 500;

$('[data-f-jenjang]').insertAdjacentHTML('beforeend', Object.keys(JENJANG).map((j) => `<option>${escapeHtml(j)}</option>`).join(''));

function renderKeputusan() {
  const q = $('[data-cari]').value.trim().toLowerCase();
  const j = $('[data-f-jenjang]').value;
  const st = $('[data-f-status]').value;
  const rows = sekolah.filter((p) => (!q || p.nama.toLowerCase().includes(q)) && (!j || p.jenjang === j)
    && (!st || (st === 'ok') === p.terlayani));
  $('[data-tabel-keputusan] tbody').innerHTML = rows.slice(0, 400).map((p, i) => `<tr>
    <td class="num">${i + 1}</td><td>${escapeHtml(p.nama)}</td><td>${sw(p.jenjang)} ${escapeHtml(p.jenjang)}</td><td>${sumberNama(p.sumber)}</td>
    <td>${escapeHtml(p.halte_terdekat || '–')}</td><td class="num">${fmtMeter(p.jarak_halte_m)}</td>
    <td class="num">${p.jarak_halte_m === null ? '–' : fmtMenit(p.jarak_halte_m / 83.33)}</td>
    <td><span class="status ${p.terlayani ? 'ok' : 'no'}">${p.terlayani ? 'Terjangkau' : 'Belum terjangkau'}</span></td></tr>`).join('')
    || '<tr><td colspan="8">Tidak ada sekolah yang cocok dengan filter.</td></tr>';
  $('[data-keputusan-info]').textContent = `Menampilkan ${fmtAngka(Math.min(rows.length, 400))} dari ${fmtAngka(rows.length)} sekolah yang cocok (radius ${fmtMeter(radius)}).`;
}

async function loadAnalisis() {
  const [{ data: b, sumber: s1 }, { data: k, sumber: s2 }] = await Promise.all([getAnalysis('buffer', { radius }), getAnalysis('recommend', { radius })]);
  note(s1); note(s2);
  sekolah = b.sekolah.features.map((f) => f.properties).sort((a, c) => (c.jarak_halte_m ?? 1e9) - (a.jarak_halte_m ?? 1e9));
  renderKeputusan();
  const g = b.ringkasan;
  $('[data-tabel-ringkasan] tbody').querySelector('[data-r=terlayani]')?.remove();
  $('[data-tabel-ringkasan] tbody').insertAdjacentHTML('beforeend', `<tr data-r="terlayani"><th>Sekolah terjangkau (${fmtMeter(radius)})</th><td class="num">${fmtAngka(g.terlayani)} dari ${fmtAngka(g.total)} (${fmtAngka(g.persen, 1)}%)</td></tr>`);
  $('[data-tabel-rekomendasi] tbody').innerHTML = k.kandidat.features.map((f) => {
    const p = f.properties;
    const [lon, lat] = f.geometry.coordinates;
    return `<tr><td class="num">${p.rank}</td><td class="num">${p.jumlah_sekolah}</td><td>${p.sekolah.map(escapeHtml).join(', ')}</td>
      <td class="num">${fmtMeter(p.jarak_rata_m)}</td><td>${lat.toFixed(5)}, ${lon.toFixed(5)}${p.snap ? '<br><span class="hint">ditempel ke jalan terdekat</span>' : ''}</td></tr>`;
  }).join('') || '<tr><td colspan="5">Tidak ada usulan pada radius ini.</td></tr>';
}

async function main() {
  try {
    const [{ data: st, sumber }, { data: ov, sumber: s2 }] = await Promise.all([getStats(), getAnalysis('overlay')]);
    note(sumber); note(s2);
    const J = st.jumlah;
    const rows = [['Titik hasil survei', J.titik_survei], ['Area sekolah hasil survei', J.area_survei], ['Jalur survei', J.jalur],
      ['Sekolah dari OpenStreetMap', J.sekolah_osm], ['Halte (survei + OSM)', J.halte], ['Unit sekolah yang dianalisis', J.sekolah_analisis]];
    $('[data-tabel-ringkasan] tbody').innerHTML = rows.map(([k, v]) => `<tr><th>${k}</th><td class="num">${fmtAngka(v)}</td></tr>`).join('');
    $('[data-tabel-jalur] tbody').innerHTML = st.jalur.map((j) => `<tr><td>${escapeHtml(j.nama)}</td><td>${j.jenis === 'rute' ? 'Rute (track)' : 'Jalur (polyline)'}</td>
      <td class="num">${fmtMeter(j.panjang_m)}</td><td class="num">${fmtMenit(j.jalan_menit)}</td><td class="num">${fmtMenit(j.sepeda_menit)}</td></tr>`).join('');
    $('[data-tabel-overlay] tbody').innerHTML = ov.banding.map((b) => `<tr><td>${escapeHtml(b.nama_survei)}</td><td>${escapeHtml(b.nama_osm || '–')}</td>
      <td class="num">${fmtAngka(b.luas_survei_m2)} m²</td><td class="num">${b.luas_osm_m2 ? `${fmtAngka(b.luas_osm_m2)} m²` : '–'}</td>
      <td class="num">${fmtAngka(b.luas_irisan_m2)} m²</td><td class="num">${fmtAngka(b.iou, 3)}</td></tr>`).join('');
    $('[data-tabel-fasilitas] tbody').innerHTML = ov.fasilitas_dalam_area.map((f) => `<tr><td>${escapeHtml(f.area)}</td><td>${sumberNama(f.sumber)}</td>
      <td class="num">${f.jumlah}</td><td>${f.daftar.map(escapeHtml).join(', ') || '–'}</td></tr>`).join('');
    await loadAnalisis();
  } catch (e) {
    $('[data-keputusan-info]').innerHTML = `<span class="error">Data belum bisa dimuat: ${escapeHtml(e.message)}</span>`;
  }
}

for (const s of ['[data-cari]', '[data-f-jenjang]', '[data-f-status]']) $(s).addEventListener('input', renderKeputusan);
$('[data-f-radius]').addEventListener('change', (e) => { radius = Number(e.target.value); loadAnalisis(); });
main();

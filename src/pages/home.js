import { initLayout } from '../lib/layout.js';
import '../styles/home.css';
import { mountDiorama } from '../lib/diorama.js';
import { getAnalysis, getStats } from '../lib/api.js';
import { JENJANG, JENJANG_LABEL, RADIUS } from '../lib/config.js';
import { escapeHtml, fmtAngka } from '../lib/util.js';

initLayout();
mountDiorama(document.querySelector('[data-diorama]'));

const MAX_M = 2000;
const BIN = 50;

// Diagram "jalan": sekolah ditumpuk per 50 m menurut jarak ke halte terdekat.
function drawStrip(el, sekolah, radius) {
  const W = 1000, road = 150, step = 8.5, maxStack = 13;
  const x = (m) => 64 + (Math.min(m, MAX_M) / MAX_M) * (W - 174);
  const bins = new Map();
  let jauh = 0;
  for (const f of sekolah) {
    const d = f.properties.jarak_halte_m;
    if (d === null || d > MAX_M) { jauh += 1; continue; }
    const b = Math.floor(d / BIN);
    if (!bins.has(b)) bins.set(b, []);
    bins.get(b).push(f.properties);
  }
  let dots = '';
  for (const [b, list] of bins) {
    list.sort((a, c) => (a.jenjang || '').localeCompare(c.jenjang || ''));
    list.slice(0, maxStack).forEach((p, i) => {
      const c = JENJANG[p.jenjang] || JENJANG['Tidak diketahui'];
      dots += `<circle class="strip-sekolah${c === '#ffffff' ? ' kosong' : ''}" data-j="${escapeHtml(p.jenjang || 'Tidak diketahui')}" cx="${x(b * BIN + BIN / 2).toFixed(1)}" cy="${road - 14 - i * step}" r="3.7" fill="${c}"><title>${escapeHtml(p.nama)}: ${fmtAngka(Math.round(p.jarak_halte_m))} m</title></circle>`;
    });
    if (list.length > maxStack) dots += `<text class="strip-lebih" x="${x(b * BIN + BIN / 2)}" y="${road - 18 - maxStack * step}">+${list.length - maxStack}</text>`;
  }
  let ticks = '';
  for (let m = 0; m <= MAX_M; m += 250) {
    ticks += `<line x1="${x(m)}" x2="${x(m)}" y1="${road + 10}" y2="${road + 16}" class="strip-tick"/>
      <text x="${x(m)}" y="${road + 34}" class="strip-label">${m === 0 ? 'halte' : m >= 1000 ? `${fmtAngka(m / 1000, 2)} km` : `${m} m`}</text>`;
  }
  const xr = x(radius);
  el.innerHTML = `<svg viewBox="0 0 ${W} 200" role="img" aria-label="Sebaran jarak sekolah ke halte terdekat">
    <rect x="${x(0)}" y="22" width="${xr - x(0)}" height="${road - 22}" rx="8" class="strip-zona"/>
    <rect x="0" y="${road}" width="${W}" height="10" rx="5" class="strip-jalan"/>
    <line x1="8" x2="${W - 8}" y1="${road + 5}" y2="${road + 5}" class="strip-marka"/>
    <line x1="${xr}" x2="${xr}" y1="16" y2="${road + 10}" class="strip-batas"/>
    <text x="${xr + 10}" y="32" class="strip-batas-label">${radius} m, sekitar ${Math.round(radius / 83.33)} menit jalan kaki</text>
    <g transform="translate(${x(0) - 48},${road - 36})"><rect width="28" height="28" rx="7" class="strip-halte"/><text x="14" y="20.5" class="strip-h">H</text></g>
    ${dots}${ticks}
    <text x="${W - 100}" y="${road - 40}" class="strip-jauh">${fmtAngka(jauh)}</text>
    <text x="${W - 100}" y="${road - 20}" class="strip-label kiri">sekolah lebih</text>
    <text x="${W - 100}" y="${road - 5}" class="strip-label kiri">dari 2 km</text>
  </svg>`;
}

function drawLegend(el, sekolah) {
  const ada = new Set(sekolah.map((f) => f.properties.jenjang || 'Tidak diketahui'));
  el.innerHTML = Object.entries(JENJANG).filter(([k]) => ada.has(k)).map(([k, c]) =>
    `<span><i class="${c === '#ffffff' ? 'kosong' : ''}" data-j="${k}" style="background:${c}"></i>${JENJANG_LABEL[k] || k}</span>`).join('');
}

async function main() {
  const radius = RADIUS.default;
  try {
    const [{ data: buf }, { data: st }] = await Promise.all([getAnalysis('buffer', { radius }), getStats()]);
    drawStrip(document.querySelector('[data-strip-canvas]'), buf.sekolah.features, radius);
    drawLegend(document.querySelector('[data-strip-legend]'), buf.sekolah.features);
    const r = buf.ringkasan;
    document.querySelector('[data-strip-summary]').innerHTML =
      `<b>${fmtAngka(r.terlayani)} dari ${fmtAngka(r.total)} sekolah</b> (${fmtAngka(r.persen, 1)}%) berjarak ${radius} m atau kurang dari halte. Sisanya perlu berjalan lebih jauh.`;
    for (const el of document.querySelectorAll('[data-stat]')) {
      const v = st.jumlah[el.dataset.stat];
      if (v !== undefined) el.textContent = fmtAngka(v);
    }
  } catch (e) {
    document.querySelector('[data-strip-summary]').textContent = `Data belum bisa dimuat. Coba muat ulang halaman.`;
  }
}
main();

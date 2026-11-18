import '@fontsource/source-serif-4/400.css';
import '@fontsource/source-serif-4/600.css';
import { initLayout as initNav } from '../lib/layout.js';
import '../styles/home.css';
import { getAnalysis, getStats } from '../lib/api.js';
import { JENJANG, RADIUS } from '../lib/config.js';
import { escapeHtml, fmtAngka } from '../lib/util.js';

initNav();

const MAX_M = 2000;
const BIN = 50;

// Diagram "jalan": sekolah ditumpuk per 50 m menurut jarak ke halte terdekat.
function drawStrip(el, sekolah, radius) {
  const W = 1000, road = 150, step = 8.5, maxStack = 13;
  const x = (m) => 40 + (Math.min(m, MAX_M) / MAX_M) * (W - 140);
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
      dots += `<circle class="strip-sekolah" cx="${x(b * BIN + BIN / 2).toFixed(1)}" cy="${road - 14 - i * step}" r="3.6" fill="${c}"
        stroke="${c === '#ffffff' ? '#9aa4b1' : 'none'}"><title>${escapeHtml(p.nama)} — ${Math.round(p.jarak_halte_m)} m</title></circle>`;
    });
    if (list.length > maxStack) dots += `<text class="strip-more" x="${x(b * BIN + BIN / 2)}" y="${road - 18 - maxStack * step}">+${list.length - maxStack}</text>`;
  }
  let ticks = '';
  for (let m = 0; m <= MAX_M; m += 250) {
    ticks += `<line x1="${x(m)}" x2="${x(m)}" y1="${road + 9}" y2="${road + 15}" class="strip-tick"/>
      <text x="${x(m)}" y="${road + 32}" class="strip-label">${m === 0 ? 'halte' : m >= 1000 ? `${fmtAngka(m / 1000, 2)} km` : `${m} m`}</text>`;
  }
  const xr = x(radius);
  el.innerHTML = `<svg viewBox="0 0 ${W} 200" role="img" aria-label="Sebaran jarak sekolah ke halte terdekat">
    <rect x="0" y="${road}" width="${W}" height="10" class="strip-road"/>
    <line x1="0" x2="${W}" y1="${road + 5}" y2="${road + 5}" class="strip-marking"/>
    <rect x="${xr}" y="20" width="${W - xr - 100}" height="${road - 20}" class="strip-beyond"/>
    <line x1="${xr}" x2="${xr}" y1="14" y2="${road + 10}" class="strip-limit"/>
    <text x="${xr + 8}" y="28" class="strip-limit-label">${radius} m, sekitar ${Math.round(radius / 83.33)} menit jalan kaki</text>
    <g transform="translate(${x(0) - 13},${road - 33})"><rect width="26" height="26" rx="2" class="strip-halte"/><text x="13" y="19" class="strip-h">H</text></g>
    ${dots}${ticks}
    <g class="strip-far"><text x="${W - 92}" y="${road - 40}" class="strip-far-n">${fmtAngka(jauh)}</text>
      <text x="${W - 92}" y="${road - 20}" class="strip-label left">sekolah lebih</text>
      <text x="${W - 92}" y="${road - 5}" class="strip-label left">dari 2 km</text></g>
  </svg>`;
}

async function main() {
  const radius = RADIUS.default;
  try {
    const [{ data: buf }, { data: st }] = await Promise.all([getAnalysis('buffer', { radius }), getStats()]);
    drawStrip(document.querySelector('[data-strip-canvas]'), buf.sekolah.features, radius);
    const r = buf.ringkasan;
    document.querySelector('[data-strip-summary]').textContent =
      `${fmtAngka(r.terlayani)} dari ${fmtAngka(r.total)} sekolah (${fmtAngka(r.persen, 1)}%) berada dalam ${radius} m dari halte.`;
    for (const el of document.querySelectorAll('[data-stat]')) {
      const v = st.jumlah[el.dataset.stat];
      if (v !== undefined) el.textContent = fmtAngka(v);
    }
  } catch (e) {
    document.querySelector('[data-strip-summary]').textContent = `Data belum bisa dimuat: ${e.message}.`;
  }
}
main();

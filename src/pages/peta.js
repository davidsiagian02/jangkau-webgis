import { initLayout as initNav, setBadge } from '../lib/layout.js';
import '../styles/peta.css';
import Heatmap from 'ol/layer/Heatmap.js';
import Feature from 'ol/Feature.js';
import { fromLonLat, toLonLat } from 'ol/proj.js';
import { circle as turfCircle } from '@turf/turf';
import { getAnalysis, getLayer, setForceFallback } from '../lib/api.js';
import { JENJANG, JENJANG_LABEL, RADIUS } from '../lib/config.js';
import { escapeHtml, fmtAngka, fmtMenit, fmtMeter } from '../lib/util.js';
import {
  areaStyle, bufferStyle, createMap, jalanStyle, hasCartoKey, DEFAULT_BASEMAP, createPopup, fasilitasStyle, fmt, halteStyle, jalurStyle,
  kandidatStyle, klikStyle, literasiStyle, readFC, sekolahStyle, vectorLayer,
} from '../lib/map.js';

initNav();
if (new URLSearchParams(location.search).has('cadangan')) setForceFallback(true);

const $ = (s) => document.querySelector(s);
const state = {
  jenjang: new Set(Object.keys(JENJANG)),
  sumber: new Set(['survei', 'osm']),
  status: new Map(), // uid → hasil buffer
  radius: RADIUS.default,
  sumberData: new Set(),
};
const srcOk = (s) => state.sumber.has(s === 'admin' ? 'survei' : s);
const statusOf = (p) => state.status.get(p.uid || p.duplikat_osm || `svy-${p.id}`);

// ---------- layer
const L = {
  area_osm: vectorLayer((f) => (srcOk('osm') && state.jenjang.has(f.get('jenjang') || 'Tidak diketahui') ? areaStyle(f.getProperties()) : null), { tipe: 'area' }),
  area_survei: vectorLayer((f) => (srcOk('survei') ? areaStyle(f.getProperties()) : null), { tipe: 'area' }),
  buffer: vectorLayer(bufferStyle(), { tipe: 'buffer' }),
  rute: vectorLayer((f) => jalurStyle(f.getProperties()), { tipe: 'jalur' }),
  jalur: vectorLayer((f) => jalurStyle(f.getProperties()), { tipe: 'jalur' }),
  jalan: vectorLayer((f) => jalanStyle(f.getProperties()), { tipe: 'jalan' }),
  sekolah: vectorLayer((f) => {
    const p = f.getProperties();
    if (!srcOk(p.sumber) || !state.jenjang.has(p.jenjang || 'Tidak diketahui')) return null;
    const s = state.status.get(p.uid);
    return sekolahStyle(p, { status: s ? s.terlayani : undefined });
  }, { tipe: 'sekolah' }),
  sekolah_survei: vectorLayer((f) => {
    const p = f.getProperties();
    if (!srcOk('survei') || !state.jenjang.has(p.jenjang || 'Tidak diketahui')) return null;
    const s = statusOf(p);
    return sekolahStyle({ ...p, sumber: 'survei' }, { status: s ? s.terlayani : undefined });
  }, { tipe: 'titik' }),
  fasilitas: vectorLayer(() => (srcOk('survei') ? fasilitasStyle() : null), { tipe: 'titik' }),
  literasi: vectorLayer(() => (srcOk('survei') ? literasiStyle() : null), { tipe: 'titik' }),
  halte: vectorLayer((f) => (srcOk(f.get('sumber')) ? halteStyle() : null), { tipe: 'halte' }),
  rekomendasi: vectorLayer((f) => kandidatStyle(f.get('rank')), { tipe: 'kandidat' }),
  klik: vectorLayer(klikStyle(), { tipe: 'klik' }),
};
L.heatmap = new Heatmap({ source: L.sekolah.getSource(), blur: 22, radius: 12, visible: false,
  gradient: ['#13284b', '#1f6f8b', '#4fb3a5', '#f5c400', '#e8590c'], properties: { tipe: 'heatmap' } });

const map = createMap('map', { zoom: 12 });
L.jalan.setVisible(false);
for (const k of ['area_osm', 'area_survei', 'buffer', 'heatmap', 'jalan', 'rute', 'jalur', 'sekolah', 'sekolah_survei', 'fasilitas', 'literasi', 'halte', 'rekomendasi', 'klik']) map.addLayer(L[k]);
const popup = createPopup(map);
window.addEventListener('temachange', () => Object.values(L).forEach((l) => l.changed()));
$('[data-basemap-carto]').hidden = !hasCartoKey;
document.querySelector(`input[name='basemap'][value='${DEFAULT_BASEMAP}']`).checked = true;
const hp = window.matchMedia('(max-width: 767px)');
if (hp.matches) document.querySelector('.legend').open = false;

window.__jangkau = { ready: false, layers: L, map, visibleJenjang: () => [...state.jenjang] };

// ---------- lembar bawah (HP): intip → setengah → penuh, bisa diketuk atau ditarik
const sheet = $('[data-sheet]');
const handle = $('[data-sheet-handle]');
const URUTAN = ['intip', 'setengah', 'penuh'];
function setSheet(st) {
  sheet.dataset.state = st;
  handle.setAttribute('aria-expanded', String(st !== 'intip'));
}
handle.addEventListener('click', () => {
  if (handle.dataset.baruDitarik) { delete handle.dataset.baruDitarik; return; }
  setSheet(URUTAN[(URUTAN.indexOf(sheet.dataset.state) + 1) % URUTAN.length]);
});
(() => {
  const kepala = $('.panel-kepala');
  const geserY = () => { const t = getComputedStyle(sheet).transform; return t === 'none' ? 0 : new DOMMatrixReadOnly(t).m42; };
  let y0 = null; let geser = 0; let tinggiAwal = 0;
  kepala.addEventListener('pointerdown', (e) => {
    if (!hp.matches || e.target.closest('[data-tab]')) return;
    y0 = e.clientY; geser = 0;
    tinggiAwal = sheet.offsetHeight - geserY();
  });
  window.addEventListener('pointermove', (e) => {
    if (y0 === null) return;
    geser = e.clientY - y0;
    if (Math.abs(geser) < 6) return;
    sheet.classList.add('ditarik');
    const terlihat = Math.max(80, Math.min(sheet.offsetHeight, tinggiAwal - geser));
    sheet.style.transform = `translateY(${sheet.offsetHeight - terlihat}px)`;
  });
  const lepas = () => {
    if (y0 === null) return;
    y0 = null;
    if (Math.abs(geser) < 6) return;
    const terlihat = sheet.offsetHeight - geserY();
    sheet.classList.remove('ditarik');
    sheet.style.transform = '';
    const target = { intip: 128, setengah: sheet.offsetHeight * 0.52, penuh: sheet.offsetHeight };
    const terdekat = Object.entries(target).sort((a, b) => Math.abs(a[1] - terlihat) - Math.abs(b[1] - terlihat))[0][0];
    handle.dataset.baruDitarik = '1';
    setTimeout(() => delete handle.dataset.baruDitarik, 50);
    setSheet(terdekat);
  };
  window.addEventListener('pointerup', lepas);
  window.addEventListener('pointercancel', lepas);
})();
$('[data-click-mode]').addEventListener('change', (e) => { if (e.target.checked && hp.matches) setSheet('intip'); });

function noteSumber(s) {
  state.sumberData.add(s);
  setBadge($('[data-sumber-badge]'), state.sumberData.has('cadangan') ? 'cadangan' : 'database');
}

function fill(layer, fc) {
  const src = layer.getSource();
  src.clear();
  src.addFeatures(readFC(fc));
}

// ---------- muat data
async function loadLayers() {
  const [titik, area, jalur, sekolah, jalan] = await Promise.all([getLayer('titik'), getLayer('area'), getLayer('jalur'), getLayer('sekolah'), getLayer('jalan')]);
  [titik, area, jalur, sekolah, jalan].forEach((r) => noteSumber(r.sumber));
  fill(L.jalan, jalan.data);
  const by = (fc, pred) => ({ type: 'FeatureCollection', features: fc.features.filter((f) => pred(f.properties)) });
  fill(L.sekolah, sekolah.data);
  fill(L.sekolah_survei, by(titik.data, (p) => p.kategori === 'sekolah' && p.sumber !== 'osm'));
  fill(L.halte, by(titik.data, (p) => p.kategori === 'halte'));
  fill(L.fasilitas, by(titik.data, (p) => p.kategori === 'fasilitas'));
  fill(L.literasi, by(titik.data, (p) => p.kategori === 'literasi'));
  fill(L.area_osm, by(area.data, (p) => p.sumber === 'osm'));
  fill(L.area_survei, by(area.data, (p) => p.sumber === 'survei'));
  fill(L.rute, by(jalur.data, (p) => p.jenis === 'rute'));
  fill(L.jalur, by(jalur.data, (p) => p.jenis === 'jalur'));
  for (const el of document.querySelectorAll('[data-count]')) {
    el.textContent = fmtAngka(L[el.dataset.count].getSource().getFeatures().length);
  }
  renderJenjang();
  const ext = L.sekolah.getSource().getExtent();
  // sisakan ruang untuk panel (kiri di desktop, bawah di HP) agar titik tidak tertutup
  if (Number.isFinite(ext[0])) map.getView().fit(ext, { padding: hp.matches ? [64, 16, 150, 16] : [90, 70, 40, 420], maxZoom: 15 });
}

function renderJenjang() {
  const counts = {};
  for (const f of L.sekolah.getSource().getFeatures()) {
    const j = f.get('jenjang') || 'Tidak diketahui';
    counts[j] = (counts[j] || 0) + 1;
  }
  $('[data-jenjang-list]').innerHTML = Object.keys(JENJANG).map((j) => `
    <label class="check"><input type="checkbox" data-jenjang-toggle="${escapeHtml(j)}" ${state.jenjang.has(j) ? 'checked' : ''} />
      <span class="swatch${j === 'Tidak diketahui' ? ' kosong' : ''}" data-j="${escapeHtml(j)}" style="background:${JENJANG[j]}"></span> ${escapeHtml(JENJANG_LABEL[j] || j)}
      <span class="count">${fmtAngka(counts[j] || 0)}</span></label>`).join('');
}

// ---------- kontrol layer
document.addEventListener('change', (e) => {
  const t = e.target;
  if (t.dataset.layerToggle) L[t.dataset.layerToggle].setVisible(t.checked);
  if (t.dataset.jenjangToggle) {
    t.checked ? state.jenjang.add(t.dataset.jenjangToggle) : state.jenjang.delete(t.dataset.jenjangToggle);
    ['sekolah', 'sekolah_survei', 'area_osm'].forEach((k) => L[k].changed());
  }
  if (t.dataset.sumberToggle) {
    t.checked ? state.sumber.add(t.dataset.sumberToggle) : state.sumber.delete(t.dataset.sumberToggle);
    Object.values(L).forEach((l) => l.changed());
  }
  if (t.name === 'basemap') map.setBasemap(t.value);
});

for (const b of document.querySelectorAll('[data-tab]')) {
  b.addEventListener('click', () => {
    for (const x of document.querySelectorAll('[data-tab]')) x.setAttribute('aria-selected', String(x === b));
    for (const p of document.querySelectorAll('[data-tabpanel]')) p.hidden = p.dataset.tabpanel !== b.dataset.tab;
    if (sheet.dataset.state === 'intip') setSheet('setengah');
  });
}

// ---------- analisis buffer + rekomendasi
const radiusInput = $('[data-radius]');
const setRadius = (r) => { state.radius = r; radiusInput.value = r; $('[data-radius-out]').textContent = fmtMeter(r); };
radiusInput.addEventListener('input', () => setRadius(Number(radiusInput.value)));
for (const b of document.querySelectorAll('[data-preset]')) b.addEventListener('click', () => setRadius(Number(b.dataset.preset)));

function zoomTo(coord3857, z = 16) { map.getView().animate({ center: coord3857, zoom: z, duration: 400 }); }

async function runAnalysis() {
  const btn = $('[data-run-analysis]');
  btn.disabled = true;
  btn.textContent = 'Menghitung…';
  try {
    const r = state.radius;
    const [{ data: b, sumber: s1 }, { data: k, sumber: s2 }] = await Promise.all([getAnalysis('buffer', { radius: r }), getAnalysis('recommend', { radius: r })]);
    noteSumber(s1); noteSumber(s2);
    state.status = new Map(b.sekolah.features.map((f) => [f.properties.uid, f.properties]));
    fill(L.buffer, b.buffer);
    fill(L.rekomendasi, k.kandidat);
    L.sekolah.changed(); L.sekolah_survei.changed();
    renderRingkasan(b);
    renderKandidat(k);
  } catch (e) {
    $('[data-ringkasan]').innerHTML = '<p class="error">Perhitungan belum berhasil. Coba tekan Hitung ulang.</p>';
  } finally {
    btn.disabled = false;
    btn.textContent = 'Hitung ulang';
  }
}

function renderRingkasan(b) {
  const g = b.ringkasan;
  const rows = Object.entries(g.per_jenjang).sort((a, c) => c[1].total - a[1].total).map(([j, v]) => {
    const pct = v.total ? (v.terlayani / v.total) * 100 : 0;
    return `<li><span class="swatch${j === 'Tidak diketahui' ? ' kosong' : ''}" data-j="${escapeHtml(j)}" style="background:${JENJANG[j] || '#fff'}"></span>
      <span class="bar-label">${escapeHtml(JENJANG_LABEL[j] || j)}</span><span class="bar"><span style="width:${pct.toFixed(1)}%"></span></span>
      <span class="bar-num">${v.terlayani}/${v.total}</span></li>`;
  }).join('');
  $('[data-ringkasan]').innerHTML = `<p class="big-line"><b>${fmtAngka(g.terlayani)}</b> dari ${fmtAngka(g.total)} sekolah (${fmtAngka(g.persen, 1)}%) berjarak ${fmtMeter(b.radius)} atau kurang dari halte.</p><ul class="bars">${rows}</ul>`;
  $('[data-ringkas]').innerHTML = `<b>${fmtAngka(g.terlayani)} dari ${fmtAngka(g.total)} sekolah</b> berjarak ${fmtMeter(b.radius)} atau kurang dari halte.`;
  const jauh = b.sekolah.features.map((f) => f.properties).filter((p) => !p.terlayani).sort((a, c) => (c.jarak_halte_m ?? 1e9) - (a.jarak_halte_m ?? 1e9)).slice(0, 15);
  const byUid = new Map(b.sekolah.features.map((f) => [f.properties.uid, f.geometry.coordinates]));
  $('[data-hasil-sekolah] tbody').innerHTML = jauh.length
    ? jauh.map((p) => `<tr data-uid="${escapeHtml(p.uid)}" tabindex="0"><td><span class="swatch${p.jenjang === 'Tidak diketahui' ? ' kosong' : ''}" data-j="${escapeHtml(p.jenjang || '')}" style="background:${JENJANG[p.jenjang] || '#fff'}"></span> ${escapeHtml(p.nama)}</td><td class="num">${fmtMeter(p.jarak_halte_m)}</td></tr>`).join('')
    : '<tr><td colspan="2">Semua sekolah sudah terjangkau pada radius ini.</td></tr>';
  for (const tr of document.querySelectorAll('[data-hasil-sekolah] tbody tr[data-uid]')) {
    const go = () => { zoomTo(fromLonLat(byUid.get(tr.dataset.uid))); if (hp.matches) setSheet('intip'); };
    tr.addEventListener('click', go);
    tr.addEventListener('keydown', (e) => e.key === 'Enter' && go());
  }
}

function renderKandidat(k) {
  const list = k.kandidat.features;
  $('[data-rekomendasi]').innerHTML = list.length ? list.map((f) => {
    const p = f.properties;
    const nama = p.sekolah.slice(0, 3).map(escapeHtml).join(', ') + (p.sekolah.length > 3 ? `, dan ${p.sekolah.length - 3} lainnya` : '');
    return `<li><button type="button" class="kandidat-btn" data-lonlat="${f.geometry.coordinates.join(',')}">
      <span class="kandidat-rank">${p.rank}</span><span><b>${p.jumlah_sekolah} sekolah</b> akan terjangkau, rata-rata jaraknya ${fmtMeter(p.jarak_rata_m)}${p.snap ? '. Letaknya sudah digeser ke jalan terdekat' : ''}<br><span class="hint">${nama}</span></span></button></li>`;
  }).join('') : '<li class="hint">Tidak ada kelompok sekolah yang perlu halte baru pada radius ini.</li>';
  $('[data-terisolasi]').textContent = k.terisolasi
    ? `${fmtAngka(k.terisolasi)} sekolah belum terjangkau tetapi letaknya terpencar, jadi tidak masuk kelompok mana pun.` : '';
  for (const b of document.querySelectorAll('.kandidat-btn')) {
    b.addEventListener('click', () => { zoomTo(fromLonLat(b.dataset.lonlat.split(',').map(Number)), 15); if (hp.matches) setSheet('intip'); });
  }
}

$('[data-run-analysis]').addEventListener('click', runAnalysis);

// ---------- overlay survei vs OSM
$('[data-run-overlay]').addEventListener('click', async () => {
  const { data, sumber } = await getAnalysis('overlay');
  noteSumber(sumber);
  $('[data-hasil-overlay] tbody').innerHTML = data.banding.map((b) => `<tr><td>${escapeHtml(b.nama_survei)}<br><span class="hint">${b.nama_osm ? `Luas hasil survei ${fmtAngka(b.luas_survei_m2)} m², di OpenStreetMap ${fmtAngka(b.luas_osm_m2 || 0)} m²` : 'Belum ada batas sekolah ini di OpenStreetMap'}</span></td><td class="num">${fmtAngka(b.iou * 100, 0)}%</td></tr>`).join('');
});

// ---------- klik peta: popup atau cari halte terdekat
function popupHtml(f, layer) {
  const p = f.getProperties();
  const tipe = layer.get('tipe');
  const row = (k, v) => (v === null || v === undefined || v === '' ? '' : `<tr><th>${k}</th><td>${escapeHtml(v)}</td></tr>`);
  const asal = (s) => ({ osm: 'OpenStreetMap', survei: 'Survei lapangan', admin: 'Ditambahkan pengelola' }[s] || s);
  if (tipe === 'sekolah' || (tipe === 'titik' && p.kategori === 'sekolah')) {
    const s = tipe === 'sekolah' ? state.status.get(p.uid) : statusOf(p);
    const st = s ? `<tr><th>Status</th><td><span class="status ${s.terlayani ? 'ok' : 'no'}">${s.terlayani ? 'Terjangkau' : 'Belum terjangkau'}</span></td></tr>${row('Halte terdekat', s.halte_terdekat)}${row('Jarak', fmtMeter(s.jarak_halte_m))}` : '';
    return `<h3>${escapeHtml(p.nama)}</h3><table>${row('Jenjang', JENJANG_LABEL[p.jenjang] || p.jenjang)}${row('Asal data', asal(p.sumber))}${st}</table>`;
  }
  if (tipe === 'halte') return `<h3>${escapeHtml(p.nama)}</h3><table>${row('Jenis', 'Halte bus')}${row('Asal data', asal(p.sumber))}${row('Keterangan', p.deskripsi)}</table>`;
  if (tipe === 'titik') return `<h3>${escapeHtml(p.nama)}</h3><table>${row('Kategori', p.kategori)}${row('Keterangan', p.deskripsi)}${row('Waktu survei', p.waktu_survei && new Date(p.waktu_survei).toLocaleString('id-ID'))}</table>`;
  if (tipe === 'area') return `<h3>${escapeHtml(p.nama)}</h3><table>${row('Jenjang', JENJANG_LABEL[p.jenjang] || p.jenjang)}${row('Luas', `${fmtAngka(p.luas_m2)} m²`)}${row('Asal data', asal(p.sumber))}</table>`;
  if (tipe === 'jalur') {
    const m = Number(p.panjang_m);
    return `<h3>${escapeHtml(p.nama)}</h3><table>${row('Panjang', fmtMeter(m))}${row('Jalan kaki', fmtMenit(m / 83.33))}${row('Bersepeda', fmtMenit(m / 250))}</table>`;
  }
  if (tipe === 'jalan') return `<h3>${escapeHtml(p.nama)}</h3><table>${row('Kelas jalan', p.kelas)}${row('Panjang ruas', fmtMeter(Number(p.panjang_m)))}${row('Asal data', 'OpenStreetMap')}</table>`;
  if (tipe === 'kandidat') return `<h3>Usulan halte #${p.rank}</h3><p>${p.jumlah_sekolah} sekolah akan terjangkau dalam ${fmtMeter(state.radius)}.</p>`;
  return null;
}

async function nearestAt(coord) {
  const [lon, lat] = toLonLat(coord);
  const out = $('[data-hasil-klik]');
  out.innerHTML = '<p class="hint">Mencari halte terdekat…</p>';
  try {
    const { data, sumber } = await getAnalysis('nearest', { lon: lon.toFixed(6), lat: lat.toFixed(6), radius: state.radius });
    noteSumber(sumber);
    const src = L.klik.getSource();
    src.clear();
    const ring = turfCircle([lon, lat], state.radius / 1000, { units: 'kilometers', steps: 48 });
    src.addFeatures([fmt.readFeature(ring), new Feature({ geometry: fmt.readGeometry({ type: 'Point', coordinates: [lon, lat] }) })]);
    const h = data.halte;
    out.innerHTML = `<p><b>Halte terdekat:</b> ${h ? `${escapeHtml(h.nama)}, ${fmtMeter(h.jarak_m)} (${fmtMenit(h.waktu_menit)} jalan kaki)` : 'belum ada data halte'}</p>
      <p><b>${data.sekolah.length} sekolah</b> dalam radius ${fmtMeter(state.radius)}${data.sekolah.length ? ':' : '.'}</p>
      ${data.sekolah.length ? `<ul class="mini">${data.sekolah.slice(0, 8).map((s) => `<li>${escapeHtml(s.nama)} <span class="hint">${fmtMeter(s.jarak_m)}</span></li>`).join('')}</ul>` : ''}`;
    if (hp.matches) setSheet('setengah');
  } catch (e) {
    out.innerHTML = '<p class="error">Halte terdekat belum bisa dicari. Coba ketuk peta sekali lagi.</p>';
  }
}

map.on('singleclick', (evt) => {
  if ($('[data-click-mode]').checked) { popup.hide(); nearestAt(evt.coordinate); return; }
  let hit = null;
  map.forEachFeatureAtPixel(evt.pixel, (f, layer) => { if (layer && !hit) { const html = popupHtml(f, layer); if (html) hit = html; } }, { hitTolerance: 4 });
  hit ? popup.show(evt.coordinate, hit) : popup.hide();
});
map.on('pointermove', (evt) => {
  if (evt.dragging) return;
  map.getTargetElement().style.cursor = map.hasFeatureAtPixel(evt.pixel, { hitTolerance: 4 }) || $('[data-click-mode]').checked ? 'pointer' : '';
});

// ---------- mulai
(async () => {
  try {
    await loadLayers();
    await runAnalysis();
  } catch (e) {
    setBadge($('[data-sumber-badge]'), 'cadangan');
    $('[data-sumber-badge]').textContent = 'Data belum bisa dimuat';
  }
  window.__jangkau.ready = true;
})();

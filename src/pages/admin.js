import { initLayout as initNav } from '../lib/layout.js';
import '../styles/admin.css';
import Feature from 'ol/Feature.js';
import Point from 'ol/geom/Point.js';
import { fromLonLat, toLonLat } from 'ol/proj.js';
import { adminLogin, createTitik, deleteTitik, listTitik, updateTitik } from '../lib/api.js';
import { JENJANG, JENJANG_LABEL, KATEGORI } from '../lib/config.js';
import { escapeHtml } from '../lib/util.js';
import { createMap, fasilitasStyle, halteStyle, klikStyle, literasiStyle, readFC, sekolahStyle, vectorLayer } from '../lib/map.js';

initNav();
const $ = (s) => document.querySelector(s);
const store = { get: () => { try { return sessionStorage.getItem('jangkau-admin'); } catch { return null; } },
  set: (v) => { try { v ? sessionStorage.setItem('jangkau-admin', v) : sessionStorage.removeItem('jangkau-admin'); } catch { /* mode privat */ } } };
let key = null;
let map = null;
let rows = [];
let editId = null;
const PER_HALAMAN = 25;
let batas = PER_HALAMAN;
const form = $('[data-form]');
const asal = (s) => ({ osm: 'OpenStreetMap', survei: 'Survei lapangan', admin: 'Tambahan pengelola' })[s] || s;

form.jenjang.innerHTML = Object.keys(JENJANG).map((j) => `<option value="${escapeHtml(j)}">${escapeHtml(JENJANG_LABEL[j] || j)}</option>`).join('');
form.jenjang.value = 'Tidak diketahui';
const syncJenjang = () => { $('[data-jenjang-field]').hidden = form.kategori.value !== 'sekolah'; };
form.kategori.addEventListener('change', syncJenjang);
syncJenjang();

const titikLayer = vectorLayer((f) => {
  const p = f.getProperties();
  if (p.kategori === 'halte') return halteStyle();
  if (p.kategori === 'fasilitas') return fasilitasStyle();
  if (p.kategori === 'literasi') return literasiStyle();
  return sekolahStyle(p);
});
const pilihLayer = vectorLayer(klikStyle());

function initMap() {
  if (map) return;
  map = createMap('map', { zoom: 12 });
  map.addLayer(titikLayer);
  map.addLayer(pilihLayer);
  map.on('singleclick', (e) => {
    const [lon, lat] = toLonLat(e.coordinate);
    form.lon.value = lon.toFixed(6);
    form.lat.value = lat.toFixed(6);
    mark(e.coordinate);
  });
}
const mark = (coord) => { pilihLayer.getSource().clear(); pilihLayer.getSource().addFeature(new Feature(new Point(coord))); };

async function refresh() {
  const fc = await listTitik();
  rows = fc.features;
  titikLayer.getSource().clear();
  titikLayer.getSource().addFeatures(readFC(fc));
  renderTable();
}

function renderTable() {
  const f = $('[data-filter]').value;
  const list = rows.filter((r) => !f || (f === 'halte' ? r.properties.kategori === 'halte' : r.properties.sumber === f))
    .sort((a, b) => b.properties.id - a.properties.id);
  $('[data-tabel-titik] tbody').innerHTML = list.slice(0, batas).map((r) => {
    const p = r.properties;
    const [lon, lat] = r.geometry.coordinates;
    return `<tr data-id="${p.id}"><td class="num no" data-label="No. titik">${p.id}</td><td class="nama" data-label="Nama">${escapeHtml(p.nama)}</td><td data-label="Jenis">${escapeHtml(KATEGORI[p.kategori]?.nama || p.kategori)}</td>
      <td data-label="Asal data">${escapeHtml(asal(p.sumber))}</td><td data-label="Lokasi">${lat.toFixed(5)}, ${lon.toFixed(5)}</td>
      <td class="aksi" data-label="Aksi"><button type="button" class="btn btn-small" data-edit>Ubah</button> <button type="button" class="btn btn-small btn-danger" data-hapus>Hapus</button></td></tr>`;
  }).join('') || '<tr class="kosong"><td colspan="6">Belum ada titik.</td></tr>';
  const n = Math.min(batas, list.length);
  $('[data-titik-info]').textContent = `Menampilkan ${n} dari ${list.length} titik.`;
  const lebih = $('[data-lebih-titik]');
  lebih.hidden = n >= list.length;
  lebih.textContent = `Tampilkan ${Math.min(PER_HALAMAN, list.length - n)} titik lagi`;
}

function msg(text, isError) {
  const el = $('[data-form-msg]');
  el.textContent = text;
  el.className = isError ? 'error' : 'ok-msg';
}

function resetForm() {
  editId = null;
  form.reset();
  form.jenjang.value = 'Tidak diketahui';
  syncJenjang();
  $('[data-form-title]').textContent = 'Tambah titik baru';
  $('[data-simpan]').textContent = 'Simpan titik';
  $('[data-batal]').hidden = true;
  pilihLayer.getSource().clear();
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const body = { nama: form.nama.value, kategori: form.kategori.value, jenjang: form.kategori.value === 'sekolah' ? form.jenjang.value : null,
    deskripsi: form.deskripsi.value, lon: form.lon.value.replace(',', '.'), lat: form.lat.value.replace(',', '.') };
  const btn = $('[data-simpan]');
  btn.disabled = true;
  try {
    if (editId) await updateTitik(key, editId, body); else await createTitik(key, body);
    msg(editId ? 'Perubahan tersimpan.' : 'Titik baru tersimpan dan sudah tampil di peta.');
    resetForm();
    await refresh();
  } catch (err) {
    msg(err.message, true);
  } finally {
    btn.disabled = false;
  }
});
$('[data-batal]').addEventListener('click', () => { resetForm(); msg(''); });
$('[data-filter]').addEventListener('change', () => { batas = PER_HALAMAN; renderTable(); });
$('[data-lebih-titik]').addEventListener('click', () => { batas += PER_HALAMAN; renderTable(); });

$('[data-tabel-titik]').addEventListener('click', async (e) => {
  const tr = e.target.closest('tr[data-id]');
  if (!tr) return;
  const r = rows.find((x) => String(x.properties.id) === tr.dataset.id);
  if (!r) return;
  const p = r.properties;
  if (e.target.closest('[data-edit]')) {
    editId = p.id;
    form.nama.value = p.nama;
    form.kategori.value = p.kategori;
    form.jenjang.value = p.jenjang || 'Tidak diketahui';
    form.deskripsi.value = p.deskripsi || '';
    [form.lon.value, form.lat.value] = r.geometry.coordinates.map((c) => c.toFixed(6));
    syncJenjang();
    $('[data-form-title]').textContent = `Ubah titik: ${p.nama}`;
    $('[data-simpan]').textContent = 'Simpan perubahan';
    $('[data-batal]').hidden = false;
    const c = fromLonLat(r.geometry.coordinates);
    mark(c);
    map.getView().animate({ center: c, zoom: 17, duration: 300 });
    form.nama.focus();
  }
  if (e.target.closest('[data-hapus]')) {
    if (!window.confirm(`Hapus titik "${p.nama}"? Titik ini akan hilang dari peta.`)) return;
    try {
      await deleteTitik(key, p.id);
      msg(`Titik "${p.nama}" dihapus.`);
      if (editId === p.id) resetForm();
      await refresh();
    } catch (err) {
      msg(err.message, true);
    }
  }
});

async function login(pw, silent) {
  const err = $('[data-login-error]');
  err.textContent = '';
  try {
    await adminLogin(pw);
    key = pw;
    store.set(pw);
    $('[data-login-box]').hidden = true;
    $('[data-admin-app]').hidden = false;
    initMap();
    await refresh();
  } catch (e) {
    store.set(null);
    if (!silent) err.textContent = e.message;
  }
}

$('[data-login-form]').addEventListener('submit', (e) => { e.preventDefault(); login($('[data-password]').value, false); });
$('[data-logout]').addEventListener('click', () => { store.set(null); location.reload(); });
const saved = store.get();
if (saved) login(saved, true);

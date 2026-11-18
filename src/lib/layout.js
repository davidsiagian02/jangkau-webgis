// Kerangka bersama: font, gaya dasar, tema gelap/terang, dan label sumber data.
import '@fontsource/overpass/latin-400.css';
import '@fontsource/overpass/latin-600.css';
import '@fontsource/overpass/latin-800.css';
import '../styles/base.css';

const KUNCI = 'jangkau-tema';
const root = document.documentElement;
const gerakDikurangi = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export function getTheme() {
  return root.dataset.theme === 'dark' ? 'dark' : 'light';
}

function simpan(tema) {
  try { localStorage.setItem(KUNCI, tema); } catch { /* penyimpanan diblokir: tema tetap berlaku di halaman ini */ }
}
function tersimpan() {
  try { return localStorage.getItem(KUNCI); } catch { return null; }
}

function terapkan(tema) {
  root.dataset.theme = tema;
  const label = tema === 'dark' ? 'Ganti ke tema terang' : 'Ganti ke tema gelap';
  document.querySelectorAll('[data-theme-toggle]').forEach((b) => b.setAttribute('aria-label', label));
  window.dispatchEvent(new CustomEvent('temachange', { detail: tema }));
}

export function setTheme(tema) {
  simpan(tema);
  if (document.startViewTransition && !gerakDikurangi()) document.startViewTransition(() => terapkan(tema));
  else terapkan(tema);
}

export function initLayout() {
  terapkan(getTheme());
  document.querySelectorAll('[data-theme-toggle]').forEach((b) => b.addEventListener('click', () => setTheme(getTheme() === 'dark' ? 'light' : 'dark')));
  // Ikuti perubahan tema sistem selama pengguna belum memilih sendiri.
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', (e) => {
    if (!tersimpan()) terapkan(e.matches ? 'dark' : 'light');
  });
}

export function setBadge(el, sumber) {
  if (!el) return;
  const salinan = sumber === 'cadangan';
  el.textContent = salinan ? 'Data salinan' : 'Data terkini';
  el.classList.toggle('cadangan', salinan);
  el.title = salinan
    ? 'Server sedang tidak terhubung. Peta menampilkan salinan data terakhir dan perhitungan dilakukan di perangkat Anda.'
    : 'Data dan perhitungan diambil langsung dari server.';
}

// kompatibilitas nama lama
export const initNav = initLayout;

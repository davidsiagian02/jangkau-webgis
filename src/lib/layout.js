// Navigasi bersama: tombol menu di layar kecil.
import '@fontsource/overpass/400.css';
import '@fontsource/overpass/600.css';
import '@fontsource/overpass/700.css';
import '@fontsource/overpass/800.css';
import '../styles/base.css';

export function initNav() {
  const btn = document.querySelector('.nav-toggle');
  const list = document.querySelector('.nav ul');
  if (!btn || !list) return;
  btn.addEventListener('click', () => {
    const open = list.classList.toggle('open');
    btn.setAttribute('aria-expanded', String(open));
  });
}

export function setBadge(el, sumber) {
  if (!el) return;
  const cadangan = sumber === 'cadangan';
  el.textContent = cadangan ? 'Data cadangan (GeoJSON)' : 'Database PostGIS';
  el.classList.toggle('cadangan', cadangan);
  el.title = cadangan
    ? 'Database tidak terhubung. Peta memakai salinan data GeoJSON dan analisis dijalankan di browser.'
    : 'Data dan analisis diambil langsung dari database PostgreSQL + PostGIS.';
}

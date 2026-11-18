// Diorama kota mini (CSS 3D murni, tanpa library): jalan, halte, sekolah, bus, siswa, dan zona jalan kaki.
import '../styles/diorama.css';

// Satuan = piksel pada lantai 560 × 560 sebelum diskalakan.
const HALTE = { x: 318, y: 292 };
const RADIUS = 168; // ≈ 500 m pada skala diorama

function balok(cls, { x, y, w, d, h, z = 0, atap }, isi = '') {
  const gaya = `--x:${x}px;--y:${y}px;--w:${w}px;--d:${d}px;--h-akhir:${h}px;--z:${z}px;${atap ? `--atap:${atap};` : ''}`;
  return `<div class="balok ${cls}" style="${gaya}"><i class="n"></i><i class="w"></i><i class="e"></i><i class="s">${isi}</i><i class="atas"></i></div>`;
}

function markup() {
  const gedung = [
    // sekolah di dalam zona (SD, atap merah)
    balok('gedung sd', { x: 360, y: 118, w: 128, d: 74, h: 46, atap: 'var(--dio-sd)' }),
    // sekolah di luar zona (SMP, atap biru dongker) — mendapat usulan halte
    balok('gedung smp', { x: 40, y: 46, w: 112, d: 70, h: 54, atap: 'var(--dio-smp)' }),
    // sekolah di seberang jalan (SMA, atap abu-abu)
    balok('gedung sma', { x: 86, y: 392, w: 132, d: 82, h: 40, atap: 'var(--dio-sma)' }),
  ].join('');
  const pohon = [[250, 70], [282, 96], [470, 230], [28, 300], [430, 420], [462, 446], [300, 470]]
    .map(([x, y], i) => balok('pohon', { x, y, w: 16, d: 16, h: 16 + (i % 3) * 6 })).join('');
  const halte = [
    balok('tiang', { x: HALTE.x - 20, y: HALTE.y - 4, w: 3, d: 3, h: 28 }),
    balok('tiang', { x: HALTE.x + 18, y: HALTE.y - 4, w: 3, d: 3, h: 28 }),
    balok('atap-halte', { x: HALTE.x - 24, y: HALTE.y - 14, w: 50, d: 16, h: 4, z: 28 }),
    balok('tiang', { x: HALTE.x + 34, y: HALTE.y - 2, w: 3, d: 3, h: 42 }),
    balok('papan', { x: HALTE.x + 28, y: HALTE.y - 1, w: 16, d: 2, h: 16, z: 42 }, '<b>H</b>'),
  ].join('');
  const siswa = [0, 1, 2].map((i) => `<div class="siswa" style="--tunda:${(i * 0.9).toFixed(1)}s">${balok('badan', { x: 0, y: 0, w: 7, d: 7, h: 13 })}</div>`).join('');
  return `
    <div class="panggung"><div class="lantai">
      <div class="blok" style="--x:24px;--y:24px;--w:250px;--d:230px"></div>
      <div class="blok" style="--x:300px;--y:24px;--w:236px;--d:230px"></div>
      <div class="blok" style="--x:24px;--y:360px;--w:512px;--d:176px"></div>
      <div class="jalan datar" style="--x:0px;--y:${HALTE.y - 2}px;--w:560px;--d:52px"><span></span></div>
      <div class="jalan tegak" style="--x:272px;--y:0px;--w:26px;--d:${HALTE.y - 2}px"></div>
      <div class="cincin" style="--cx:${HALTE.x}px;--cy:${HALTE.y}px;--r:${RADIUS}px"></div>
      <div class="cincin denyut" style="--cx:${HALTE.x}px;--cy:${HALTE.y}px;--r:${RADIUS}px"></div>
      <div class="usulan" style="--x:150px;--y:134px"><span></span></div>
      ${gedung}${pohon}<div class="halte">${halte}</div>${siswa}
      <div class="bus">${balok('badan-bus', { x: 0, y: HALTE.y + 6, w: 118, d: 36, h: 34 }, '<span class="jendela"></span>')}</div>
    </div></div>`;
}

export function mountDiorama(el) {
  el.innerHTML = markup();
  const lantai = el.querySelector('.lantai');
  const ukur = () => el.style.setProperty('--skala', Math.min(1, el.clientWidth / 740).toFixed(3));
  ukur();
  const ro = new ResizeObserver(ukur);
  ro.observe(el);

  // Jeda animasi saat diorama tidak terlihat di layar (hemat baterai/CPU).
  const io = new IntersectionObserver(([e]) => el.classList.toggle('jeda', !e.isIntersecting), { threshold: 0.05 });
  io.observe(el);

  // Miring pelan mengikuti kursor (desktop saja).
  const area = el.closest('[data-tilt-area]') || el;
  const gerak = (e) => {
    const r = area.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width - 0.5;
    const py = (e.clientY - r.top) / r.height - 0.5;
    lantai.style.setProperty('--rz', `${(-36 + px * 12).toFixed(2)}deg`);
    lantai.style.setProperty('--rx', `${(58 - py * 8).toFixed(2)}deg`);
  };
  const reset = () => { lantai.style.removeProperty('--rz'); lantai.style.removeProperty('--rx'); };
  const halus = window.matchMedia('(hover: hover) and (prefers-reduced-motion: no-preference)').matches;
  if (halus) { area.addEventListener('pointermove', gerak); area.addEventListener('pointerleave', reset); }

  requestAnimationFrame(() => el.classList.add('siap'));
  return () => { ro.disconnect(); io.disconnect(); area.removeEventListener('pointermove', gerak); area.removeEventListener('pointerleave', reset); };
}

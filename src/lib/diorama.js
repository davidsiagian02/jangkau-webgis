// Diorama kota mini (CSS 3D murni, tanpa library): jalan, halte, sekolah beratap genteng, bus, mobil,
// siswa, pohon, dan zona jalan kaki. Semua bentuk dibuat dari bidang datar yang diputar di ruang 3D.
import '../styles/diorama.css';

// Satuan = piksel pada lantai 560 × 560 sebelum diskalakan.
const HALTE = { x: 318, y: 292 };
const RADIUS = 168; // ≈ 500 m pada skala diorama
const JALAN_Y = HALTE.y - 2; // tepi atas jalan mendatar

const gaya = (o) => Object.entries(o).map(([k, v]) => `--${k}:${v}`).join(';');

// Balok: alas w×d di lantai, tinggi h, melayang setinggi z. `isiS` masuk ke sisi selatan (yang menghadap kamera),
// `ekstra` ditaruh di dalam balok sehingga ikut mewarisi tinggi --h (dipakai untuk atap).
function balok(cls, { x, y, w, d, h, z = 0, atap }, isiS = '', ekstra = '') {
  const v = gaya({ x: `${x}px`, y: `${y}px`, w: `${w}px`, d: `${d}px`, 'h-akhir': `${h}px`, z: `${z}px`, ...(atap ? { atap } : {}) });
  return `<div class="balok ${cls}" style="${v}"><i class="n"></i><i class="w"></i><i class="e"></i><i class="s">${isiS}</i><i class="atas"></i>${ekstra}</div>`;
}

// Atap pelana (genteng) di atas balok: dua bidang miring + dua segitiga di ujungnya.
function atapPelana(d, r, o = 6) {
  const setengah = (d + 2 * o) / 2;
  const L = Math.hypot(setengah, r);
  const t = (Math.atan2(r, setengah) * 180) / Math.PI;
  const v = gaya({ o: `${o}px`, L: `${L.toFixed(2)}px`, t: `${t.toFixed(2)}deg`, r: `${r}px` });
  return `<div class="atap-pelana" style="${v}"><i class="lereng utara"></i><i class="lereng selatan"></i><i class="ujung barat"></i><i class="ujung timur"></i></div>`;
}

function sekolah(jenjang, { x, y, w, d, h, r }) {
  return `<div class="bayang" style="${gaya({ x: `${x}px`, y: `${y}px`, w: `${w}px`, d: `${d}px` })}"></div>`
    + balok(`gedung ${jenjang}`, { x, y, w, d, h, atap: `var(--dio-${jenjang})` }, '', atapPelana(d, r));
}

// Benda tegak yang selalu menghadap kamera (pohon, orang): diputar balik terhadap kemiringan lantai.
const pohon = ([x, y, s]) => `<div class="pohon" style="${gaya({ x: `${x}px`, y: `${y}px`, s: `${s}px` })}"><div class="bb"><i class="batang"></i><i class="daun"></i></div></div>`;

function markup() {
  const gedung = [
    // SD di dalam zona jalan kaki (atap merah), SMP di luar zona (biru dongker), SMA di seberang jalan (abu-abu)
    sekolah('sd', { x: 360, y: 112, w: 128, d: 62, h: 45, r: 18 }),
    sekolah('smp', { x: 40, y: 44, w: 112, d: 58, h: 60, r: 17 }),
    sekolah('sma', { x: 84, y: 396, w: 136, d: 64, h: 45, r: 18 }),
  ].join('');
  const pepohonan = [[62, 176, 22], [118, 214, 18], [232, 62, 20], [232, 214, 24], [334, 64, 20], [514, 86, 18],
    [516, 216, 22], [262, 404, 22], [300, 486, 18], [446, 404, 24], [494, 480, 20], [40, 494, 18]].map(pohon).join('');
  const halte = [
    balok('tiang', { x: 298, y: 286, w: 3, d: 3, h: 26 }),
    balok('tiang', { x: 338, y: 286, w: 3, d: 3, h: 26 }),
    balok('kaca', { x: 298, y: 276, w: 42, d: 2, h: 22 }),
    balok('bangku', { x: 304, y: 280, w: 28, d: 5, h: 5 }),
    balok('atap-halte', { x: 293, y: 273, w: 52, d: 19, h: 3, z: 26 }),
    balok('tiang', { x: 352, y: 287, w: 2, d: 2, h: 38 }),
    balok('papan', { x: 346, y: 288, w: 13, d: 2, h: 13, z: 36 }, '<b>H</b>'),
  ].join('');
  const lampu = [[250, 278], [436, 278], [178, 348]].map(([x, y]) => `<div class="cahaya" style="${gaya({ x: `${x}px`, y: `${y}px` })}"></div>`
    + balok('tiang lampu', { x, y, w: 2, d: 2, h: 32 }) + balok('kepala-lampu', { x: x - 3, y: y - 1, w: 9, d: 4, h: 2, z: 32 })).join('');
  const siswa = [['sd', 0], ['sd', 0.9], ['smp', 1.8]].map(([j, t]) => `<div class="siswa ${j}" style="--tunda:${t}s"><div class="bb orang"></div></div>`).join('');
  return `
    <div class="panggung"><div class="lantai">
      <i class="tepi selatan"></i><i class="tepi barat"></i>
      <div class="blok" style="--x:24px;--y:24px;--w:248px;--d:230px"></div>
      <div class="blok" style="--x:300px;--y:24px;--w:236px;--d:230px"></div>
      <div class="blok" style="--x:24px;--y:362px;--w:512px;--d:174px"></div>
      <div class="lapangan" style="--x:378px;--y:196px;--w:96px;--d:46px"></div>
      <div class="jalan datar" style="--x:0px;--y:${JALAN_Y}px;--w:560px;--d:54px"><span></span></div>
      <div class="jalan tegak" style="--x:272px;--y:0px;--w:26px;--d:${JALAN_Y}px"><span></span></div>
      <div class="zebra" style="--x:236px;--y:${JALAN_Y + 3}px;--w:24px;--d:48px"></div>
      <div class="cincin" style="--cx:${HALTE.x}px;--cy:${HALTE.y}px;--r:${RADIUS}px"></div>
      <div class="cincin denyut" style="--cx:${HALTE.x}px;--cy:${HALTE.y}px;--r:${RADIUS}px"></div>
      <div class="usulan" style="--x:154px;--y:130px"><span></span></div>
      ${gedung}
      ${balok('tiang bendera-tiang', { x: 424, y: 214, w: 2, d: 2, h: 46 })}
      <div class="bendera" style="--x:426px;--y:215px"></div>
      ${pepohonan}${lampu}<div class="halte">${halte}</div>${siswa}
      <div class="bus">
        <div class="bayang" style="--x:0px;--y:${HALTE.y + 2}px;--w:96px;--d:22px"></div>
        ${balok('badan-bus', { x: 0, y: HALTE.y + 2, w: 96, d: 22, h: 26 }, '<span class="jendela"></span><span class="pintu"></span>')}
        ${balok('ac-bus', { x: 34, y: HALTE.y + 6, w: 28, d: 14, h: 4, z: 26 })}
      </div>
      <div class="mobil">
        <div class="bayang" style="--x:0px;--y:${JALAN_Y + 33}px;--w:30px;--d:14px"></div>
        ${balok('badan-mobil', { x: 0, y: JALAN_Y + 33, w: 30, d: 14, h: 7 })}
        ${balok('kabin-mobil', { x: 6, y: JALAN_Y + 34, w: 16, d: 12, h: 6, z: 7 })}
      </div>
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

  // Miring pelan mengikuti kursor (desktop saja). Diperbarui paling banyak sekali per frame.
  const area = el.closest('[data-tilt-area]') || el;
  let antre = 0;
  const gerak = (e) => {
    if (antre) return;
    antre = requestAnimationFrame(() => {
      antre = 0;
      const r = area.getBoundingClientRect();
      const px = (e.clientX - r.left) / r.width - 0.5;
      const py = (e.clientY - r.top) / r.height - 0.5;
      lantai.style.setProperty('--rz', `${(-36 + px * 12).toFixed(2)}deg`);
      lantai.style.setProperty('--rx', `${(58 - py * 8).toFixed(2)}deg`);
    });
  };
  const reset = () => { lantai.style.removeProperty('--rz'); lantai.style.removeProperty('--rx'); };
  const halus = window.matchMedia('(hover: hover) and (prefers-reduced-motion: no-preference)').matches;
  if (halus) { area.addEventListener('pointermove', gerak); area.addEventListener('pointerleave', reset); }

  requestAnimationFrame(() => el.classList.add('siap'));
  return () => { ro.disconnect(); io.disconnect(); area.removeEventListener('pointermove', gerak); area.removeEventListener('pointerleave', reset); };
}

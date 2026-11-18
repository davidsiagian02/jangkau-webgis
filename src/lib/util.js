export function escapeHtml(v) {
  if (v === null || v === undefined) return '';
  return String(v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

const nf = (d) => new Intl.NumberFormat('id-ID', { maximumFractionDigits: d });

export function fmtMeter(m) {
  if (m === null || m === undefined || Number.isNaN(m)) return '–';
  return m < 1000 ? `${nf(0).format(Math.round(m))} m` : `${nf(2).format(m / 1000)} km`;
}

export function fmtMenit(min) {
  if (min === null || min === undefined) return '–';
  return `${nf(0).format(Math.round(min))} menit`;
}

export const fmtAngka = (n, d = 0) => nf(d).format(n);

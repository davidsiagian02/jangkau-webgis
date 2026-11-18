// Peta OpenLayers: basemap, gaya layer, popup. Dipakai halaman Peta dan Admin.
import 'ol/ol.css';
import Map from 'ol/Map.js';
import View from 'ol/View.js';
import Overlay from 'ol/Overlay.js';
import TileLayer from 'ol/layer/Tile.js';
import VectorLayer from 'ol/layer/Vector.js';
import VectorSource from 'ol/source/Vector.js';
import OSM from 'ol/source/OSM.js';
import XYZ from 'ol/source/XYZ.js';
import GeoJSON from 'ol/format/GeoJSON.js';
import { Circle as CircleStyle, Fill, RegularShape, Stroke, Style, Text } from 'ol/style.js';
import { defaults as defaultControls, ScaleLine } from 'ol/control.js';
import { fromLonLat } from 'ol/proj.js';
import { JENJANG, KATEGORI, PUSAT_PETA } from './config.js';

export const fmt = new GeoJSON({ featureProjection: 'EPSG:3857' });
export const readFC = (fc) => fmt.readFeatures(fc);

const ATTR_OSM = '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">kontributor OpenStreetMap</a>';
// CARTO sekarang wajib memakai API key (gratis di carto.com/basemaps/apikey). Isi VITE_CARTO_KEY di .env.local / Vercel.
const CARTO_KEY = (import.meta.env && import.meta.env.VITE_CARTO_KEY) || '';
export const hasCartoKey = Boolean(CARTO_KEY);
export const DEFAULT_BASEMAP = hasCartoKey ? 'terang' : 'osm';

export const BASEMAPS = {
  terang: { nama: 'Peta terang (CARTO)', source: () => new XYZ({ url: `https://basemaps.cartocdn.com/rastertiles/light_all/{z}/{x}/{y}.png?key=${encodeURIComponent(CARTO_KEY)}`, attributions: `${ATTR_OSM} © CARTO`, crossOrigin: 'anonymous' }) },
  osm: { nama: 'OpenStreetMap', source: () => new OSM({ attributions: ATTR_OSM }) },
  citra: { nama: 'Citra satelit (Esri)', source: () => new XYZ({ url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', attributions: 'Citra © Esri, Maxar, Earthstar Geographics', maxZoom: 19 }) },
};

export function createMap(target, { zoom = 13, basemap = DEFAULT_BASEMAP } = {}) {
  const base = new TileLayer({ source: BASEMAPS[basemap].source(), properties: { basemap } });
  const map = new Map({
    target,
    layers: [base],
    view: new View({ center: fromLonLat(PUSAT_PETA), zoom, minZoom: 10, maxZoom: 19 }),
    controls: defaultControls({ attributionOptions: { collapsible: true } }).extend([new ScaleLine({ units: 'metric' })]),
  });
  map.setBasemap = (key) => { base.setSource(BASEMAPS[key].source()); base.set('basemap', key); };
  return map;
}

export function vectorLayer(style, props = {}) {
  return new VectorLayer({ source: new VectorSource(), style, properties: props });
}

// ---------- gaya penanda
const cache = {};
const memo = (k, f) => (cache[k] ||= f());
const white = new Stroke({ color: '#ffffff', width: 1.5 });

export function jenjangFill(j) { return JENJANG[j] || JENJANG['Tidak diketahui']; }

export function sekolahStyle(p, { status } = {}) {
  const j = p.jenjang || 'Tidak diketahui';
  const kosong = j === 'Tidak diketahui';
  const belum = status === false;
  const survei = p.sumber === 'survei' || p.sumber === 'admin';
  return memo(`s|${j}|${belum}|${survei}`, () => new Style({
    image: new CircleStyle({
      radius: belum ? 7.5 : 5.5,
      fill: new Fill({ color: jenjangFill(j) }),
      stroke: belum ? new Stroke({ color: '#13284b', width: 2, lineDash: [3, 2] })
        : survei ? new Stroke({ color: '#13284b', width: 2 }) : kosong ? new Stroke({ color: '#5b6573', width: 1.5 }) : white,
    }),
    zIndex: belum ? 3 : 2,
  }));
}

export const halteStyle = (label) => memo(`h|${label || ''}`, () => new Style({
  image: new RegularShape({ points: 4, radius: 9, angle: Math.PI / 4, fill: new Fill({ color: KATEGORI.halte.warna }), stroke: new Stroke({ color: '#13284b', width: 1.5 }) }),
  text: new Text({ text: label || 'H', font: '800 10px Overpass, sans-serif', fill: new Fill({ color: '#13284b' }), offsetY: 1 }),
  zIndex: 5,
}));

export const fasilitasStyle = () => memo('f', () => new Style({
  image: new RegularShape({ points: 4, radius: 6, fill: new Fill({ color: KATEGORI.fasilitas.warna }), stroke: white }), zIndex: 4,
}));
export const literasiStyle = () => memo('l', () => new Style({
  image: new RegularShape({ points: 3, radius: 7, fill: new Fill({ color: KATEGORI.literasi.warna }), stroke: white }), zIndex: 4,
}));

export function areaStyle(p) {
  if (p.sumber === 'survei') {
    return memo('a|survei', () => new Style({ stroke: new Stroke({ color: '#13284b', width: 2.5, lineDash: [6, 4] }), fill: new Fill({ color: 'rgba(19,40,75,0.06)' }) }));
  }
  const c = jenjangFill(p.jenjang);
  const hex = c === '#ffffff' ? '#7a828c' : c;
  return memo(`a|${hex}`, () => new Style({ stroke: new Stroke({ color: hex, width: 1 }), fill: new Fill({ color: `${hex}2e` }) }));
}

export function jalurStyle(p) {
  return p.jenis === 'rute'
    ? memo('j|rute', () => new Style({ stroke: new Stroke({ color: '#39424e', width: 3.5 }) }))
    : memo('j|jalur', () => [new Style({ stroke: new Stroke({ color: '#ffffff', width: 5 }) }), new Style({ stroke: new Stroke({ color: '#0b7285', width: 3, lineDash: [8, 5] }) })]);
}

export const jalanStyle = (p) => memo(`jl|${p.kelas}`, () => new Style({
  stroke: new Stroke({ color: '#c0703a', width: ['primary', 'secondary', 'trunk'].includes(p.kelas) ? 3 : 1.6 }),
}));

export const bufferStyle = () => memo('buf', () => new Style({
  fill: new Fill({ color: 'rgba(245,196,0,0.22)' }), stroke: new Stroke({ color: '#9c7c00', width: 1.5, lineDash: [5, 4] }),
}));

export const kandidatStyle = (rank) => memo(`k|${rank}`, () => new Style({
  image: new RegularShape({ points: 4, radius: 14, angle: Math.PI / 4, fill: new Fill({ color: '#f5c400' }), stroke: new Stroke({ color: '#13284b', width: 3 }) }),
  text: new Text({ text: String(rank), font: '800 13px Overpass, sans-serif', fill: new Fill({ color: '#13284b' }), offsetY: 1 }),
  zIndex: 10,
}));

export const klikStyle = () => memo('klik', () => new Style({
  fill: new Fill({ color: 'rgba(19,40,75,0.08)' }), stroke: new Stroke({ color: '#13284b', width: 2 }),
  image: new CircleStyle({ radius: 6, fill: new Fill({ color: '#13284b' }), stroke: new Stroke({ color: '#f5c400', width: 3 }) }),
}));

// ---------- popup
export function createPopup(map) {
  const el = document.createElement('div');
  el.className = 'popup';
  el.innerHTML = '<button class="popup-close" type="button" aria-label="Tutup">×</button><div class="popup-body"></div>';
  const ov = new Overlay({ element: el, autoPan: { animation: { duration: 200 } }, positioning: 'bottom-center', offset: [0, -14], stopEvent: true });
  map.addOverlay(ov);
  el.querySelector('.popup-close').addEventListener('click', () => ov.setPosition(undefined));
  return {
    show(coord, html) { el.querySelector('.popup-body').innerHTML = html; ov.setPosition(coord); },
    hide() { ov.setPosition(undefined); },
  };
}

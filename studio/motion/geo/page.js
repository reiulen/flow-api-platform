// Geo map renderer page. Everything on screen is a pure function of time t:
// the driver calls geoRender(t) for every frame and screenshots the result.
import * as maplibregl from '/vendor/maplibre-gl/maplibre-gl.mjs';

maplibregl.setWorkerUrl('/vendor/maplibre-gl/maplibre-gl-worker.mjs');

const NS = 'http://www.w3.org/2000/svg';
let map;
let spec;
const els = [];
const ui = document.getElementById('ui');
const fxMarkers = document.getElementById('fx-markers');
const fxIcons = document.getElementById('fx-icons');

const clamp01 = (x) => Math.max(0, Math.min(1, x));
const ease = (x) => (x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2);
const easeOut = (x) => 1 - (1 - x) ** 3;
const prog = (t, at, dur) => clamp01((t - at) / Math.max(0.001, dur));
const lerp = (a, b, k) => a + (b - a) * k;
const svg = (tag, parent, attrs = {}) => { const e = document.createElementNS(NS, tag); for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v); parent.appendChild(e); return e; };
const color = (role) => spec.colors[role] || spec.colors.info;
const lighten = (hex, k) => {
  const n = parseInt(hex.slice(1), 16);
  const c = [n >> 16, (n >> 8) & 255, n & 255].map((v) => Math.round(v + (255 - v) * k));
  return `rgb(${c.join(',')})`;
};

// ---- geometry helpers (lon/lat) ----
const toRad = (d) => (d * Math.PI) / 180;
function haversine(a, b) {
  const [l1, p1] = a.map(toRad); const [l2, p2] = b.map(toRad);
  const h = Math.sin((p2 - p1) / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin((l2 - l1) / 2) ** 2;
  return 2 * Math.asin(Math.sqrt(h));
}
function densify(coords, steps = 24) {
  const out = [];
  for (let i = 0; i < coords.length - 1; i++) {
    const [a, b] = [coords[i], coords[i + 1]];
    for (let s = 0; s < steps; s++) out.push([lerp(a[0], b[0], s / steps), lerp(a[1], b[1], s / steps)]);
  }
  out.push(coords.at(-1));
  return out;
}
function cumulative(coords) {
  const d = [0];
  for (let i = 1; i < coords.length; i++) d.push(d[i - 1] + haversine(coords[i - 1], coords[i]));
  return d;
}
function pointAt(coords, cum, frac) {
  const target = cum.at(-1) * clamp01(frac);
  let i = 1;
  while (i < cum.length - 1 && cum[i] < target) i++;
  const k = (target - cum[i - 1]) / Math.max(1e-9, cum[i] - cum[i - 1]);
  return [lerp(coords[i - 1][0], coords[i][0], k), lerp(coords[i - 1][1], coords[i][1], k)];
}
function slice(coords, cum, a, b) {
  const total = cum.at(-1);
  const out = [pointAt(coords, cum, a)];
  for (let i = 0; i < coords.length; i++) if (cum[i] > a * total && cum[i] < b * total) out.push(coords[i]);
  out.push(pointAt(coords, cum, b));
  return out;
}
function geoCircle([lon, lat], km, n = 96) {
  const r = km / 6371;
  const out = [];
  for (let i = 0; i <= n; i++) {
    const brg = (2 * Math.PI * i) / n;
    const p1 = toRad(lat); const l1 = toRad(lon);
    const p2 = Math.asin(Math.sin(p1) * Math.cos(r) + Math.cos(p1) * Math.sin(r) * Math.cos(brg));
    const l2 = l1 + Math.atan2(Math.sin(brg) * Math.sin(r) * Math.cos(p1), Math.cos(r) - Math.sin(p1) * Math.sin(p2));
    out.push([(l2 * 180) / Math.PI, (p2 * 180) / Math.PI]);
  }
  return out;
}
const line = (coords) => ({ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: coords } });
const multiline = (parts) => ({ type: 'Feature', properties: {}, geometry: { type: 'MultiLineString', coordinates: parts } });
const fc = (features) => ({ type: 'FeatureCollection', features });

// ---- plates (flat labels that stay upright whatever the camera does) ----
const plates = [];
function makePlate(text, role, big = false) {
  const el = document.createElement('div');
  el.dataset.nudge = '0';
  plates.push(el);
  el.className = `plate${big ? ' big' : ''}`;
  el.textContent = text;
  if (role && role !== 'info' && role !== 'neutral') el.style.background = color(role);
  el.style.opacity = '0';
  ui.appendChild(el);
  return el;
}
function placePlate(el, lngLat, p, offset = [0, 0], anchor = 'left') {
  const pt = map.project(lngLat);
  const w = el.offsetWidth;
  const x = anchor === 'center' ? pt.x - w / 2 : pt.x;
  el.style.left = `${Math.round(x + offset[0])}px`;
  el.style.top = `${Math.round(pt.y + offset[1] + Number(el.dataset.nudge) - el.offsetHeight / 2)}px`;
  const k = easeOut(clamp01(p / 0.35));
  el.style.opacity = p > 0 ? '1' : '0';
  el.style.clipPath = `inset(0 ${Math.round((1 - k) * 100)}% 0 0)`;
}

// ---- elements ----
const builders = {
  region(e, i) {
    const id = `region-${i}`;
    map.addSource(id, { type: 'geojson', data: fc(e.features) });
    map.addLayer({ id: `${id}-fill`, type: 'fill', source: id, paint: { 'fill-color': color(e.role), 'fill-opacity': 0 } });
    map.addLayer({ id: `${id}-line`, type: 'line', source: id, paint: { 'line-color': lighten(color(e.role), 0.25), 'line-width': 2, 'line-opacity': 0 } });
    const plate = e.label ? makePlate(e.label, 'info', true) : null;
    return (t) => {
      const p = easeOut(prog(t, e.at, 0.9));
      map.setPaintProperty(`${id}-fill`, 'fill-opacity', 0.62 * p);
      map.setPaintProperty(`${id}-line`, 'line-opacity', p);
      if (plate) placePlate(plate, e.label_at, prog(t, e.at + 0.4, 1), [0, 0], 'center');
    };
  },

  route(e, i) {
    const id = `route-${i}`;
    const coords = densify(e.coords);
    const cum = cumulative(coords);
    const c = color(e.role);
    map.addSource(id, { type: 'geojson', data: line([coords[0], coords[0]]) });
    map.addLayer({ id: `${id}-o`, type: 'line', source: id, layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': c, 'line-width': 16, 'line-blur': 12, 'line-opacity': 0.35 } });
    map.addLayer({ id: `${id}-m`, type: 'line', source: id, layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': c, 'line-width': 7, 'line-blur': 3, 'line-opacity': 0.75 } });
    map.addLayer({ id: `${id}-c`, type: 'line', source: id, layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': lighten(c, 0.35), 'line-width': 3 } });
    const head = svg('path', fxMarkers, { fill: lighten(c, 0.35), filter: 'url(#glow)' });
    const sparks = Array.from({ length: 3 }, () => svg('circle', fxMarkers, { r: 3.2, fill: '#fff', filter: 'url(#glow)', opacity: 0 }));
    const plate = e.label ? makePlate(e.label, e.role) : null;
    return (t) => {
      const p = ease(prog(t, e.at, e.dur));
      map.getSource(id).setData(line(p > 0 ? slice(coords, cum, 0, Math.max(0.002, p)) : [coords[0], coords[0]]));
      const tip = map.project(pointAt(coords, cum, p));
      const back = map.project(pointAt(coords, cum, Math.max(0, p - 0.02)));
      if (p > 0.03) {
        const a = Math.atan2(tip.y - back.y, tip.x - back.x);
        const pt = (r, da) => `${tip.x + Math.cos(a + da) * r},${tip.y + Math.sin(a + da) * r}`;
        head.setAttribute('d', `M${pt(16, 0)}L${pt(13, 2.4)}L${pt(13, -2.4)}Z`);
      } else head.setAttribute('d', '');
      // Light pulses travelling along the finished route.
      const flow = prog(t, e.at + e.dur, 0.6);
      sparks.forEach((s, k) => {
        const f = ((t - e.at - e.dur) * 0.18 + k / sparks.length) % 1;
        const q = map.project(pointAt(coords, cum, f));
        s.setAttribute('cx', q.x); s.setAttribute('cy', q.y);
        s.setAttribute('opacity', flow * Math.sin(Math.PI * f) * 0.9);
      });
      if (plate) placePlate(plate, pointAt(coords, cum, e.label_pos ?? 0.6), prog(t, e.at + e.dur * 0.6, 1), [14, -26]);
    };
  },

  pipeline(e, i) {
    const id = `pipe-${i}`;
    const coords = densify(e.coords);
    const cum = cumulative(coords);
    const c = color(e.role || 'sensor');
    map.addSource(`${id}-g`, { type: 'geojson', data: line([coords[0], coords[0]]) });
    map.addSource(id, { type: 'geojson', data: multiline([]) });
    map.addLayer({ id: `${id}-g`, type: 'line', source: `${id}-g`, layout: { 'line-cap': 'round' }, paint: { 'line-color': c, 'line-width': 16, 'line-blur': 9, 'line-opacity': 0.55 } });
    map.addLayer({ id: `${id}-d`, type: 'line', source: id, layout: { 'line-cap': 'butt' }, paint: { 'line-color': lighten(c, 0.45), 'line-width': 6 } });
    const plate = e.label ? makePlate(e.label, e.role || 'sensor') : null;
    const dash = 0.022;
    return (t) => {
      const p = ease(prog(t, e.at, e.dur));
      map.getSource(`${id}-g`).setData(line(p > 0 ? slice(coords, cum, 0, Math.max(0.002, p)) : [coords[0], coords[0]]));
      // Dashes march along the line: the product flowing.
      const phase = ((t - e.at) * 0.035) % (dash * 2);
      const parts = [];
      for (let a = -dash * 2 + phase; a < p; a += dash * 2) {
        const s = Math.max(0, a); const b = Math.min(p, a + dash);
        if (b > s) parts.push(slice(coords, cum, s, b));
      }
      map.getSource(id).setData(multiline(parts));
      if (plate) placePlate(plate, pointAt(coords, cum, 0.55), prog(t, e.at + e.dur * 0.5, 1), [0, 30], 'center');
    };
  },

  marker(e) {
    const c = color(e.role);
    const g = svg('g', fxMarkers, {});
    const rings = Array.from({ length: 3 }, () => svg('circle', g, { fill: 'none', stroke: c, 'stroke-width': 2.5 }));
    const halo = svg('circle', g, { r: 30, fill: c, opacity: 0.22, filter: 'url(#glow)' });
    const dashed = svg('circle', g, { r: 27, fill: 'none', stroke: lighten(c, 0.3), 'stroke-width': 2, 'stroke-dasharray': '7 6' });
    const core = svg('circle', g, { r: e.kind === 'dot' ? 6 : 11, fill: lighten(c, 0.15), filter: 'url(#glow)' });
    if (e.kind === 'dot') { rings.forEach((r) => r.remove()); halo.remove(); dashed.remove(); }
    const plate = e.label ? makePlate(e.label, e.kind === 'dot' ? 'info' : e.role) : null;
    return (t) => {
      const q = map.project([e.lon, e.lat]);
      const p = easeOut(prog(t, e.at, 0.5));
      const since = t - e.at;
      g.setAttribute('transform', `translate(${q.x},${q.y}) scale(${p})`);
      g.setAttribute('opacity', p);
      rings.forEach((r, k) => {
        const f = since < 0 ? 0 : ((since / 2.0) + k / rings.length) % 1;
        r.setAttribute('r', 12 + f * 52);
        r.setAttribute('opacity', (1 - f) * 0.75);
      });
      dashed.setAttribute('transform', `rotate(${since * 35})`);
      if (plate) placePlate(plate, [e.lon, e.lat], prog(t, e.at + 0.3, 1), [e.kind === 'dot' ? 16 : 40, 0]);
    };
  },

  ring(e, i) {
    const id = `ring-${i}`;
    const coords = geoCircle([e.lon, e.lat], e.radius_km);
    const cum = cumulative(coords);
    const c = color(e.role);
    map.addSource(`${id}-f`, { type: 'geojson', data: { type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [coords] } } });
    map.addSource(id, { type: 'geojson', data: line([coords[0], coords[0]]) });
    map.addLayer({ id: `${id}-f`, type: 'fill', source: `${id}-f`, paint: { 'fill-color': c, 'fill-opacity': 0 } });
    map.addLayer({ id: `${id}-g`, type: 'line', source: id, paint: { 'line-color': c, 'line-width': 10, 'line-blur': 8, 'line-opacity': 0.4 } });
    map.addLayer({ id: `${id}-l`, type: 'line', source: id, paint: { 'line-color': lighten(c, 0.3), 'line-width': 2.5 } });
    const plate = e.label ? makePlate(e.label, e.role) : null;
    const top = geoCircle([e.lon, e.lat], e.radius_km, 4)[0];
    return (t) => {
      const p = ease(prog(t, e.at, e.dur));
      map.getSource(id).setData(line(p > 0 ? slice(coords, cum, 0, Math.max(0.002, p)) : [coords[0], coords[0]]));
      map.setPaintProperty(`${id}-f`, 'fill-opacity', 0.14 * p);
      if (plate) placePlate(plate, top, prog(t, e.at + e.dur * 0.7, 1), [0, -22], 'center');
    };
  },

  label(e) {
    const plate = makePlate(e.text, e.role || 'info', Boolean(e.big));
    return (t) => placePlate(plate, [e.lon, e.lat], prog(t, e.at, 1), [0, 0], 'center');
  },

  icon(e) {
    const coords = densify(e.coords);
    const cum = cumulative(coords);
    const shapes = {
      plane: 'M0,-14 L3,-4 L14,2 L14,5 L3,2 L2,10 L6,13 L6,15 L0,13 L-6,15 L-6,13 L-2,10 L-3,2 L-14,5 L-14,2 L-3,-4 Z',
      ship: 'M0,-16 L5,-8 L5,12 L-5,12 L-5,-8 Z',
      missile: 'M0,-16 L2.5,-10 L2.5,8 L6,13 L-6,13 L-2.5,8 L-2.5,-10 Z',
    };
    const node = svg('path', fxIcons, { d: shapes[e.kind] || shapes.plane, fill: '#fff', filter: 'url(#glow)', opacity: 0 });
    return (t) => {
      const p = prog(t, e.at, e.dur);
      const a = map.project(pointAt(coords, cum, p));
      const b = map.project(pointAt(coords, cum, Math.min(1, p + 0.01)));
      const ang = (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI + 90;
      node.setAttribute('transform', `translate(${a.x},${a.y}) rotate(${ang}) scale(${e.scale || 1.3})`);
      node.setAttribute('opacity', t >= e.at && t <= e.at + e.dur + 0.3 ? Math.min(1, (t - e.at) * 3) : 0);
    };
  },
};

function cameraAt(t) {
  const keys = spec.camera.keys;
  let a = keys[0];
  let b = keys[0];
  for (let i = 0; i < keys.length; i++) {
    if (keys[i].t <= t) { a = keys[i]; b = keys[i + 1] || keys[i]; }
  }
  const k = b === a ? 0 : ease(clamp01((t - a.t) / (b.t - a.t)));
  const drift = t / spec.duration;
  return {
    center: [lerp(a.center[0], b.center[0], k) + (spec.camera.drift.pan?.[0] || 0) * drift, lerp(a.center[1], b.center[1], k) + (spec.camera.drift.pan?.[1] || 0) * drift],
    zoom: lerp(a.zoom, b.zoom, k) + (spec.camera.drift.zoom || 0) * drift,
    pitch: lerp(a.pitch, b.pitch, k),
    bearing: lerp(a.bearing, b.bearing, k) + (spec.camera.drift.bearing || 0) * drift,
  };
}

function waitIdle() {
  return new Promise((resolve) => {
    let done = false;
    const finish = () => { if (!done) { done = true; resolve(); } };
    map.once('idle', finish);
    map.triggerRepaint();
    const start = performance.now();
    const poll = () => {
      if (done) return;
      if (map.loaded() && map.areTilesLoaded()) return finish();
      if (performance.now() - start > 30000) return finish();
      setTimeout(poll, 50);
    };
    setTimeout(poll, 50);
  });
}

window.geoInit = async (s) => {
  spec = s;
  await document.fonts.load('600 25px Oswald');
  await document.fonts.load('500 17px "Inter Tight"');
  const b = spec.basemap;
  const sources = {
    base: b.kind === 'image'
      ? { type: 'image', url: b.url, coordinates: b.coordinates }
      : { type: 'raster', tiles: b.tiles, tileSize: b.tileSize || 256, maxzoom: b.maxzoom || 12 },
    land: { type: 'geojson', data: spec.land },
    borders: { type: 'geojson', data: spec.borders },
  };
  const g = spec.grade;
  map = new maplibregl.Map({
    container: 'map',
    style: {
      version: 8,
      sources,
      layers: [
        { id: 'bg', type: 'background', paint: { 'background-color': spec.ocean.color } },
        { id: 'base', type: 'raster', source: 'base', paint: { 'raster-saturation': g.saturation, 'raster-contrast': g.contrast, 'raster-brightness-max': g.brightness_max, 'raster-brightness-min': g.brightness_min, 'raster-hue-rotate': g.hue, 'raster-fade-duration': 0, 'raster-resampling': 'linear' } },
        { id: 'coast', type: 'line', source: 'land', paint: { 'line-color': '#ffffff', 'line-opacity': 0.18, 'line-width': 1.2 } },
        { id: 'borders', type: 'line', source: 'borders', paint: { 'line-color': spec.borders_style.color, 'line-opacity': spec.borders_style.opacity, 'line-width': 1.4 } },
      ],
    },
    interactive: false, attributionControl: false, fadeDuration: 0, preserveDrawingBuffer: true,
    canvasContextAttributes: { preserveDrawingBuffer: true, antialias: true },
    pixelRatio: 1, maxPitch: 60, renderWorldCopies: false,
    center: spec.camera.keys[0].center, zoom: spec.camera.keys[0].zoom,
  });
  await new Promise((r) => map.once('load', r));
  spec.elements.forEach((e, i) => els.push(builders[e.type](e, i)));
  if (spec.title) { const d = document.createElement('div'); d.className = 'title'; d.textContent = spec.title; ui.appendChild(d); els.push((t) => { d.style.opacity = String(clamp01((t - 0.2) / 0.6)); }); }
  if (spec.legend?.length) {
    const d = document.createElement('div');
    d.className = 'legend';
    for (const item of spec.legend) {
      const row = document.createElement('div');
      row.className = 'row';
      row.innerHTML = `<div class="sw" style="background:${color(item.role)}"></div><div></div>`;
      row.lastChild.textContent = item.label;
      d.appendChild(row);
    }
    ui.appendChild(d);
    els.push((t) => { d.style.opacity = String(clamp01((t - 0.5) / 0.6)); });
  }
  if (spec.credit) { const d = document.createElement('div'); d.className = 'credit'; d.textContent = spec.credit; ui.appendChild(d); }
  resolvePlateCollisions();
  return true;
};

// Plates are laid out once at the final camera; overlapping ones get a fixed vertical nudge,
// so labels never collide and never jump during the shot.
function resolvePlateCollisions() {
  map.jumpTo(cameraAt(spec.duration));
  for (const fn of els) fn(spec.duration);
  const placed = [];
  for (const el of plates) {
    if (el.style.opacity === '0') continue;
    const base = el.getBoundingClientRect();
    let nudge = 0;
    for (const step of [0, 44, -44, 88, -88, 132, -132]) {
      const r = { left: base.left, right: base.right, top: base.top + step, bottom: base.bottom + step };
      if (!placed.some((p) => r.left < p.right + 6 && r.right > p.left - 6 && r.top < p.bottom + 4 && r.bottom > p.top - 4)) { nudge = step; break; }
    }
    el.dataset.nudge = String(nudge);
    placed.push({ left: base.left, right: base.right, top: base.top + nudge, bottom: base.bottom + nudge });
  }
}

window.geoRender = async (t) => {
  map.jumpTo(cameraAt(t));
  for (const fn of els) fn(t);
  await waitIdle();
  return true;
};

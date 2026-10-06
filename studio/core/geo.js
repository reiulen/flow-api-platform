// Geo map renderer: MapLibre in headless Chrome, captured frame by frame.
// Every frame is rendered only after all tiles are loaded, and tiles are cached on disk,
// so the same map spec always renders the same video.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { chromium } from 'playwright-core';
import { geoCentroid, geoMercator, geoPath } from 'd3-geo';
import { REPO_ROOT } from './config.js';
import { ensureDir } from './util.js';

const require = createRequire(import.meta.url);
const topojson = require('topojson-client');

const Z0 = Math.log2(1920 / 512);
const ALIAS = { 'United States': 'United States of America', USA: 'United States of America', US: 'United States of America', UK: 'United Kingdom', Britain: 'United Kingdom', 'Great Britain': 'United Kingdom', 'Republic of Korea': 'South Korea', DPRK: 'North Korea', UAE: 'United Arab Emirates', 'Czech Republic': 'Czechia' };

// Imagery providers. Attribution is burned into the frame whenever the provider requires it.
export const PROVIDERS = {
  maptiler: (cfg) => ({ kind: 'raster', tiles: [`https://api.maptiler.com/tiles/satellite-v2/{z}/{x}/{y}.jpg?key=${cfg.map.maptilerKey}`], tileSize: 512, maxzoom: 20, credit: '© MapTiler © OpenStreetMap contributors' }),
  gibs: () => ({ kind: 'raster', tiles: ['https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/BlueMarble_ShadedRelief_Bathymetry/default/GoogleMapsCompatible_Level8/{z}/{y}/{x}.jpeg'], tileSize: 256, maxzoom: 8, credit: 'Imagery: NASA Blue Marble' }),
  s2cloudless: () => ({ kind: 'raster', tiles: ['https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless_3857/default/g/{z}/{y}/{x}.jpg'], tileSize: 256, maxzoom: 15, credit: 'Sentinel-2 cloudless 2016 by EOX IT Services GmbH (Contains modified Copernicus Sentinel data 2016)' }),
  local: (cfg) => ({ kind: 'raster', tiles: [`http://geo.local/tiles/{z}/{x}/{y}.jpg`], tileSize: 256, maxzoom: Number(cfg.map.localMaxzoom || 12), credit: cfg.map.localCredit || '', localDir: cfg.map.localTiles }),
  standin: (cfg) => ({ kind: 'image', url: 'http://geo.local/standin.jpg', coordinates: cfg.map.standin.coordinates, credit: 'Stand-in basemap (test)', file: cfg.map.standin.file }),
};

let worldCache;
function world() {
  if (worldCache) return worldCache;
  const countries = require('world-atlas/countries-50m.json');
  const land = require('world-atlas/land-50m.json');
  const features = topojson.feature(countries, countries.objects.countries).features;
  worldCache = {
    byName: new Map(features.map((f) => [f.properties.name.toLowerCase(), f])),
    land: topojson.feature(land, land.objects.land),
    borders: { type: 'Feature', properties: {}, geometry: topojson.mesh(countries, countries.objects.countries, (a, b) => a !== b) },
  };
  return worldCache;
}

const zoomFor = (scale) => Z0 + Math.log2(Math.max(0.5, scale));

// A small boxed map of somewhere else (a distant theatre, a second front), drawn as vectors:
// land and borders, with the named countries highlighted. Same scale semantics as the main map.
const INSET = { w: 520, h: 320 };
export function insetPaths(w, s) {
  const projection = geoMercator()
    .center(s.center)
    .scale((INSET.w * s.scale) / (2 * Math.PI))
    .translate([INSET.w / 2, INSET.h / 2])
    .clipExtent([[0, 0], [INSET.w, INSET.h]]);
  const draw = geoPath(projection);
  const names = new Set((s.highlight || []).map((n) => (ALIAS[n] || n).toLowerCase()));
  const all = [...w.byName.values()];
  return {
    w: INSET.w, h: INSET.h,
    land: draw({ type: 'FeatureCollection', features: all }) || '',
    hi: draw({ type: 'FeatureCollection', features: all.filter((f) => names.has(f.properties.name.toLowerCase())) }) || '',
  };
}

// Turns the map data the visual director wrote (template "map") into a fully timed render spec.
export function buildGeoSpec({ data, duration, style, provider }) {
  const w = world();
  const steps = data.steps || [];
  const first = 0.8;
  const gap = Math.max(1.4, Math.min(5.5, (duration - first - 1.8) / Math.max(1, steps.length)));
  const geo = style.geo || {};
  const view = data.view;
  const pitch = view.pitch ?? geo.pitch ?? 32;
  const bearing = view.bearing ?? 0;
  const keys = [{ t: 0, center: view.center, zoom: zoomFor(view.scale_from || 1), pitch, bearing }];
  const elements = [];
  const legend = [...(data.legend || [])];
  const zoomSteps = steps.filter((s) => s.type === 'zoom');
  if (!zoomSteps.length || steps[0].type !== 'zoom') {
    keys.push({ t: Math.min(4, duration * 0.4), center: view.center, zoom: zoomFor(view.scale_to || view.scale_from || 1), pitch, bearing });
  }
  steps.forEach((s, i) => {
    const at = first + i * gap;
    const draw = Math.min(2.4, gap * 0.85);
    switch (s.type) {
      case 'zoom': {
        const prev = keys.at(-1);
        keys.push({ t: at, center: prev.center, zoom: prev.zoom, pitch: prev.pitch, bearing: prev.bearing });
        keys.push({ t: at + Math.min(2.4, gap * 0.9), center: s.center, zoom: zoomFor(s.scale), pitch, bearing });
        break;
      }
      case 'highlight': {
        const features = s.countries.map((n) => w.byName.get((ALIAS[n] || n).toLowerCase())).filter(Boolean);
        if (!features.length) break;
        const label_at = s.label ? geoCentroid({ type: 'FeatureCollection', features }) : null;
        elements.push({ type: 'region', features, role: s.role, at, label: s.label || '', label_at, hatch: Boolean(s.hatch) });
        if (s.legend) legend.push({ label: s.legend, role: s.role });
        break;
      }
      case 'point':
        elements.push({ type: 'marker', lon: s.lon, lat: s.lat, label: s.label, role: s.role, kind: s.marker || (['threat', 'warning'].includes(s.role) ? 'chokepoint' : 'dot'), at });
        break;
      case 'route': {
        const coords = [s.from, ...(s.via || []), s.to];
        elements.push({ type: 'route', coords, role: s.role, label: s.label, at, dur: draw });
        if (s.icon) elements.push({ type: 'icon', kind: s.icon, coords, at: at + draw * 0.3, dur: Math.max(2.5, duration - at - 1) });
        break;
      }
      case 'pipeline':
        elements.push({ type: 'pipeline', coords: s.coords, role: s.role || 'sensor', label: s.label, at, dur: draw });
        if (s.legend) legend.push({ label: s.legend, role: s.role || 'sensor' });
        break;
      case 'ring':
        elements.push({ type: 'ring', lon: s.lon, lat: s.lat, radius_km: s.radius_km, label: s.label, role: s.role, at, dur: Math.min(1.8, gap * 0.8) });
        break;
      case 'label':
        elements.push({ type: 'label', lon: s.lon, lat: s.lat, text: s.text, role: s.role || 'info', big: s.big ?? true, at });
        break;
      case 'callout':
        elements.push({ type: 'callout', lon: s.lon, lat: s.lat, value: s.value, label: s.label || '', role: s.role || 'info', at });
        break;
      case 'icons':
        elements.push({ type: 'icons', lon: s.lon, lat: s.lat, icon: s.icon, count: s.count, total: Math.max(s.count, s.total || s.count), label: s.label || '', value: s.value || '', role: s.role || 'info', at, dur: Math.min(2.2, gap * 0.9) });
        break;
      case 'pie':
        elements.push({ type: 'pie', lon: s.lon, lat: s.lat, percent: s.percent, value: s.value || `${Math.round(s.percent)}%`, label: s.label || '', role: s.role || 'threat', at, dur: Math.min(1.6, gap * 0.8) });
        break;
      case 'inset':
        elements.push({ type: 'inset', ...insetPaths(w, s), position: s.position || 'tr', label: s.label || '', role: s.role || 'threat', at });
        break;
      default:
    }
  });
  keys.sort((a, b) => a.t - b.t);
  return {
    duration, fps: style.canvas.fps, colors: style.colors,
    basemap: provider, land: w.land, borders: w.borders,
    grade: geo.grade || { saturation: 0.05, contrast: 0.12, brightness_min: 0, brightness_max: 0.92, hue: 0 },
    ocean: { color: geo.ocean || '#060b12' },
    borders_style: { color: '#ffffff', opacity: 0.55, width: 1.4, ...(geo.borders || {}) },
    fills: { ...style.colors, ...(geo.fills || {}) }, fill_opacity: geo.fill_opacity ?? 0.62, vignette: geo.vignette ?? 0.55,
    camera: { keys, drift: geo.drift || { bearing: 5, zoom: 0.12, pan: [0, 0] } },
    elements, title: data.title || '', show_title: Boolean(geo.show_title), legend, credit: provider.credit || '',
  };
}

export function chromePath(config) {
  const candidates = [
    config.render.chrome,
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/opt/pw-browsers/chromium',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
  ].filter(Boolean);
  return candidates.find((p) => fs.existsSync(p));
}

function chromeArgs() {
  const extra = process.env.STUDIO_CHROME_ARGS ? process.env.STUDIO_CHROME_ARGS.split(' ') : [];
  const linux = process.platform === 'linux' ? ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] : [];
  return ['--hide-scrollbars', '--force-device-scale-factor=1', ...linux, ...extra];
}

const STATIC = {
  '/geo/page.html': () => path.join(REPO_ROOT, 'studio/motion/geo/page.html'),
  '/geo/page.js': () => path.join(REPO_ROOT, 'studio/motion/geo/page.js'),
};
const FONTS = {
  'oswald-500.woff2': '@fontsource/oswald/files/oswald-latin-500-normal.woff2',
  'oswald-600.woff2': '@fontsource/oswald/files/oswald-latin-600-normal.woff2',
  'inter-tight-500.woff2': '@fontsource/inter-tight/files/inter-tight-latin-500-normal.woff2',
};
const MIME = { '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.woff2': 'font/woff2', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png' };

function localFile(urlPath, provider) {
  if (STATIC[urlPath]) return STATIC[urlPath]();
  if (urlPath.startsWith('/vendor/maplibre-gl/')) return path.join(REPO_ROOT, 'node_modules/maplibre-gl/dist', path.basename(urlPath));
  if (urlPath.startsWith('/fonts/')) return path.join(REPO_ROOT, 'node_modules', FONTS[path.basename(urlPath)] || 'missing');
  if (urlPath === '/standin.jpg' && provider.file) return provider.file;
  if (urlPath.startsWith('/tiles/') && provider.localDir) return path.join(provider.localDir, urlPath.slice('/tiles/'.length));
  return null;
}

// Renders one map shot to an MP4.
export async function renderGeo({ config, style, data, duration, out }) {
  const provider = PROVIDERS[config.map.provider]?.(config);
  if (!provider) throw new Error(`unknown STUDIO_MAP_PROVIDER ${config.map.provider}`);
  const spec = buildGeoSpec({ data, duration, style, provider });
  const tileDir = ensureDir(path.join(config.assetsDir, 'tiles', config.map.provider));
  const browser = await chromium.launch({ executablePath: chromePath(config), args: chromeArgs() });
  const tmp = `${out}.part.mp4`;
  let ffmpeg;
  try {
    const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
    const debug = process.env.STUDIO_GEO_DEBUG ? (...a) => console.error('[geo]', ...a) : () => {};
    const errors = [];
    const tiles = { ok: 0, fail: 0, lastError: '' };
    page.on('pageerror', (e) => errors.push(e.message));
    await page.route('**/*', async (route) => {
      const url = new URL(route.request().url());
      debug('request', url.href.slice(0, 120));
      if (url.host === 'geo.local') {
        const file = localFile(url.pathname, provider);
        if (!file || !fs.existsSync(file)) return route.fulfill({ status: 404, body: '' });
        return route.fulfill({ status: 200, contentType: MIME[path.extname(file)] || 'application/octet-stream', body: fs.readFileSync(file) });
      }
      // Remote tiles: disk cache keyed without the API key, so renders are repeatable offline.
      const keyless = `${url.origin}${url.pathname}`;
      const cached = path.join(tileDir, `${crypto.createHash('sha1').update(keyless).digest('hex')}${path.extname(url.pathname) || '.img'}`);
      if (fs.existsSync(cached)) { tiles.ok += 1; return route.fulfill({ status: 200, contentType: MIME[path.extname(cached)] || 'image/jpeg', body: fs.readFileSync(cached) }); }
      try {
        const res = await fetch(url.href, { headers: { 'user-agent': 'flow-api-platform-studio/0.1' }, signal: AbortSignal.timeout(20000) });
        if (!res.ok) { tiles.fail += 1; tiles.lastError = `HTTP ${res.status}`; return route.fulfill({ status: res.status, body: '' }); }
        const body = Buffer.from(await res.arrayBuffer());
        fs.writeFileSync(cached, body);
        tiles.ok += 1;
        return route.fulfill({ status: 200, contentType: res.headers.get('content-type') || 'image/jpeg', body });
      } catch (err) {
        tiles.fail += 1;
        tiles.lastError = err.message;
        return route.fulfill({ status: 503, body: '' });
      }
    });
    page.on('console', (m) => debug('console', m.text()));
    await page.goto('http://geo.local/geo/page.html');
    debug('page loaded');
    await page.waitForFunction(() => typeof window.geoInit === 'function', null, { timeout: 60000 });
    await page.evaluate((s) => window.geoInit(s), spec);
    debug('init done');
    if (provider.kind === 'raster' && !tiles.ok && tiles.fail) {
      throw new Error(`map imagery provider "${config.map.provider}" unreachable (${tiles.fail} tile requests failed, last: ${tiles.lastError})`);
    }
    if (errors.length) throw new Error(`geo page: ${errors.join('; ')}`);

    const geo = style.geo || {};
    const filters = ['format=yuv420p'];
    if (geo.grain !== false) filters.unshift(style.look.grain);
    ffmpeg = spawn('ffmpeg', ['-y', '-v', 'error', '-f', 'image2pipe', '-framerate', String(spec.fps), '-c:v', 'mjpeg', '-i', '-', '-vf', filters.join(','), '-c:v', 'libx264', '-preset', config.render.preset || 'medium', '-crf', '16', '-pix_fmt', 'yuv420p', '-r', String(spec.fps), tmp]);
    let ffErr = '';
    ffmpeg.stderr.on('data', (d) => { ffErr += d; });
    const done = new Promise((resolve, reject) => ffmpeg.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg ${code}: ${ffErr.slice(-500)}`)))));
    const frames = Math.round(duration * spec.fps);
    for (let f = 0; f < frames; f++) {
      await page.evaluate((t) => window.geoRender(t), f / spec.fps);
      // A map without imagery is never acceptable: stop instead of rendering black frames.
      if (f === 0 && provider.kind === 'raster' && !tiles.ok && tiles.fail) {
        throw new Error(`map imagery provider "${config.map.provider}" unreachable (${tiles.fail} tile requests failed, last: ${tiles.lastError})`);
      }
      const jpg = await page.screenshot({ type: 'jpeg', quality: 95 });
      if (!ffmpeg.stdin.write(jpg)) await new Promise((r) => ffmpeg.stdin.once('drain', r));
    }
    ffmpeg.stdin.end();
    await done;
    if (errors.length) throw new Error(`geo page: ${errors.join('; ')}`);
    fs.renameSync(tmp, out);
    return out;
  } finally {
    if (ffmpeg && ffmpeg.exitCode === null) ffmpeg.kill('SIGKILL');
    await browser.close();
  }
}

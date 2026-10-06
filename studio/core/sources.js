// Footage source adapters. Each returns normalized candidates; downloading is shared.
// License mapping follows studio/bibles/_common/04_ASSET_SYSTEM.md and military/SOURCES.md.
import fs from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { run } from './util.js';

const UA = 'flow-api-platform-studio/0.1 (documentary research)';

async function getJson(url, headers = {}) {
  // Archive APIs sometimes hang; a search that does not answer in 25 s is treated as empty.
  const res = await fetch(url, { headers: { 'user-agent': UA, accept: 'application/json', ...headers }, signal: AbortSignal.timeout(25000) });
  if (!res.ok) throw new Error(`${new URL(url).host} ${res.status}`);
  return res.json();
}

const candidate = (c) => ({
  kind: 'video', description: '', year: null, country: '', tags: [], width: 0, height: 0, duration_s: 0, ...c,
});

export function mapCommonsLicense(short = '') {
  const s = short.toLowerCase();
  if (/public domain|^pd|cc0/.test(s)) return 'public_domain';
  if (/nc/.test(s)) return 'non_commercial';
  if (/sa/.test(s)) return 'share_alike';
  if (/^cc by|^cc-by|ogl|open government/.test(s)) return 'open_commercial';
  return 'unknown';
}

export const adapters = {
  dvids: {
    enabled: (cfg) => Boolean(cfg.sources.dvids),
    stock: false,
    async search(q, cfg, { kind = 'video', limit = 25 } = {}) {
      const url = `https://api.dvidshub.net/search?api_key=${cfg.sources.dvids}&q=${encodeURIComponent(q)}&type[]=${kind}&max_results=${limit}&sort=score`;
      const data = await getJson(url);
      const maxDur = cfg?.assets?.maxDurationSeconds || 900;
      return (data.results || [])
        .filter((r) => kind !== 'video' || !r.duration || Number(r.duration) <= maxDur)
        .map((r) => candidate({
          source: 'dvids', source_id: String(r.id), kind,
          duration_s: Number(r.duration || 0),
          source_url: r.url || `https://www.dvidshub.net/${kind}/${String(r.id).split(':').pop()}`,
          title: r.title || '', description: r.short_description || r.description || '',
          year: r.date ? Number(String(r.date).slice(0, 4)) : null, country: 'USA',
          license: 'public_domain', credit: [r.credit, r.unit_name, r.branch].filter(Boolean).join(' / ') || 'U.S. Department of Defense (DVIDS)',
          tags: String(r.keywords || '').split(/[,;]/).map((t) => t.trim()).filter(Boolean),
        }));
    },
    async resolve(c, cfg) {
      const data = await getJson(`https://api.dvidshub.net/asset?api_key=${cfg.sources.dvids}&id=${encodeURIComponent(c.source_id)}`);
      const r = data.results || data;
      if (c.kind === 'image') return { url: r.image || r.url, width: r.dimensions?.width || 0, height: r.dimensions?.height || 0 };
      const maxDur = cfg?.assets?.maxDurationSeconds || 900;
      if (Number(r.duration || 0) > maxDur) throw new Error(`dvids: video exceeds max duration (${r.duration}s > ${maxDur}s)`);
      const files = (r.files || []).filter((f) => /mp4/.test(f.type || f.src || ''));
      const maxBytes = cfg?.assets?.maxDownloadBytes || 300 * 1024 * 1024;
      const sensible = files.filter((f) => !f.size || f.size <= maxBytes);
      const targetHeight = cfg?.assets?.preferredHeight || 1080;
      const minH = cfg?.assets?.minHeight || 720;
      sensible.sort((a, b) => {
        const aPref = (a.height === targetHeight);
        const bPref = (b.height === targetHeight);
        if (aPref !== bPref) return bPref ? 1 : -1;
        return (b.height || 0) - (a.height || 0);
      });
      const best = sensible.find((f) => (f.height || 0) <= targetHeight && (f.height || 0) >= minH)
        || sensible[0]
        || files.find((f) => !f.size || f.size <= maxBytes);
      if (!best) throw new Error(`dvids: no suitable mp4 file under ${Math.round(maxBytes / 1024 / 1024)}MB`);
      return { url: best.src, width: best.width || 0, height: best.height || 0, duration_s: Number(r.duration || 0) };
    },
  },

  nasa: {
    enabled: () => true,
    stock: false,
    async search(q, cfg, { kind = 'video', limit = 25 } = {}) {
      const data = await getJson(`https://images-api.nasa.gov/search?q=${encodeURIComponent(q)}&media_type=${kind}&page_size=${limit}`);
      return (data.collection?.items || []).map((it) => {
        const d = it.data?.[0] || {};
        return candidate({
          source: 'nasa', source_id: d.nasa_id, kind, source_url: `https://images.nasa.gov/details/${d.nasa_id}`,
          title: d.title || '', description: d.description || '', year: d.date_created ? Number(d.date_created.slice(0, 4)) : null,
          country: 'USA', license: 'public_domain', credit: `NASA${d.center ? ` / ${d.center}` : ''}`, tags: d.keywords || [],
        });
      });
    },
    async resolve(c) {
      const data = await getJson(`https://images-api.nasa.gov/asset/${encodeURIComponent(c.source_id)}`);
      const hrefs = (data.collection?.items || []).map((i) => i.href.replace(/^http:/, 'https:'));
      const pick = c.kind === 'image'
        ? hrefs.find((h) => /~large\.jpg$/i.test(h)) || hrefs.find((h) => /~orig\.jpg$/i.test(h))
        : hrefs.find((h) => /~large\.mp4$/i.test(h)) || hrefs.find((h) => /~orig\.mp4$/i.test(h)) || hrefs.find((h) => /\.mp4$/i.test(h));
      if (!pick) throw new Error('nasa: no media file');
      return { url: pick };
    },
  },

  nara: {
    enabled: (cfg) => Boolean(cfg.sources.nara),
    stock: false,
    async search(q, cfg, { kind = 'video', limit = 20 } = {}) {
      const material = kind === 'image' ? 'Photographs and other Graphic Materials' : 'Moving Images';
      const data = await getJson(`https://catalog.archives.gov/api/v2/records/search?q=${encodeURIComponent(q)}&availableOnline=true&typeOfMaterials=${encodeURIComponent(material)}&limit=${limit}`, { 'x-api-key': cfg.sources.nara });
      return (data.body?.hits?.hits || []).map((h) => {
        const r = h._source?.record || {};
        const obj = (r.digitalObjects || []).find((o) => (kind === 'image' ? /image/i : /video|mp4/i).test(`${o.objectType} ${o.objectUrl}`));
        const unrestricted = /unrestricted/i.test(JSON.stringify(r.useRestriction || ''));
        return candidate({
          source: 'nara', source_id: String(r.naId), kind, source_url: `https://catalog.archives.gov/id/${r.naId}`,
          title: r.title || '', description: (r.scopeAndContentNote || '').slice(0, 600), country: 'USA',
          year: Number(String(r.productionDates?.[0]?.year || r.inclusiveStartDate?.year || '')) || null,
          license: unrestricted ? 'public_domain' : 'unknown', credit: 'U.S. National Archives', _url: obj?.objectUrl,
        });
      }).filter((c) => c._url);
    },
    async resolve(c) { return { url: c._url }; },
  },

  wikimedia: {
    enabled: () => true,
    stock: false,
    async search(q, cfg, { kind = 'video', limit = 25 } = {}) {
      const filetype = kind === 'image' ? 'bitmap' : 'video';
      const url = `https://commons.wikimedia.org/w/api.php?action=query&format=json&generator=search&gsrnamespace=6&gsrlimit=${limit}&gsrsearch=${encodeURIComponent(`filetype:${filetype} ${q}`)}&prop=imageinfo&iiprop=url|size|mime|extmetadata`;
      const data = await getJson(url);
      return Object.values(data.query?.pages || {}).map((p) => {
        const ii = p.imageinfo?.[0] || {};
        const meta = ii.extmetadata || {};
        const strip = (v) => String(v?.value || '').replace(/<[^>]+>/g, '').trim();
        return candidate({
          source: 'wikimedia', source_id: String(p.pageid), kind, source_url: ii.descriptionurl || '',
          title: p.title.replace(/^File:/, ''), description: strip(meta.ImageDescription).slice(0, 600),
          license: mapCommonsLicense(strip(meta.LicenseShortName)), credit: `${strip(meta.Artist) || 'Wikimedia Commons'} (${strip(meta.LicenseShortName)})`,
          width: ii.width || 0, height: ii.height || 0, duration_s: Number(ii.duration || 0), _url: ii.url,
          year: Number(strip(meta.DateTimeOriginal).slice(0, 4)) || null,
        });
      });
    },
    async resolve(c) { return { url: c._url, width: c.width, height: c.height }; },
  },

  pexels: {
    enabled: (cfg) => Boolean(cfg.sources.pexels),
    stock: true,
    async search(q, cfg, { kind = 'video', limit = 20 } = {}) {
      if (kind !== 'video') return [];
      const data = await getJson(`https://api.pexels.com/videos/search?query=${encodeURIComponent(q)}&per_page=${limit}&orientation=landscape`, { authorization: cfg.sources.pexels });
      return (data.videos || []).map((v) => {
        const files = (v.video_files || []).filter((f) => f.file_type === 'video/mp4' && f.height <= 1080).sort((a, b) => b.height - a.height);
        return candidate({
          source: 'pexels', source_id: String(v.id), source_url: v.url, title: v.url.split('/').filter(Boolean).pop().replace(/-\d+$/, '').replace(/-/g, ' '),
          license: 'stock_licensed', credit: `${v.user?.name || 'Unknown'} / Pexels`, width: files[0]?.width || v.width, height: files[0]?.height || v.height,
          duration_s: v.duration || 0, _url: files[0]?.link,
        });
      }).filter((c) => c._url);
    },
    async resolve(c) { return { url: c._url }; },
  },

  pixabay: {
    enabled: (cfg) => Boolean(cfg.sources.pixabay),
    stock: true,
    async search(q, cfg, { kind = 'video', limit = 20 } = {}) {
      if (kind !== 'video') return [];
      const data = await getJson(`https://pixabay.com/api/videos/?key=${cfg.sources.pixabay}&q=${encodeURIComponent(q.slice(0, 100))}&per_page=${limit}`);
      return (data.hits || []).map((h) => {
        const v = h.videos?.large?.url ? h.videos.large : h.videos?.medium;
        return candidate({
          source: 'pixabay', source_id: String(h.id), source_url: h.pageURL, title: h.tags || '', tags: String(h.tags || '').split(',').map((t) => t.trim()),
          license: 'stock_licensed', credit: `${h.user || 'Unknown'} / Pixabay`, width: v?.width || 0, height: v?.height || 0, duration_s: h.duration || 0, _url: v?.url,
        });
      }).filter((c) => c._url);
    },
    async resolve(c) { return { url: c._url }; },
  },

  // Local, already-licensed footage: studio/library/footage/**/<file> + <file>.json sidecar (asset metadata).
  library: {
    enabled: () => true,
    stock: false,
    async search(q, cfg) {
      const root = path.join(cfg.libraryDir, 'footage');
      if (!fs.existsSync(root)) return [];
      const out = [];
      for (const file of walk(root)) {
        if (!/\.(mp4|mov|m4v|webm|jpg|jpeg|png)$/i.test(file) || !fs.existsSync(`${file}.json`)) continue;
        const meta = JSON.parse(fs.readFileSync(`${file}.json`, 'utf8'));
        out.push(candidate({ source: 'library', source_id: path.relative(root, file), source_url: `file://${file}`, kind: /\.(jpg|jpeg|png)$/i.test(file) ? 'image' : 'video', ...meta, _file: file }));
      }
      return out;
    },
    async resolve(c) { return { file: c._file }; },
  },

  // Test-only source: synthesizes labeled clips for any query.
  synthetic: {
    enabled: (cfg) => cfg.testMode,
    stock: false,
    async search(q) {
      return [0, 1, 2, 3, 4, 5].map((i) => candidate({
        source: 'synthetic', source_id: `${q}-${i}`.replace(/[^a-z0-9-]/gi, '_').slice(0, 60), source_url: 'synthetic://',
        title: q, description: q, license: 'public_domain', credit: 'synthetic', width: 1280, height: 720, duration_s: 24,
      }));
    },
    async resolve(c) { return { synthetic: true, label: c.title }; },
  },
};

function* walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(full);
    else yield full;
  }
}

export async function download(c, resolved, dest, config = {}) {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  if (resolved.file) { fs.copyFileSync(resolved.file, dest); return dest; }
  if (resolved.synthetic && /\.(jpe?g|png)$/i.test(dest)) {
    await run('ffmpeg', ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'testsrc2=size=1920x1080:rate=1:duration=1', '-frames:v', '1', dest]);
    return dest;
  }
  if (resolved.synthetic) {
    const color = ['0x2b3a4a', '0x4a3b2b', '0x2b4a3b'][dest.length % 3];
    await run('ffmpeg', ['-y', '-v', 'error', '-f', 'lavfi', '-i', `testsrc2=size=1280x720:rate=30:duration=8,eq=saturation=0.4`, '-f', 'lavfi', '-i', `color=c=${color}:size=1280x720:rate=30:duration=8`, '-f', 'lavfi', '-i', 'testsrc=size=1280x720:rate=30:duration=8',
      '-filter_complex', '[0][1][2]concat=n=3:v=1:a=0,format=yuv420p', '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '28', dest]);
    return dest;
  }
  const timeoutMs = config?.assets?.downloadTimeoutMs || 90000;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const tmp = `${dest}.part`;
  try {
    const res = await fetch(resolved.url, { headers: { 'user-agent': UA }, signal: controller.signal });
    if (!res.ok || !res.body) throw new Error(`download ${res.status} ${resolved.url}`);
    await pipeline(Readable.fromWeb(res.body), fs.createWriteStream(tmp));
    fs.renameSync(tmp, dest);
    return dest;
  } catch (err) {
    if (fs.existsSync(tmp)) try { fs.unlinkSync(tmp); } catch {}
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

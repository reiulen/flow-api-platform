import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { z } from 'zod';
import { footageReviewPrompt, houseRules } from '../prompts.js';
import { adapters, download } from '../sources.js';
import { ensureDir, ffprobe, hash, nowIso, round, run } from '../util.js';

const STOP = new Set(['the', 'and', 'class', 'type', 'ship', 'ships', 'aircraft', 'carrier', 'navy', 'naval', 'fighter', 'missile', 'system', 'systems', 'military', 'force', 'air', 'army', 'with', 'from', 'for', 'of', 'in', 'on', 'at', 'a', 'an', 'us', 'u.s.', 'usa', 'generic', 'modern']);
const tokens = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9\-. ]+/g, ' ').split(/\s+/).filter((w) => w.length > 1);

export class AssetDb {
  constructor(config) {
    ensureDir(config.assetsDir);
    this.config = config;
    this.filesDir = ensureDir(path.join(config.assetsDir, 'files'));
    this.db = new DatabaseSync(path.join(config.assetsDir, 'assets.sqlite'));
    this.db.exec(`PRAGMA journal_mode=WAL;
      CREATE TABLE IF NOT EXISTS assets (asset_id TEXT PRIMARY KEY, source TEXT, source_id TEXT, data TEXT, updated_at TEXT, UNIQUE(source, source_id));
      CREATE TABLE IF NOT EXISTS searches (key TEXT PRIMARY KEY, results TEXT, at TEXT);
      CREATE TABLE IF NOT EXISTS usage (asset_id TEXT, project_id TEXT, shot_id TEXT, src_in REAL, src_out REAL, at TEXT);
      CREATE TABLE IF NOT EXISTS reviews (asset_id TEXT, need_key TEXT, data TEXT, at TEXT, PRIMARY KEY (asset_id, need_key));`);
  }

  get(source, sourceId) {
    const row = this.db.prepare('SELECT data FROM assets WHERE source = ? AND source_id = ?').get(source, sourceId);
    return row ? JSON.parse(row.data) : null;
  }
  byId(assetId) {
    const row = this.db.prepare('SELECT data FROM assets WHERE asset_id = ?').get(assetId);
    return row ? JSON.parse(row.data) : null;
  }
  put(asset) {
    this.db.prepare('INSERT OR REPLACE INTO assets (asset_id, source, source_id, data, updated_at) VALUES (?, ?, ?, ?, ?)')
      .run(asset.asset_id, asset.source, asset.source_id, JSON.stringify(asset), nowIso());
    return asset;
  }
  cachedSearch(key, fn) {
    const row = this.db.prepare('SELECT results FROM searches WHERE key = ?').get(key);
    if (row) return Promise.resolve(JSON.parse(row.results));
    return fn().then((results) => {
      this.db.prepare('INSERT OR REPLACE INTO searches (key, results, at) VALUES (?, ?, ?)').run(key, JSON.stringify(results), nowIso());
      return results;
    });
  }
  recordUse(assetId, projectId, shotId, range) {
    this.db.prepare('INSERT INTO usage (asset_id, project_id, shot_id, src_in, src_out, at) VALUES (?, ?, ?, ?, ?, ?)')
      .run(assetId, projectId, shotId, range?.in ?? null, range?.out ?? null, nowIso());
  }
  review(assetId, needKey) {
    const row = this.db.prepare('SELECT data FROM reviews WHERE asset_id = ? AND need_key = ?').get(assetId, needKey);
    return row ? JSON.parse(row.data) : null;
  }
  putReview(assetId, needKey, data) {
    this.db.prepare('INSERT OR REPLACE INTO reviews (asset_id, need_key, data, at) VALUES (?, ?, ?, ?)').run(assetId, needKey, JSON.stringify(data), nowIso());
    return data;
  }
  usesElsewhere(assetId, projectId) {
    return this.db.prepare('SELECT COUNT(*) AS n FROM usage WHERE asset_id = ? AND project_id != ?').get(assetId, projectId).n;
  }
  close() { this.db.close(); }

  // Resolve, download, probe and split a candidate into its internal shots.
  async materialize(c) {
    const existing = this.get(c.source, c.source_id);
    if (existing?.file && fs.existsSync(path.join(this.config.assetsDir, existing.file))) return existing;
    const adapter = adapters[c.source];
    const resolved = await adapter.resolve(c, this.config);
    const ext = c.kind === 'image' ? (path.extname(new URL(resolved.url || 'file:///x.jpg').pathname) || '.jpg') : '.mp4';
    const rel = path.join('files', c.source, `${hash(`${c.source}:${c.source_id}`)}${ext}`);
    const dest = path.join(this.config.assetsDir, rel);
    if (!fs.existsSync(dest)) await download(c, resolved, dest, this.config);
    const info = await ffprobe(dest);
    const asset = {
      asset_id: `A-${hash(`${c.source}:${c.source_id}`, 12)}`,
      kind: c.kind, source: c.source, source_url: c.source_url, source_id: c.source_id, license: c.license, credit: c.credit,
      title: c.title, description: c.description, visual_type: 'REAL', platform: '', country: c.country || '', year: c.year || null,
      tags: c.tags || [], file: rel, width: info.width, height: info.height, duration_s: round(c.kind === 'image' ? 0 : info.duration),
      segments: c.kind === 'image' ? [] : await detectSegments(dest, info.duration, this.config),
      quality: info.height >= 1080 ? 'A' : info.height >= 720 ? 'B' : 'C', factual_confidence: c.source === 'library' ? 'confirmed' : 'likely',
    };
    return this.put(asset);
  }
}

// Internal cut points of a source clip, so a 5 s window never straddles a cut inside the source.
export async function detectSegments(file, duration, config = {}) {
  let cuts = [];
  const maxScan = config?.assets?.sceneScanMaxSeconds || 300;
  const scanDuration = Math.min(Number(duration) || maxScan, maxScan);
  try {
    const { stderr } = await run('ffmpeg', ['-v', 'info', '-t', String(scanDuration), '-i', file, '-an', '-vf', "scale=160:-2,select='gt(scene,0.32)',showinfo", '-f', 'null', '-'], { timeoutMs: 150 * 1000 });
    cuts = [...stderr.matchAll(/pts_time:([\d.]+)/g)].map((m) => Number(m[1]));
  } catch {
    // Unknown cuts: offering the whole window as one shot would cut blind across scenes.
    return [];
  }
  // Past the scanned window cuts are unknown, so that part is never offered as one clean shot.
  const bounds = [0, ...cuts.filter((t) => t < scanDuration), Math.min(Number(duration) || 0, scanDuration)];
  const segs = [];
  for (let i = 0; i < bounds.length - 1; i++) {
    const a = bounds[i] + 0.25;
    const b = bounds[i + 1] - 0.25;
    if (b - a >= 1.5) segs.push({ in: round(a), out: round(b) });
  }
  return segs;
}

// ---------- visual review ----------
// Text metadata says what a clip is about, not what each shot inside it shows. Archive clips open
// with slates, cut to interviews and carry captions, so every shot that may be used is looked at
// once per visual need (frames of the shot middles, one vision call per asset) and cached.

const MAX_REVIEW_FRAMES = 14;
const DEFECTS = ['slate', 'text', 'talking_head', 'blank', 'poor', 'people'];
const FootageReviewOut = z.object({
  frames: z.array(z.object({ index: z.number().int(), relevance: z.number(), defects: z.array(z.string()), taste: z.number() })),
});

export const needKey = (need) => hash({ s: need.subject || '', p: need.platform || '', a: need.action || '', e: need.era || '' });

async function reviewFrames(asset, file, dir) {
  if (asset.kind === 'image') {
    const out = path.join(dir, 'img.jpg');
    await run('ffmpeg', ['-y', '-v', 'error', '-i', file, '-frames:v', '1', '-vf', 'scale=640:-2', out]);
    return [{ seg: null, file: out }];
  }
  const segs = [...asset.segments].sort((a, b) => (b.out - b.in) - (a.out - a.in)).slice(0, MAX_REVIEW_FRAMES).sort((a, b) => a.in - b.in);
  const frames = [];
  for (const [i, seg] of segs.entries()) {
    const out = path.join(dir, `f${i}.jpg`);
    await run('ffmpeg', ['-y', '-v', 'error', '-ss', String(round((seg.in + seg.out) / 2, 2)), '-i', file, '-frames:v', '1', '-vf', 'scale=512:-2', out]);
    if (fs.existsSync(out)) frames.push({ seg, file: out });
  }
  return frames;
}

// Returns [{ in, out, relevance, defects, taste }] per reviewed shot (image: one entry with in = out = 0),
// or null when no review is available (test mode, no LLM, or the call failed: text matching decides).
export async function reviewAsset({ db, llm, asset, need, style, config, log = () => {} }) {
  if (!llm || config.testMode) return null;
  const key = needKey(need);
  const cached = db.review(asset.asset_id, key);
  if (cached) return cached;
  const file = path.join(config.assetsDir, asset.file);
  const dir = ensureDir(path.join(config.assetsDir, 'review-tmp', `${asset.asset_id}-${key}`));
  try {
    const frames = await reviewFrames(asset, file, dir);
    if (!frames.length) return db.putReview(asset.asset_id, key, []);
    const out = await llm.json({
      stage: 'footage', schema: FootageReviewOut, system: houseRules(style), images: frames.map((f) => f.file),
      prompt: footageReviewPrompt({ need, asset, frames: frames.length }), maxTokens: 4000,
    });
    const byIndex = new Map(out.frames.map((f) => [f.index, f]));
    const review = frames.map((f, i) => {
      const r = byIndex.get(i + 1);
      // A frame the model skipped is treated as unusable rather than guessed.
      return {
        in: f.seg?.in ?? 0, out: f.seg?.out ?? 0,
        relevance: r ? Math.max(0, Math.min(3, Math.round(r.relevance))) : 0,
        defects: r ? r.defects.map((d) => d.toLowerCase().trim()).filter((d) => DEFECTS.includes(d)) : ['unreviewed'],
        taste: r ? Math.max(0, Math.min(2, Math.round(r.taste))) : 0,
      };
    });
    return db.putReview(asset.asset_id, key, review);
  } catch (err) {
    log(`footage review ${asset.asset_id} failed, using text match only: ${err.message.slice(0, 160)}`);
    return null;
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

// Usable shots of an asset for a need, best first. Without a review every detected shot counts as
// relevance 1 (the old text-only behaviour), so it is only taken after reviewed better matches.
export function usableShots(asset, review, minRelevance) {
  const shots = review
    ? review.filter((r) => !r.defects.length && r.relevance >= minRelevance)
    : (minRelevance <= 1 ? (asset.kind === 'image' ? [{ in: 0, out: 0, relevance: 1, taste: 0 }] : asset.segments.map((s) => ({ ...s, relevance: 1, taste: 0 }))) : []);
  return [...shots].sort((a, b) => (b.relevance - a.relevance) || (b.taste - a.taste) || ((b.out - b.in) - (a.out - a.in)));
}

export function scoreCandidate(c, need, style) {
  const text = tokens(`${c.title} ${c.description} ${(c.tags || []).join(' ')}`);
  const bag = new Set(text);
  const platformTokens = tokens(need.platform).filter((w) => !STOP.has(w));
  const platformHit = platformTokens.filter((w) => bag.has(w)).length;
  if (platformTokens.length && !platformHit) return { score: 0, reason: 'platform not matched' };
  if (!style.assets.allowed_licenses.includes(c.license)) return { score: 0, reason: `license ${c.license}` };
  const want = tokens(`${need.subject} ${need.action} ${(need.query_terms || []).join(' ')}`).filter((w) => !STOP.has(w));
  const hits = want.filter((w) => bag.has(w)).length;
  let score = hits / Math.max(3, want.length) + (platformTokens.length ? platformHit / platformTokens.length : 0.3);
  if (c.height && c.height < style.assets.min_quality_height) score *= 0.5;
  if (c.height >= 1080) score *= 1.1;
  if (need.era && c.year && !String(c.year).startsWith(String(need.era).slice(0, 3))) score *= 0.7;
  return { score: round(score, 3), reason: `${hits} subject hits, ${platformHit} platform hits` };
}

function queriesFor(need) {
  const q = [...(need.query_terms || [])];
  if (need.platform) q.push(`${need.platform} ${need.action}`.trim());
  q.push(`${need.subject}`);
  return [...new Set(q.map((s) => s.trim()).filter(Boolean))].slice(0, 4);
}

async function findCandidates({ db, config, style, need, kind }) {
  const generic = !need.platform;
  const queries = queriesFor(need);
  const tasks = [];
  for (const source of style.assets.source_priority) {
    const adapter = adapters[source];
    if (!adapter || !adapter.enabled(config) || config.disabledSources.includes(source)) continue;
    if (adapter.stock && !generic) continue;
    for (const q of queries) {
      const key = `${source}|${kind}|${q.toLowerCase()}`;
      tasks.push(db.cachedSearch(key, () => adapter.search(q, config, { kind })).catch(() => []));
    }
  }
  const results = await Promise.all(tasks);
  const all = results.flat();
  if (config.testMode) all.push(...(await adapters.synthetic.search(`${need.platform} ${need.subject}`.trim(), config)));
  const seen = new Set();
  return all
    .filter((c) => !seen.has(`${c.source}:${c.source_id}`) && seen.add(`${c.source}:${c.source_id}`))
    .map((c) => ({ c, ...scoreCandidate(c, need, style) }))
    .filter((x) => x.score > 0.15)
    .sort((a, b) => b.score - a.score);
}

// S6: attach a real asset and a clean source range to every footage shot.
export async function runAssets({ project, shotList, style, config, flowAvailable, llm = null, log = () => {} }) {
  const db = new AssetDb(config);
  const report = [];
  const pools = new Map();
  const expanded = new Set();
  const used = new Map(); // asset_id -> [{in,out,at}]
  let flowAdded = 0;
  const flowBudget = Math.floor((shotList.duration_s * style.visual_mix.flow[1]) / style.flow.duration_s);
  let flowShots = shotList.shots.filter((s) => s.visual_type === 'FLOW').length;
  try {
    for (let i = 0; i < shotList.shots.length; i++) {
      const shot = shotList.shots[i];
      if (!['REAL', 'ARCHIVAL', 'NEWS'].includes(shot.visual_type) || !shot.need) continue;
      const kind = shot.visual_type === 'ARCHIVAL' ? 'any' : 'video';
      if (!pools.has(shot.seq_id)) {
        let found = await findCandidates({ db, config, style, need: shot.need, kind: 'video' });
        if (kind === 'any' && found.length < 3) found = [...found, ...(await findCandidates({ db, config, style, need: shot.need, kind: 'image' }))];
        pools.set(shot.seq_id, found.slice(0, 6));
      }
      const ctx = { db, llm, shot, used, style, config, log };
      let pick = await pickRange({ ...ctx, pool: pools.get(shot.seq_id) });
      if (!pick && !expanded.has(shot.seq_id)) {
        // Pool exhausted: widen once with a looser query (subject only) before splitting or falling back.
        expanded.add(shot.seq_id);
        const loose = { ...shot.need, query_terms: [], action: '', platform: shot.need.platform };
        const more = await findCandidates({ db, config, style, need: loose, kind: 'video' });
        const known = new Set(pools.get(shot.seq_id).map((x) => `${x.c.source}:${x.c.source_id}`));
        pools.set(shot.seq_id, [...pools.get(shot.seq_id), ...more.filter((x) => !known.has(`${x.c.source}:${x.c.source_id}`)).slice(0, 8)]);
        pick = await pickRange({ ...ctx, pool: pools.get(shot.seq_id) });
      }
      // A long hold with no long-enough source shot becomes two shots of the same sequence.
      if (!pick && shot.duration_s >= style.pacing.footage.min * 2) {
        const half = round(shot.duration_s / 2);
        const second = { ...shot, shot_id: `${shot.shot_id}b`, start_s: round(shot.start_s + half), duration_s: round(shot.duration_s - half), transition_in: style.transitions.same_sequence };
        shot.duration_s = half;
        shotList.shots.splice(i + 1, 0, second);
        pick = await pickRange({ ...ctx, pool: pools.get(shot.seq_id) });
      }
      if (pick) {
        shot.asset_id = pick.asset.asset_id;
        shot.asset_range = pick.range;
        db.recordUse(pick.asset.asset_id, project.id, shot.shot_id, pick.range);
        report.push({ shot_id: shot.shot_id, status: 'found', asset_id: pick.asset.asset_id, source: pick.asset.source, score: pick.score, relevance: pick.relevance, reviewed: pick.reviewed, license: pick.asset.license });
        continue;
      }
      if (flowAvailable && flowShots < flowBudget) {
        shot.visual_type = 'FLOW';
        shot.flow = { reconstruction: Boolean(shot.need.platform), spec: {} };
        if (shot.flow.reconstruction) shot.label = style.labels.reconstruction;
        flowShots += 1;
        flowAdded += 1;
        report.push({ shot_id: shot.shot_id, status: 'fallback_flow' });
        continue;
      }
      report.push({ shot_id: shot.shot_id, status: 'none', need: shot.need });
    }
  } finally {
    db.close();
  }
  return { shotList, report: { generated_at: nowIso(), flow_added: flowAdded, shots: report } };
}

// Picks a clean source range: one continuous shot inside the source, never reused in this project.
// Strong visual matches (relevance >= 2) anywhere in the pool win over weak ones; within a level,
// real speed comes before a gentle documentary-safe slow-down.
async function pickRange({ db, llm, pool, shot, used, style, config, log }) {
  for (const minRelevance of [2, 1]) {
    for (const speed of [1, style.assets.min_speed]) {
      const need = shot.duration_s * speed + 0.2;
      for (const { c, score } of pool) {
        let asset;
        try { asset = await db.materialize(c); } catch { continue; }
        if (asset.height && asset.height < 360) continue;
        const review = await reviewAsset({ db, llm, asset, need: shot.need, style, config, log });
        const taken = used.get(asset.asset_id) || [];
        const shots = usableShots(asset, review, minRelevance);
        if (asset.kind === 'image') {
          if (taken.length || speed !== 1 || !shots.length) continue;
          used.set(asset.asset_id, [{ in: 0, out: 0 }]);
          return { asset, range: null, score, relevance: shots[0].relevance, reviewed: Boolean(review) };
        }
        for (const seg of shots) {
          if (seg.out - seg.in < need) continue;
          if (taken.some((u) => u.in < seg.out && u.out > seg.in)) continue;
          const len = shot.duration_s * speed;
          // Centred, but keep ~0.6 s of clean source after the range for a dissolve tail when possible.
          const slack = seg.out - seg.in - len;
          const before = Math.max(0.1, Math.min(slack / 2, slack - 0.6));
          const range = { in: round(seg.in + before), out: round(seg.in + before + len), speed };
          used.set(asset.asset_id, [...taken, { in: seg.in, out: seg.out }]);
          return { asset, range, score, relevance: seg.relevance, reviewed: Boolean(review) };
        }
      }
    }
  }
  return null;
}

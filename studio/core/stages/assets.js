import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { z } from 'zod';
import { assetPlanPrompt, footageReviewPrompt, houseRules, motionFillPrompt } from '../prompts.js';
import { parseMotion } from './visual.js';
import { adapters, download } from '../sources.js';
import { ensureDir, ffprobe, hash, mapLimit, nowIso, round, run, stripMarkup } from '../util.js';

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
// with slates, cut to interviews and carry captions, so the shots long enough to be used are looked
// at once per visual need: one contact sheet image per asset, one vision call, cached.

const MAX_SHEET_FRAMES = 12;
const DEFECTS = ['slate', 'text', 'talking_head', 'blank', 'poor', 'people'];
const FootageReviewOut = z.object({
  frames: z.array(z.object({ index: z.number().int(), relevance: z.number(), defects: z.array(z.string()), taste: z.number() })),
});

export const needKey = (need) => hash({ s: need.subject || '', p: need.platform || '', a: need.action || '', e: need.era || '' });

// One grid image of the middle frame of every shot at least minLen long (longest first, at most 12).
async function contactSheet(asset, file, dir, minLen) {
  if (asset.kind === 'image') {
    const out = path.join(dir, 'sheet.jpg');
    await run('ffmpeg', ['-y', '-v', 'error', '-i', file, '-frames:v', '1', '-vf', 'scale=960:-2', out]);
    return { file: out, segs: [null], cols: 1 };
  }
  const segs = asset.segments.filter((s) => s.out - s.in >= minLen)
    .sort((a, b) => (b.out - b.in) - (a.out - a.in)).slice(0, MAX_SHEET_FRAMES).sort((a, b) => a.in - b.in);
  const kept = [];
  for (const seg of segs) {
    const out = path.join(dir, `f${String(kept.length + 1).padStart(2, '0')}.jpg`);
    await run('ffmpeg', ['-y', '-v', 'error', '-ss', String(round((seg.in + seg.out) / 2, 2)), '-i', file, '-frames:v', '1', '-vf', 'scale=480:270:force_original_aspect_ratio=decrease,pad=480:270:(ow-iw)/2:(oh-ih)/2', out]);
    if (fs.existsSync(out)) kept.push(seg);
  }
  if (!kept.length) return null;
  const cols = Math.min(4, kept.length);
  const rows = Math.ceil(kept.length / cols);
  const sheet = path.join(dir, 'sheet.jpg');
  await run('ffmpeg', ['-y', '-v', 'error', '-framerate', '1', '-i', path.join(dir, 'f%02d.jpg'), '-vf', `tile=${cols}x${rows}:padding=6:color=white`, '-frames:v', '1', '-q:v', '3', sheet]);
  return { file: sheet, segs: kept, cols };
}

// Returns [{ in, out, relevance, defects, taste }] per reviewed shot (image: one entry with in = out = 0),
// or null when no review is available (test mode, no LLM, or the call failed: text matching decides).
// Shots shorter than minLen cannot fill the shot and are not shown to the model.
export async function reviewAsset({ db, llm, asset, need, purpose = '', minLen = 0, style, config, log = () => {} }) {
  if (!llm || config.testMode) return null;
  const key = needKey(need);
  const cached = db.review(asset.asset_id, key);
  if (cached) return cached;
  const file = path.join(config.assetsDir, asset.file);
  const dir = ensureDir(path.join(config.assetsDir, 'review-tmp', `${asset.asset_id}-${key}`));
  try {
    const sheet = await contactSheet(asset, file, dir, minLen);
    // Nothing long enough to use: unusable for this need, no model call.
    if (!sheet) return db.putReview(asset.asset_id, key, []);
    const out = await llm.json({
      stage: 'footage', schema: FootageReviewOut, system: houseRules(style), images: [sheet.file],
      prompt: footageReviewPrompt({ need, asset, frames: sheet.segs.length, cols: sheet.cols, purpose }), maxTokens: 3000,
    });
    const byIndex = new Map(out.frames.map((f) => [f.index, f]));
    const review = sheet.segs.map((seg, i) => {
      const r = byIndex.get(i + 1);
      // A frame the model skipped is treated as unusable rather than guessed.
      return {
        in: seg?.in ?? 0, out: seg?.out ?? 0,
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
  return [...new Set(q.map((s) => s.trim()).filter(Boolean))].slice(0, 3);
}

// Metadata search only: nothing is downloaded here.
async function findCandidates({ db, config, style, need, kind, queries = queriesFor(need), limit = 12 }) {
  const generic = !need.platform;
  const tasks = [];
  for (const source of style.assets.source_priority) {
    const adapter = adapters[source];
    if (!adapter || !adapter.enabled(config) || config.disabledSources.includes(source)) continue;
    if (adapter.stock && !generic) continue;
    for (const q of queries) {
      const key = `${source}|${kind}|${limit}|${q.toLowerCase()}`;
      tasks.push(db.cachedSearch(key, () => adapter.search(q, config, { kind, limit })).catch(() => []));
    }
  }
  const all = (await Promise.all(tasks)).flat();
  if (config.testMode) all.push(...(await adapters.synthetic.search(`${need.platform} ${need.subject}`.trim(), config)));
  const maxDur = config.assets?.maxDurationSeconds || 900;
  const seen = new Set();
  return all
    .filter((c) => !seen.has(`${c.source}:${c.source_id}`) && seen.add(`${c.source}:${c.source_id}`))
    .filter((c) => c.kind === 'image' || !c.duration_s || c.duration_s <= maxDur)
    .map((c) => ({ c, ...scoreCandidate(c, need, style) }))
    .filter((x) => x.score > 0.15)
    .sort((a, b) => b.score - a.score);
}

// ---------- planning ----------

const FOOTAGE = ['REAL', 'ARCHIVAL', 'NEWS'];
const PlanOut = z.object({
  groups: z.array(z.object({
    group: z.string(),
    picks: z.array(z.object({ id: z.string(), look_for: z.string().default('') })).default([]),
    better_query: z.string().default(''),
  })),
});

// Footage shots that share a visual need become one group: searched, planned and reviewed once.
export function groupNeeds(shotList, script, config) {
  const textOf = new Map((script?.segments || []).map((s) => [s.seg_id, stripMarkup(s.text)]));
  const groups = new Map();
  for (const shot of shotList.shots) {
    if (!FOOTAGE.includes(shot.visual_type) || !shot.need) continue;
    const key = needKey(shot.need);
    if (!groups.has(key)) groups.set(key, { id: `G${groups.size + 1}`, key, act: shot.act, need: shot.need, shots: [], seq_ids: new Set(), segs: new Set(), archival: false });
    const g = groups.get(key);
    g.shots.push({ shot_id: shot.shot_id, duration_s: shot.duration_s });
    g.seq_ids.add(shot.seq_id);
    for (const r of shot.seg_refs || []) g.segs.add(r);
    if (shot.visual_type === 'ARCHIVAL') g.archival = true;
  }
  const perClip = config.assets?.shotsPerClip || 3;
  const maxClips = config.assets?.clipsPerNeed || 3;
  return [...groups.values()].map((g) => ({
    ...g,
    seq_ids: [...g.seq_ids],
    narration: [...g.segs].map((id) => textOf.get(id) || '').join(' ').slice(0, 320) || g.need.subject,
    wanted: Math.min(maxClips, Math.max(1, Math.ceil(g.shots.length / perClip))),
  }));
}

const scorePlan = (g) => ({ picks: g.candidates.slice(0, g.wanted + 1).map((x) => ({ ...x, look_for: '' })), better_query: '', planned_by: 'score' });

// One text-only LLM call per batch of groups decides what to download, before anything is downloaded.
// Groups without candidates are asked too (once) so the planner can propose a better search.
async function planGroups({ llm, style, groups, log, askEmpty = true }) {
  const plan = new Map();
  const ask = groups.filter((g) => g.candidates.length || (askEmpty && llm));
  for (const g of groups.filter((x) => !ask.includes(x))) plan.set(g.id, { picks: [], better_query: '', planned_by: 'none' });
  for (let i = 0; i < ask.length; i += 8) {
    const batch = ask.slice(i, i + 8);
    let out = null;
    if (llm) {
      try {
        out = await llm.json({ stage: 'asset_plan', schema: PlanOut, system: houseRules(style), prompt: assetPlanPrompt({ groups: batch }), maxTokens: 6000 });
      } catch (err) {
        log(`asset plan for ${batch.map((g) => g.id).join(',')} failed, ranking by text match: ${err.message.slice(0, 160)}`);
      }
    }
    for (const g of batch) {
      const r = out?.groups.find((x) => x.group === g.id);
      if (!r) { plan.set(g.id, scorePlan(g)); continue; }
      const seen = new Set();
      const picks = r.picks
        .map((p) => ({ ...g.candidates.find((x) => x.cid === p.id), look_for: p.look_for }))
        .filter((p) => p.c && !seen.has(p.cid) && seen.add(p.cid))
        .slice(0, g.wanted + 1);
      plan.set(g.id, { picks, better_query: picks.length ? '' : r.better_query.trim(), planned_by: 'llm' });
    }
  }
  return plan;
}

const ck = (c) => `${c.source}:${c.source_id}`;
const sharpEnough = (asset) => !asset.height || asset.height >= 360;

// S6: plan the footage, download only what the plan names, review each clip once, cut ranges.
export async function runAssets({ project, shotList, script = null, research = null, style, config, flowAvailable, llm = null, log = () => {} }) {
  const db = new AssetDb(config);
  const report = [];
  let motionAdded = 0;
  const used = new Map(); // asset_id -> [{in,out}]
  let flowAdded = 0;
  const flowBudget = Math.floor((shotList.duration_s * style.visual_mix.flow[1]) / style.flow.duration_s);
  let flowShots = shotList.shots.filter((s) => s.visual_type === 'FLOW').length;
  const started = Date.now();
  try {
    const groups = groupNeeds(shotList, script, config);
    const label = (list) => list.map((x, k) => ({ ...x, cid: `c${k + 1}` }));
    // Videos first; a few public-domain photos ride along as backups (leaders, signings, crowds,
    // hardware), shown with a slow push-in like the reference films do.
    const perNeed = config.assets?.candidatesPerNeed || 10;
    const search = async (g, queries = queriesFor(g.need)) => {
      const videos = await findCandidates({ db, config, style, need: g.need, kind: 'video', queries });
      const seen = new Set(videos.map((x) => ck(x.c)));
      const photos = (await findCandidates({ db, config, style, need: g.need, kind: 'image', queries: queries.slice(0, 2), limit: 8 }))
        .filter((x) => x.c.kind === 'image' && !seen.has(ck(x.c))).slice(0, g.archival ? 4 : 3);
      return [...videos.slice(0, perNeed - photos.length), ...photos];
    };
    await mapLimit(groups, 4, async (g) => { g.candidates = label(await search(g)); g.considered = g.candidates.length; });

    // Plan; groups the planner found nothing for get one targeted search and one more plan.
    const plan = await planGroups({ llm, style, groups, log });
    const retry = groups.filter((g) => !plan.get(g.id).picks.length && plan.get(g.id).better_query);
    if (retry.length) {
      await mapLimit(retry, 4, async (g) => {
        const known = new Set(g.candidates.map((x) => ck(x.c)));
        g.better_query = plan.get(g.id).better_query;
        g.candidates = label((await search(g, [g.better_query])).filter((x) => !known.has(ck(x.c))).slice(0, 8));
        g.considered += g.candidates.length;
      });
      const again = await planGroups({ llm, style, groups: retry, log, askEmpty: false });
      for (const g of retry) plan.set(g.id, { ...again.get(g.id), better_query: g.better_query, planned_by: `${again.get(g.id).planned_by}+retry` });
    }

    // Downloads: only planned clips, each at most once, within a budget per video.
    // The cap follows the shots to fill (one clip gives about shotsPerClip usable shots), with room
    // for backups; backups are still fetched only when the clips already fetched cannot fill a shot.
    const footageShots = groups.reduce((n, g) => n + g.shots.length, 0);
    const budget = config.assets?.maxDownloads || Math.max(6, groups.length, Math.ceil((footageShots / (config.assets?.shotsPerClip || 3)) * 1.5));
    const fetched = new Map(); // key -> Promise<asset|null>
    let downloads = 0;
    // Time budget: past it, nothing new is downloaded or reviewed; unfilled shots go to Flow or G3.
    const deadline = Date.now() + (config.assets?.timeBudgetMin || 30) * 60000;
    let overtime = false;
    const late = () => {
      if (Date.now() < deadline) return false;
      if (!overtime) { overtime = true; log(`assets: time budget of ${config.assets?.timeBudgetMin || 30} min reached; using what is already fetched`); }
      return true;
    };
    const fetchAsset = (c) => {
      const k = ck(c);
      if (!fetched.has(k)) {
        const have = db.get(c.source, c.source_id);
        const local = have?.file && fs.existsSync(path.join(config.assetsDir, have.file));
        if (!local && (downloads >= budget || late())) return Promise.resolve(null);
        if (!local) downloads += 1;
        fetched.set(k, db.materialize(c).catch((err) => { log(`download ${k} failed: ${err.message.slice(0, 120)}`); return null; }));
      }
      return fetched.get(k);
    };
    const minLenOf = (g) => Math.min(...g.shots.map((s) => s.duration_s)) * style.assets.min_speed + 0.2;
    const reviews = new Map(); // asset_id|group -> review
    const reviewFor = async (asset, g, pick) => {
      const k = `${asset.asset_id}|${g.id}`;
      if (!reviews.has(k)) reviews.set(k, reviewAsset({ db, llm: late() ? null : llm, asset, need: g.need, purpose: pick.look_for, minLen: minLenOf(g), style, config, log }));
      return reviews.get(k);
    };
    const loaded = new Map(); // group id -> [{ asset, review, pick }]
    const loadNext = async (g) => {
      const picks = plan.get(g.id).picks;
      const have = loaded.get(g.id) || [];
      loaded.set(g.id, have);
      while (have.length < picks.length) {
        const pick = picks[have.length];
        const asset = await fetchAsset(pick.c);
        have.push({ pick, asset, review: asset && sharpEnough(asset) ? await reviewFor(asset, g, pick) : null });
        if (asset) return true;
      }
      return false;
    };
    // Primary picks of every group, in parallel.
    await mapLimit(groups, 3, async (g) => { for (let n = 0; n < g.wanted; n++) if (!(await loadNext(g))) break; });

    const reviewing = Boolean(llm) && !config.testMode;
    const unfilled = [];
    const groupOf = new Map(groups.flatMap((g) => g.shots.map((s) => [s.shot_id, g])));
    for (let i = 0; i < shotList.shots.length; i++) {
      const shot = shotList.shots[i];
      if (!FOOTAGE.includes(shot.visual_type) || !shot.need) continue;
      const g = groupOf.get(shot.shot_id) || groupOf.get(shot.shot_id.replace(/b$/, ''));
      const pool = () => (loaded.get(g.id) || []).filter((x) => x.asset && sharpEnough(x.asset));
      let pick = pickRange({ pool: pool(), shot, used, style, strict: reviewing });
      // Planned backups are fetched only when the clips already fetched cannot fill this shot.
      while (!pick && (await loadNext(g))) pick = pickRange({ pool: pool(), shot, used, style, strict: reviewing });
      // A long hold with no long-enough source shot becomes two shots of the same sequence.
      if (!pick && shot.duration_s >= style.pacing.footage.min * 2) {
        const half = round(shot.duration_s / 2);
        const second = { ...shot, shot_id: `${shot.shot_id}b`, start_s: round(shot.start_s + half), duration_s: round(shot.duration_s - half), transition_in: style.transitions.same_sequence };
        shot.duration_s = half;
        shotList.shots.splice(i + 1, 0, second);
        groupOf.set(second.shot_id, g);
        pick = pickRange({ pool: pool(), shot, used, style, strict: reviewing });
      }
      if (pick) {
        shot.asset_id = pick.asset.asset_id;
        shot.asset_range = pick.range;
        db.recordUse(pick.asset.asset_id, project.id, shot.shot_id, pick.range);
        report.push({ shot_id: shot.shot_id, status: 'found', asset_id: pick.asset.asset_id, source: pick.asset.source, score: pick.score, relevance: pick.relevance, reviewed: pick.reviewed, license: pick.asset.license, group: g.id });
        continue;
      }
      unfilled.push({ shot, g });
    }

    // No footage: a map or chart that explains the line comes before Flow, Flow before nothing.
    const motions = await motionFill({ llm, style, research, script, shotList, items: unfilled, log });
    let explainerSeconds = shotList.shots.filter((x) => ['MAP', 'TECH'].includes(x.visual_type)).reduce((n, x) => n + x.duration_s, 0);
    const explainerCap = shotList.duration_s * (style.visual_mix.explainer[1] + 0.05);
    for (const { shot, g } of unfilled) {
      const spec = motions.get(shot.shot_id);
      if (spec && explainerSeconds + shot.duration_s <= explainerCap) {
        shot.visual_type = spec.template === 'map' ? 'MAP' : 'TECH';
        shot.shot_class = 'explainer';
        shot.motion = spec;
        explainerSeconds += shot.duration_s;
        motionAdded += 1;
        report.push({ shot_id: shot.shot_id, status: 'fallback_motion', template: spec.template, group: g.id });
        continue;
      }
      if (flowAvailable && flowShots < flowBudget) {
        shot.visual_type = 'FLOW';
        shot.flow = { reconstruction: Boolean(shot.need.platform), spec: {} };
        if (shot.flow.reconstruction) shot.label = style.labels.reconstruction;
        flowShots += 1;
        flowAdded += 1;
        report.push({ shot_id: shot.shot_id, status: 'fallback_flow', group: g.id });
        continue;
      }
      report.push({ shot_id: shot.shot_id, status: 'none', need: shot.need, group: g.id });
    }

    const usedAssets = new Set(report.filter((r) => r.asset_id).map((r) => r.asset_id));
    const planOut = {
      generated_at: nowIso(),
      budget: { downloads: budget },
      totals: {
        groups: groups.length,
        candidates_considered: groups.reduce((n, g) => n + (g.considered || 0), 0),
        planned: groups.reduce((n, g) => n + plan.get(g.id).picks.length, 0),
        downloaded_new: downloads,
        reviewed: [...reviews.keys()].length,
        minutes: round((Date.now() - started) / 60000, 1),
        time_budget_reached: overtime,
        used_assets: usedAssets.size,
        unused_fetched: [...loaded.values()].flat().filter((x) => x.asset && !usedAssets.has(x.asset.asset_id)).length,
      },
      groups: groups.map((g) => ({
        group: g.id, act: g.act, seq_ids: g.seq_ids, need: g.need, narration: g.narration,
        shots: g.shots.length, seconds: round(g.shots.reduce((n, s) => n + s.duration_s, 0), 1), wanted: g.wanted,
        candidates_considered: g.considered || 0, planned_by: plan.get(g.id).planned_by, better_query: plan.get(g.id).better_query || '',
        picks: plan.get(g.id).picks.map((p) => {
          const got = (loaded.get(g.id) || []).find((x) => x.pick === p);
          return { source: p.c.source, source_id: p.c.source_id, title: p.c.title, duration_s: p.c.duration_s, look_for: p.look_for, fetched: Boolean(got?.asset), asset_id: got?.asset?.asset_id || null, used: Boolean(got?.asset && usedAssets.has(got.asset.asset_id)) };
        }),
      })),
    };
    log(`assets: ${groups.length} needs, ${planOut.totals.candidates_considered} candidates read, ${planOut.totals.planned} planned, ${downloads} downloaded, ${planOut.totals.reviewed} reviewed, ${usedAssets.size} used, ${planOut.totals.minutes} min`);
    planOut.totals.motion_added = motionAdded;
    planOut.totals.flow_added = flowAdded;
    return { shotList, plan: planOut, report: { generated_at: nowIso(), flow_added: flowAdded, motion_added: motionAdded, totals: planOut.totals, shots: report } };
  } finally {
    db.close();
  }
}

// ---------- motion fill-in ----------

const FillOut = z.object({ shots: z.array(z.object({ shot_id: z.string(), motion: z.any().nullable().default(null), reason: z.string().default('') })) });
const numbersOf = (text) => (String(text).match(/\d[\d,]*(?:\.\d+)?/g) || []).map((n) => Number(n.replace(/,/g, '')));

// The numbers a motion graphic states as facts (not coordinates, zoom levels or icon counts).
export function factNumbers(spec) {
  const d = spec.data;
  const out = [];
  const add = (v) => { if (typeof v === 'number') out.push(v); else out.push(...numbersOf(v ?? '')); };
  if (spec.template === 'compare') d.items.forEach((i) => add(i.value));
  if (spec.template === 'ranking') d.rows.forEach((r) => { add(r.value); add(r.note); });
  if (spec.template === 'trend') d.series.forEach((x) => x.values.forEach(add));
  if (spec.template === 'process') d.steps.forEach((x) => { add(x.label); add(x.detail); });
  if (spec.template === 'map') {
    for (const st of d.steps) {
      if (['callout', 'pie', 'icons'].includes(st.type)) { add(st.value); add(st.label); }
      if (st.type === 'pie') add(st.percent);
      if (st.type === 'ring') { add(st.radius_km); add(st.label); }
    }
  }
  return out;
}

// One call per batch of unfilled shots; a spec is kept only if it parses and every number it shows
// appears in the claims of that shot's narration (or of its act).
async function motionFill({ llm, style, research, script, shotList, items, log }) {
  const out = new Map();
  if (!llm || !items.length || !research || !script) return out;
  const segs = new Map(script.segments.map((x) => [x.seg_id, x]));
  const claimById = new Map(research.claims.map((c) => [c.claim_id, c]));
  const actClaims = new Map();
  for (const x of script.segments) actClaims.set(x.act, [...new Set([...(actClaims.get(x.act) || []), ...x.claims])]);
  const index = new Map(shotList.shots.map((x, i) => [x.shot_id, i]));
  const describe = (x) => (x ? (x.motion ? `${x.visual_type} ${x.motion.template}` : x.visual_type) : '');
  const prepared = items.map(({ shot }) => {
    const own = shot.seg_refs.flatMap((id) => segs.get(id)?.claims || []);
    const ids = [...new Set([...own, ...(actClaims.get(shot.act) || [])])].slice(0, 24);
    const i = index.get(shot.shot_id);
    return {
      shot_id: shot.shot_id, duration_s: shot.duration_s, need: shot.need,
      narration: shot.seg_refs.map((id) => stripMarkup(segs.get(id)?.text || '')).join(' ').slice(0, 400),
      prev: describe(shotList.shots[i - 1]), next: describe(shotList.shots[i + 1]),
      claims: ids.map((id) => claimById.get(id)).filter(Boolean),
    };
  });
  for (let i = 0; i < prepared.length; i += 12) {
    const batch = prepared.slice(i, i + 12);
    let res;
    try {
      res = await llm.json({ stage: 'motion_fill', schema: FillOut, system: houseRules(style), prompt: motionFillPrompt({ shots: batch }), maxTokens: 12000 });
    } catch (err) {
      log(`motion fill-in failed for ${batch.length} shots: ${err.message.slice(0, 160)}`);
      continue;
    }
    for (const r of res.shots) {
      const x = batch.find((b) => b.shot_id === r.shot_id);
      if (!x || !r.motion) continue;
      const spec = parseMotion(typeof r.motion === 'string' ? r.motion : JSON.stringify(r.motion));
      if (!spec) { log(`motion fill-in ${r.shot_id}: invalid ${r.motion?.template || ''} data`); continue; }
      const allowed = x.claims.flatMap((c) => numbersOf(c.text));
      const invented = factNumbers(spec).filter((n) => !allowed.some((a) => Math.abs(a - n) < 1e-9));
      if (invented.length) { log(`motion fill-in ${r.shot_id}: numbers not in claims (${invented.slice(0, 3).join(', ')}), dropped`); continue; }
      out.set(r.shot_id, spec);
    }
  }
  return out;
}

// Picks a clean source range from the clips already fetched for this need: one continuous shot
// inside the source, never reused in this project. Strong visual matches (relevance >= 2) win over
// weak ones; within a level, real speed comes before a gentle documentary-safe slow-down.
// A shot whose narration names hardware (need.platform) only takes shots the visual review saw as
// that platform (relevance >= 2) whenever review is available; context shots (1) are for generic needs.
function pickRange({ pool, shot, used, style, strict = false }) {
  for (const minRelevance of strict && shot.need?.platform ? [2] : [2, 1]) {
    for (const speed of [1, style.assets.min_speed]) {
      const need = shot.duration_s * speed + 0.2;
      for (const { asset, review, pick } of pool) {
        const taken = used.get(asset.asset_id) || [];
        const shots = usableShots(asset, review, minRelevance);
        if (asset.kind === 'image') {
          if (taken.length || speed !== 1 || !shots.length) continue;
          used.set(asset.asset_id, [{ in: 0, out: 0 }]);
          return { asset, range: null, score: pick.score, relevance: shots[0].relevance, reviewed: Boolean(review) };
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
          return { asset, range, score: pick.score, relevance: seg.relevance, reviewed: Boolean(review) };
        }
      }
    }
  }
  return null;
}

import fs from 'node:fs';
import path from 'node:path';
import { AudioPlan, Edl } from '../contracts.js';
import { AssetDb } from './assets.js';
import { hash, readJson, round, seededRandom } from '../util.js';

const FOOTAGE = new Set(['REAL', 'ARCHIVAL', 'NEWS', 'FLOW']);

// S10a: shot list -> EDL. Shots without media are absorbed by the previous clip so the
// timeline never has holes; each repair is reported for QC.
export function buildEdl({ project, shotList, style, config }) {
  const db = new AssetDb(config);
  const repairs = [];
  const clips = [];
  try {
    for (const shot of shotList.shots) {
      const media = mediaFor(shot, db, project, config);
      if (!media) {
        repairs.push({ shot_id: shot.shot_id, at_s: shot.start_s, visual_type: shot.visual_type });
        if (clips.length) {
          clips.at(-1).duration_s = round(clips.at(-1).duration_s + shot.duration_s);
          continue;
        }
      }
      const kind = media?.kind || 'black';
      clips.push({
        clip_id: `C-${String(clips.length + 1).padStart(4, '0')}`,
        shot_id: shot.shot_id,
        kind,
        src: media?.src || null,
        src_in: media?.src_in || 0,
        speed: media?.speed || 1,
        start_s: shot.start_s,
        duration_s: shot.duration_s,
        transition_in: { type: shot.transition_in, dur_s: style.transitions.durations[shot.transition_in] || 0 },
        look: FOOTAGE.has(shot.visual_type),
        overlays: shotList.overlays.filter((o) => o.motion_file && o.start_s >= shot.start_s - 0.01 && o.start_s < shot.start_s + shot.duration_s)
          .map((o) => ({ src: path.join(project.dir, o.motion_file), at_s: round(o.start_s - shot.start_s), duration_s: o.duration_s })),
      });
    }
  } finally {
    db.close();
  }
  // A clip never starts with a dissolve longer than the previous clip.
  for (let i = 1; i < clips.length; i++) {
    const t = clips[i].transition_in;
    t.dur_s = round(Math.min(t.dur_s, clips[i - 1].duration_s * 0.5, clips[i].duration_s * 0.5));
    if (t.dur_s < 0.1 && t.type !== 'cut') clips[i].transition_in = { type: 'cut', dur_s: 0 };
  }
  clips[0].transition_in = { type: 'fade_black', dur_s: 1.0 };
  const edl = Edl.parse({ fps: style.canvas.fps, width: style.canvas.width, height: style.canvas.height, duration_s: shotList.duration_s, clips });
  return { edl, repairs };
}

function mediaFor(shot, db, project, config) {
  if (shot.shot_class === 'black' && !shot.motion_file) return { kind: 'black' };
  if (shot.motion_file) return { kind: 'motion', src: path.join(project.dir, shot.motion_file) };
  if (shot.visual_type === 'FLOW' && shot.flow_file) return { kind: 'video', src: path.join(project.dir, shot.flow_file), src_in: shot.asset_range?.in || 0 };
  if (shot.asset_id) {
    const asset = db.byId(shot.asset_id);
    if (!asset?.file) return null;
    const src = path.join(config.assetsDir, asset.file);
    if (!fs.existsSync(src)) return null;
    return asset.kind === 'image' ? { kind: 'image', src } : { kind: 'video', src, src_in: shot.asset_range?.in || 0, speed: shot.asset_range?.speed || 1 };
  }
  return null;
}

// ---------- S10b: audio plan ----------

function loadLibrary(config, kind) {
  const file = path.join(config.libraryDir, kind, 'index.json');
  if (!fs.existsSync(file)) return [];
  return readJson(file).map((t) => ({ ...t, file: path.resolve(path.dirname(file), t.file) })).filter((t) => fs.existsSync(t.file));
}

const ACT_FUNCTION = { 1: 'investigation', 2: 'scale', 3: 'engineering', 4: 'engineering', 5: 'threat', 6: 'action', 7: 'ending' };

export function buildAudioPlan({ project, shotList, vo, script, style, config }) {
  const a = style.audio;
  const total = shotList.duration_s;
  const rand = seededRandom(`${project.id}:music`);
  const voFile = new Map(vo.segments.map((s) => [s.seg_id, path.join(project.dir, s.file)]));
  const voTrack = shotList.vo_placements.map((p) => ({ file: voFile.get(p.seg_id), start_s: p.start_s }));

  // VO regions (merged across short gaps) drive the ducking.
  const regions = [];
  for (const p of shotList.vo_placements) {
    const last = regions.at(-1);
    if (last && p.start_s - last.e < 1.2) last.e = round(p.start_s + p.duration_s);
    else regions.push({ s: p.start_s, e: round(p.start_s + p.duration_s) });
  }

  // Act windows.
  const actOf = new Map(script.segments.map((s) => [s.seg_id, s.act]));
  const actSpans = [];
  for (const p of shotList.vo_placements) {
    const act = actOf.get(p.seg_id);
    const span = actSpans.find((x) => x.act === act);
    if (span) span.e = p.start_s + p.duration_s;
    else actSpans.push({ act, s: p.start_s, e: p.start_s + p.duration_s });
  }
  if (actSpans.length) { actSpans[0].s = 0; actSpans.at(-1).e = total; }
  for (let i = 1; i < actSpans.length; i++) actSpans[i].s = actSpans[i - 1].e;

  // No-music windows: one per block of no_music_every_s, placed on an information-dense stretch.
  const noMusic = [];
  for (let block = 60; block < total - 60; block += a.no_music_every_s) {
    const cand = shotList.vo_placements.find((p) => p.start_s >= block && p.start_s < block + a.no_music_every_s - 60
      && script.segments.find((s) => s.seg_id === p.seg_id)?.purpose === 'I');
    if (!cand) continue;
    const len = a.no_music_s[0] + (a.no_music_s[1] - a.no_music_s[0]) * rand();
    noMusic.push({ s: round(cand.start_s), e: round(Math.min(total, cand.start_s + len)) });
  }

  const music = [];
  const tracks = loadLibrary(config, 'music');
  if (tracks.length) {
    const used = new Set();
    for (const span of actSpans) {
      const fn = ACT_FUNCTION[span.act] || 'engineering';
      const pool = tracks.filter((t) => t.function === fn && !used.has(t.file));
      const pick = (pool.length ? pool : tracks.filter((t) => !used.has(t.file)).concat(tracks))[0];
      used.add(pick.file);
      // Split the act span around no-music windows and black beats.
      let pieces = [{ s: span.s, e: span.e }];
      for (const w of [...noMusic, ...shotList.breaths.filter((b) => b.kind === 'black_beat').map((b) => ({ s: b.start_s - 1, e: b.start_s + b.duration_s }))]) {
        pieces = pieces.flatMap((p) => (w.e <= p.s || w.s >= p.e ? [p] : [{ s: p.s, e: w.s }, { s: w.e, e: p.e }]));
      }
      let offset = 0;
      for (const piece of pieces.filter((x) => x.e - x.s >= 6)) {
        music.push({ file: pick.file, start_s: round(piece.s), end_s: round(piece.e), function: fn, src_in: round(offset % Math.max(1, (pick.duration_s || 180) - 30)) });
        offset += piece.e - piece.s;
      }
    }
    // Respect the coverage ceiling by trimming the longest cues.
    const covered = () => music.reduce((n, m) => n + (m.end_s - m.start_s), 0);
    while (covered() > total * a.music_max_share) {
      const longest = music.reduce((x, m) => (m.end_s - m.start_s > x.end_s - x.start_s ? m : x));
      longest.end_s = round(longest.end_s - Math.min(20, covered() - total * a.music_max_share + 0.1));
    }
  }

  const ambience = [];
  const amb = loadLibrary(config, 'ambience');
  if (amb.length) {
    const seqs = new Map();
    for (const s of shotList.shots) {
      if (!['REAL', 'ARCHIVAL', 'FLOW'].includes(s.visual_type)) continue;
      const cur = seqs.get(s.seq_id) || { s: s.start_s, e: s.start_s + s.duration_s, need: s.need };
      cur.e = s.start_s + s.duration_s;
      seqs.set(s.seq_id, cur);
    }
    for (const seq of seqs.values()) {
      const words = `${seq.need?.subject || ''} ${seq.need?.action || ''} ${(seq.need?.mood || []).join(' ')}`.toLowerCase();
      const best = amb.map((t) => ({ t, n: (t.tags || []).filter((tag) => words.includes(tag)).length })).sort((x, y) => y.n - x.n)[0];
      const track = best.n ? best.t : amb.find((t) => (t.tags || []).includes('room')) || null;
      if (track) ambience.push({ file: track.file, start_s: round(seq.s), end_s: round(seq.e), gain_db: a.ambience_db });
    }
  }

  return AudioPlan.parse({ duration_s: total, vo: voTrack, music, ambience, sfx: [], vo_regions: regions, no_music: noMusic, key: hash(voTrack) });
}

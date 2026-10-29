import fs from 'node:fs';
import path from 'node:path';
import { AudioPlan, Edl } from '../contracts.js';
import { AssetDb } from './assets.js';
import { hash, readJson, round, seededRandom } from '../util.js';
import { buildStoryAudio } from '../story-audio.js';

const FOOTAGE = new Set(['REAL', 'ARCHIVAL', 'NEWS', 'FLOW']);
const NAT = new Set(['REAL', 'ARCHIVAL', 'NEWS']);

// S10a: shot list -> EDL. Shots without media are covered by their neighbours so the timeline never
// has holes: first with the unused clean source time after each neighbour's range (never across a
// cut inside the source), then with a gentle slow-down. Each repair is reported for QC.
const MIN_REPAIR_SPEED = 0.7;

export function buildEdl({ project, shotList, style, config }) {
  const db = new AssetDb(config);
  const repairs = [];
  const items = [];
  try {
    let currentSeq = null;
    let seqShotIndex = 0;
    let timelineT = 0;
    for (const shot of shotList.shots) {
      if (items.length > 0 && shot.start_s > timelineT + 0.05) {
        const gapLen = round(shot.start_s - timelineT, 3);
        items.push({
          shot_id: `ACT-BREAK-${items.length}`,
          kind: 'black',
          src: null,
          src_in: 0,
          speed: 1,
          scale: 1,
          start_s: timelineT,
          duration_s: gapLen,
          transition_in: { type: 'fade_black', dur_s: Math.min(1.0, round(gapLen * 0.35, 3)) },
          look: false,
          nat: false,
          _room: 0,
        });
        timelineT = shot.start_s;
      }

      if (shot.seq_id && shot.seq_id === currentSeq) {
        seqShotIndex++;
      } else {
        currentSeq = shot.seq_id || null;
        seqShotIndex = 0;
      }
      const media = mediaFor(shot, db, project, config, style);
      if (!media) {
        repairs.push({ shot_id: shot.shot_id, at_s: shot.start_s, visual_type: shot.visual_type });
        const last = items.at(-1);
        if (last?.gap) last.duration_s = round(last.duration_s + shot.duration_s);
        else items.push({ gap: true, shot_id: shot.shot_id, start_s: shot.start_s, duration_s: shot.duration_s });
        timelineT = round(shot.start_s + shot.duration_s, 3);
        continue;
      }
      let srcIn = media.src_in || 0;
      const prev = items.at(-1);
      if (prev && !prev.gap && prev.src === media.src && media.kind === 'video') {
        srcIn = round((prev.src_in || 0) + prev.duration_s * (prev.speed || 1), 3);
      }
      const scale = seqShotIndex === 0 ? 1.0 : seqShotIndex === 1 ? 1.15 : 1.25;
      items.push({
        shot_id: shot.shot_id,
        kind: media.kind,
        src: media.src || null,
        src_in: srcIn,
        speed: media.speed || 1,
        scale,
        start_s: shot.start_s,
        duration_s: shot.duration_s,
        transition_in: { type: shot.transition_in, dur_s: style.transitions.durations[shot.transition_in] || 0 },
        look: FOOTAGE.has(shot.visual_type),
        nat: NAT.has(shot.visual_type) && media.kind === 'video',
        _room: media.room ?? 0,
      });
      timelineT = round(shot.start_s + shot.duration_s, 3);
    }
  } finally {
    db.close();
  }

  items.forEach((gap, i) => { if (gap.gap) fillGap(gap, items[i - 1], items[i + 1]); });
  const clips = items.filter((x) => !x.gap && x.duration_s > 0.01);
  if (!clips.length) clips.push({ shot_id: shotList.shots[0]?.shot_id || 'none', kind: 'black', src: null, src_in: 0, speed: 1, start_s: 0, duration_s: shotList.duration_s, transition_in: { type: 'fade_black', dur_s: 1 }, look: false, nat: false });

  // Ensure video covers the full timeline with a graceful fade to black so audio is never truncated
  const currentTotal = round(clips.reduce((acc, c) => acc + c.duration_s, 0), 3);
  if (currentTotal < shotList.duration_s + 0.5) {
    clips.push({
      shot_id: 'SH-OUTRO',
      kind: 'black',
      src: null,
      src_in: 0,
      speed: 1,
      start_s: currentTotal,
      duration_s: round(shotList.duration_s - currentTotal + 1.5, 3),
      transition_in: { type: 'fade_black', dur_s: 1.0 },
      look: false,
      nat: false,
    });
  }

  // Overlays follow the final clip windows, so a number card over a repaired shot is kept.
  for (const clip of clips) {
    clip.overlays = shotList.overlays.filter((o) => o.motion_file && o.start_s >= clip.start_s - 0.01 && o.start_s < clip.start_s + clip.duration_s)
      .map((o) => ({ src: path.join(project.dir, o.motion_file), at_s: round(o.start_s - clip.start_s), duration_s: o.duration_s }));
  }
  clips.forEach((clip, i) => { clip.clip_id = `C-${String(i + 1).padStart(4, '0')}`; });
  // A clip never starts with a dissolve longer than the previous clip, and a dissolve never needs
  // tail frames from past the previous clip's clean source range (that would flash the next scene).
  for (let i = 1; i < clips.length; i++) {
    const t = clips[i].transition_in;
    const prev = clips[i - 1];
    const tail = prev.kind === 'video' ? prev._room ?? 0 : Infinity;
    t.dur_s = round(Math.min(t.dur_s, prev.duration_s * 0.5, clips[i].duration_s * 0.5, tail));
    if (t.dur_s < 0.1 && t.type !== 'cut') clips[i].transition_in = { type: 'cut', dur_s: 0 };
  }
  for (const clip of clips) delete clip._room;
  clips[0].transition_in = { type: 'fade_black', dur_s: 1.0 };
  const edl = Edl.parse({ fps: style.canvas.fps, width: style.canvas.width, height: style.canvas.height, duration_s: shotList.duration_s, clips });
  return { edl, repairs };
}

function fillGap(gap, prev, next) {
  prev = prev && !prev.gap ? prev : null;
  next = next && !next.gap ? next : null;
  let d = gap.duration_s;
  const extendPrev = (x) => { prev.duration_s = round(prev.duration_s + x); d = round(d - x); };
  const extendNext = (x) => { next.start_s = round(next.start_s - x); next.duration_s = round(next.duration_s + x); d = round(d - x); };
  // 1. Unused clean source time after each neighbour's range.
  if (prev && d > 0) { const x = Math.min(d, prev._room); prev._room -= x; extendPrev(x); }
  if (next && d > 0) { const x = Math.min(d, next._room); next._room -= x; extendNext(x); }
  // 2. Slow a video neighbour down, never below MIN_REPAIR_SPEED.
  for (const [c, extend] of [[prev, extendPrev], [next, extendNext]]) {
    if (!c || d <= 0 || c.kind !== 'video') continue;
    const source = c.duration_s * c.speed;
    const x = Math.min(d, source / MIN_REPAIR_SPEED - c.duration_s);
    if (x <= 0.01) continue;
    extend(x);
    c.speed = round(source / c.duration_s, 4);
  }
  // 3. Whatever is left runs on (the old behaviour); rare once the steps above apply.
  if (d > 0 && prev) extendPrev(d);
  else if (d > 0 && next) extendNext(d);
  gap.duration_s = d;
}

function mediaFor(shot, db, project, config, style = {}) {
  if (shot.shot_class === 'black' && !shot.motion_file) {
    if (style.black_beats?.max === 0) return null;
    return { kind: 'black', room: Infinity };
  }
  if (shot.motion_file) return { kind: 'motion', src: path.join(project.dir, shot.motion_file), room: 0 };
  if (shot.visual_type === 'FLOW') {
    if (shot.flow_file && fs.existsSync(path.join(project.dir, shot.flow_file))) {
      const r = shot.asset_range;
      return { kind: 'video', src: path.join(project.dir, shot.flow_file), src_in: r?.in || 0, room: Infinity };
    }
    const flowDir = path.join(project.dir, 'flow');
    if (fs.existsSync(flowDir)) {
      const files = fs.readdirSync(flowDir).filter((f) => f.endsWith('.mp4')).sort();
      if (files.length) {
        const idNum = Number((shot.shot_id || '0').replace(/\D/g, '')) || 0;
        const pick = files[idNum % files.length];
        return { kind: 'video', src: path.join(flowDir, pick), src_in: 0, room: Infinity };
      }
    }
  }
  if (shot.asset_id) {
    const asset = db.byId(shot.asset_id);
    if (asset?.file) {
      const src = path.join(config.assetsDir, asset.file);
      if (fs.existsSync(src)) {
        if (asset.kind === 'image') return { kind: 'image', src, room: Infinity };
        const r = shot.asset_range;
        const speed = r?.speed || 1;
        const end = r ? r.out : 0;
        const seg = r && asset.segments.find((s) => s.in <= r.in + 0.05 && s.out >= end - 0.05);
        return { kind: 'video', src, src_in: r?.in || 0, speed, room: seg ? Math.max(0, (seg.out - end) / speed) : 0 };
      }
    }
  }

  // Illustrated / Flow fallback: ensure 100% visual coverage so no shot is ever blank
  const flowDir = path.join(project.dir, 'flow');
  if (fs.existsSync(flowDir)) {
    const files = fs.readdirSync(flowDir).filter((f) => f.endsWith('.mp4')).sort();
    if (files.length) {
      const idNum = Number((shot.shot_id || '0').replace(/\D/g, '')) || 0;
      const pick = files[idNum % files.length];
      return { kind: 'video', src: path.join(flowDir, pick), src_in: 0, room: Infinity };
    }
  }

  return null;
}

// ---------- S10b: audio plan ----------

function loadLibrary(config, kind) {
  const file = path.join(config.libraryDir, kind, 'index.json');
  if (!fs.existsSync(file)) return [];
  return readJson(file).map((t) => ({ ...t, file: path.resolve(path.dirname(file), t.file) })).filter((t) => fs.existsSync(t.file));
}

function musicFunctionForAct(actNo, totalActs, style) {
  const custom = style.audio?.music_functions;
  if (Array.isArray(custom) && custom.length > 0) {
    const idx = Math.min(custom.length - 1, Math.max(0, Math.floor(((actNo - 1) / Math.max(1, totalActs - 1)) * (custom.length - 1))));
    return custom[idx];
  }
  const defaultFunctions = ['investigation', 'scale', 'engineering', 'threat', 'action', 'ending'];
  const idx = Math.min(defaultFunctions.length - 1, Math.max(0, Math.floor(((actNo - 1) / Math.max(1, totalActs - 1)) * (defaultFunctions.length - 1))));
  return defaultFunctions[idx];
}

export function syncShotListWithVo({ shotList, vo, script }) {
  if (!vo?.segments?.length || !script?.segments?.length || !shotList?.shots?.length) return shotList;
  const voDurMap = new Map(vo.segments.map((s) => [s.seg_id, s.duration_s]));
  const shotsBySeg = new Map();
  for (const s of shotList.shots) {
    const ref = s.seg_refs?.[0];
    if (ref && voDurMap.has(ref)) {
      if (!shotsBySeg.has(ref)) shotsBySeg.set(ref, []);
      shotsBySeg.get(ref).push(s);
    }
  }

  let t = 0.8; // lead-in
  let currentAct = script.segments[0]?.act || 1;
  const newPlacements = [];
  const newShots = [];

  for (const seg of script.segments) {
    const dur = voDurMap.get(seg.seg_id);
    if (!dur) continue;
    if (seg.act !== currentAct) {
      t += 2.8; // act break pause
      currentAct = seg.act;
    }
    const segStart = round(t, 3);
    newPlacements.push({
      seg_id: seg.seg_id,
      start_s: segStart,
      duration_s: dur,
    });

    const shots = shotsBySeg.get(seg.seg_id) || [];
    if (shots.length > 0) {
      const oldTotal = shots.reduce((acc, s) => acc + s.duration_s, 0);
      const targetDuration = dur + 0.35; // shot window covers speech + natural gap
      let shotT = segStart;
      const cutLen = shots[0].motion?.data?.montage_cut;
      const grid = cutLen && shots.every((x) => x.motion?.data?.montage_cut === cutLen);
      for (let si = 0; si < shots.length; si++) {
        const sh = { ...shots[si] };
        const ratio = oldTotal > 0 ? sh.duration_s / oldTotal : 1 / shots.length;
        // montage cuts keep their exact length (they are locked to the score); the last cut takes the slack
        const newDur = grid ? round(si === shots.length - 1 ? Math.max(0.5, targetDuration - cutLen * (shots.length - 1)) : cutLen, 3) : round(targetDuration * ratio, 3);
        sh.start_s = round(shotT, 3);
        sh.duration_s = newDur;
        newShots.push(sh);
        shotT += newDur;
      }
    }
    t += dur + 0.35;
  }

  t += 4.0;
  const totalDuration = round(t, 3);

  const shotStartMap = new Map(newShots.map((s) => [s.shot_id, s.start_s]));
  const updatedOverlays = (shotList.overlays || []).map((ov) => {
    const shotStart = shotStartMap.get(ov.shot_id);
    return {
      ...ov,
      start_s: shotStart != null ? round(shotStart + 0.5, 3) : ov.start_s,
    };
  });

  return {
    ...shotList,
    duration_s: totalDuration,
    vo_placements: newPlacements,
    shots: newShots.length ? newShots : shotList.shots,
    overlays: updatedOverlays,
  };
}

export function buildAudioPlan({ project, shotList: rawShotList, vo, script, style, config }) {
  const shotList = syncShotListWithVo({ shotList: rawShotList, vo, script });
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

  const storyAudio = style.story?.enabled ? buildStoryAudio({ project, shotList, actSpans, regions, noMusic, total, style, config }) : null;
  const music = storyAudio ? storyAudio.music : [];
  const tracks = storyAudio ? [] : loadLibrary(config, 'music');
  if (tracks.length) {
    const used = new Set();
    for (const span of actSpans) {
      const fn = musicFunctionForAct(span.act, actSpans.length, style);
      const pool = tracks.filter((t) => t.function === fn && !used.has(t.file));
      const options = pool.length ? pool : tracks.filter((t) => !used.has(t.file)).concat(tracks);
      // Seeded per project: deterministic for one film, but films do not all share the same cues.
      const pick = options[Math.floor(rand() * options.length) % options.length];
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
  const amb = storyAudio ? [] : loadLibrary(config, 'ambience');
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

  const sfx = [];
  const sfxClick = path.join(config.libraryDir, 'sfx', 'click.wav');
  const sfxPage = path.join(config.libraryDir, 'sfx', 'page_turn.wav');
  const sfxWhoosh = path.join(config.libraryDir, 'sfx', 'whoosh_soft.wav');
  const sfxBoom = path.join(config.libraryDir, 'sfx', 'cinematic_boom.wav');

  // 0. Opening Sound Design: Cinematic whoosh/impact at frame 0 to immediately seize viewer attention
  if (fs.existsSync(sfxBoom)) {
    sfx.push({ file: sfxBoom, at_s: 0.0, gain_db: -4 });
  }
  if (fs.existsSync(sfxWhoosh)) {
    sfx.push({ file: sfxWhoosh, at_s: 0.1, gain_db: -5 });
  }

  // Act boundary cinematic impacts
  if (fs.existsSync(sfxBoom)) {
    for (const span of actSpans.slice(1)) {
      sfx.push({ file: sfxBoom, at_s: round(span.s), gain_db: -5 });
    }
  }

  // 1. Subscribe overlay clicks
  if (fs.existsSync(sfxClick)) {
    for (const ov of (shotList.overlays || [])) {
      if (ov.kind === 'subscribe') {
        sfx.push({ file: sfxClick, at_s: round(ov.start_s + 1.8), gain_db: -4 });
        sfx.push({ file: sfxClick, at_s: round(ov.start_s + 2.85), gain_db: -4 });
      }
    }
  }

  // 2. Creative Transition SFX: storybook page turns & atmospheric whooshes
  let lastSfxAt = -Infinity;
  for (const shot of shotList.shots) {
    if (shot.start_s <= 1.0) continue;
    const t = shot.transition_in;
    if (shot.start_s - lastSfxAt < 3.5) continue; // Debounce so SFX don't crowd each other

    if ((t === 'page_turn' || t === 'parchment_reveal' || t === 'slide_left') && fs.existsSync(sfxPage)) {
      sfx.push({ file: sfxPage, at_s: round(shot.start_s - 0.05), gain_db: -8 });
      lastSfxAt = shot.start_s;
    } else if ((t === 'dissolve_slow' || t === 'dissolve') && fs.existsSync(sfxWhoosh) && (shot.mode === 'CINEMATIC' || shot.purpose === 'R')) {
      sfx.push({ file: sfxWhoosh, at_s: round(shot.start_s - 0.15), gain_db: -7 });
      lastSfxAt = shot.start_s;
    }
  }

  if (storyAudio) { sfx.length = 0; sfx.push(storyAudio.sfx); }

  return AudioPlan.parse({ duration_s: total, vo: voTrack, music, ambience, sfx, vo_regions: regions, no_music: noMusic, key: hash(voTrack) });
}

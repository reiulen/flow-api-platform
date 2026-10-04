// The editor engine. Deterministic: the same script, voice timing, visual beats and style profile
// always produce the same shot list. All taste decisions about time live here, not in the LLM.
import { ShotList } from '../contracts.js';
import { round, seededRandom } from '../util.js';

const FOOTAGE = new Set(['REAL', 'ARCHIVAL', 'NEWS']);
const EXPLAINER = new Set(['MAP', 'TECH']);

export function buildShotList({ script, vo, visual, style, seed, title }) {
  const rand = seededRandom(seed);
  const p = style.pacing;
  const n = style.narration;
  const voBySeg = new Map(vo.segments.map((s) => [s.seg_id, s]));
  const acts = style.acts.map((a) => a.act).filter((a) => script.segments.some((s) => s.act === a));

  const spans = [];      // visual spans before splitting into shots
  const placements = []; // where each VO segment sits on the timeline
  const breaths = [];
  let t = 0;

  // Cold open: wordless atmosphere before the first line.
  const cold = visual.cold_open?.length ? visual.cold_open : [];
  if (cold.length) {
    const each = n.cold_open_s / cold.length;
    for (const [i, b] of cold.entries()) {
      spans.push({ start: t + i * each, end: t + (i + 1) * each, beat: { ...b, from_word: 0, claims: [] }, seg: null, act: 1, mode: 'CINEMATIC', purpose: 'C', density: 'low', key: `cold-${i}` });
    }
    breaths.push({ start_s: 0, duration_s: n.cold_open_s, kind: 'cold_open' });
    t = n.cold_open_s;
  }

  let sinceBreath = 0;
  let blackBeats = 0;
  const actBreaks = new Set();
  for (const [ai, actNo] of acts.entries()) {
    const segs = script.segments.filter((s) => s.act === actNo);
    for (const [si, seg] of segs.entries()) {
      const timing = voBySeg.get(seg.seg_id);
      if (!timing) throw new Error(`editor: no voice timing for ${seg.seg_id}`);
      placements.push({ seg_id: seg.seg_id, start_s: round(t), duration_s: timing.duration_s });
      const beats = visual.segments[seg.seg_id] || [];
      beats.forEach((beat, bi) => {
        const w = timing.words[Math.min(beat.from_word, timing.words.length - 1)];
        const start = bi === 0 ? t : t + (w ? w.s : 0);
        spans.push({ start, end: null, beat, seg, act: actNo, mode: seg.mode, purpose: seg.purpose, density: seg.density, key: `${seg.seg_id}-${bi}` });
      });
      t += timing.duration_s;
      sinceBreath += timing.duration_s;

      const lastOfAct = si === segs.length - 1;
      if (lastOfAct && ai < acts.length - 1) {
        // Act break: a held image, then (for most acts) a black beat; the title card follows act 1.
        const breakLen = n.act_break_s[0] + (n.act_break_s[1] - n.act_break_s[0]) * 0.5;
        breaths.push({ start_s: round(t), duration_s: breakLen, kind: 'act_break' });
        t += breakLen;
        if (actNo === 1) {
          spans.push({ start: t, end: t + style.black_beats.with_title_s, special: 'title', act: actNo, key: 'title' });
          t += style.black_beats.with_title_s;
        } else if (blackBeats < style.black_beats.max) {
          spans.push({ start: t, end: t + style.black_beats.duration_s, special: 'black', act: actNo + 1, key: `black-${actNo}` });
          breaths.push({ start_s: round(t), duration_s: style.black_beats.duration_s, kind: 'black_beat' });
          t += style.black_beats.duration_s;
          blackBeats += 1;
        }
        actBreaks.add(actNo + 1);
        sinceBreath = 0;
      } else if (!lastOfAct) {
        const next = segs[si + 1];
        const wantsBreath = sinceBreath >= n.breathing_every_s && ['C', 'R', 'T'].includes(next.purpose);
        const forcedBreath = sinceBreath >= n.breathing_every_s * 1.5;
        if (wantsBreath || forcedBreath) {
          const len = n.breathing_s[0] + (n.breathing_s[1] - n.breathing_s[0]) * rand();
          breaths.push({ start_s: round(t), duration_s: round(len), kind: 'breathing' });
          t += len;
          sinceBreath = 0;
        } else {
          t += 0.3; // natural gap between segments
        }
      }
    }
  }
  // Ending: hold the last image, then fade out.
  const ending = 6;
  breaths.push({ start_s: round(t), duration_s: ending, kind: 'breathing' });
  t += ending;
  const total = round(t);

  // Close spans: each runs until the next one starts.
  spans.sort((a, b) => a.start - b.start);
  for (let i = 0; i < spans.length; i++) spans[i].end = spans[i].end ?? (spans[i + 1]?.start ?? total);
  for (let i = 0; i < spans.length; i++) if (spans[i + 1] && spans[i].end > spans[i + 1].start) spans[i].end = spans[i + 1].start;
  mergeShortSpans(spans, p.min_shot);

  // Split spans into shots.
  const shots = [];
  let flowCount = 0;
  const flowLimit = Math.floor((total * style.visual_mix.flow[1]) / style.flow.duration_s);
  for (const span of spans) {
    const dur = span.end - span.start;
    if (dur <= 0.05) continue;
    if (span.special) {
      // Black beats are pure black; the title card after the hook carries the film title.
      shots.push(baseShot(span, span.start, dur, 'TYPE', 'black', span.special === 'title' ? { motion: { template: 'title', data: { title } } } : {}));
      continue;
    }
    const type = span.beat.visual_type;
    if (EXPLAINER.has(type) && span.beat.motion) {
      const explainLen = Math.min(dur, p.explainer.max);
      if (explainLen >= 4) {
        shots.push(baseShot(span, span.start, explainLen, type, 'explainer', { motion: span.beat.motion }));
        if (dur - explainLen > 0.05) pushFootage(shots, span, span.start + explainLen, dur - explainLen, 'REAL', rand, style);
        continue;
      }
    }
    if (type === 'FLOW' && flowCount < flowLimit) {
      const usable = style.flow.duration_s - 1;
      const parts = Math.max(1, Math.ceil(dur / usable));
      for (let i = 0; i < parts; i++) {
        const len = dur / parts;
        const shot = baseShot(span, span.start + i * len, len, 'FLOW', len > p.footage.max ? 'hold' : 'footage', {
          flow: { reconstruction: Boolean(span.beat.flow?.reconstruction), spec: span.beat.flow || {} },
        });
        shot.fallback_chain = ['REAL', 'ARCHIVAL'];
        shots.push(shot);
        flowCount += 1;
      }
      continue;
    }
    pushFootage(shots, span, span.start, dur, FOOTAGE.has(type) ? type : 'REAL', rand, style);
  }

  // Ids, sequences and transitions.
  let seq = 0;
  let prevKey = null;
  shots.forEach((shot, i) => {
    if (shot._key !== prevKey) seq += 1;
    prevKey = shot._key;
    shot.shot_id = `SH-${String(i + 1).padStart(4, '0')}`;
    shot.seq_id = `Q-${String(seq).padStart(3, '0')}`;
    shot.transition_in = transitionFor(shots[i - 1], shot, style, actBreaks);
    if (shot.visual_type === 'FLOW' && shot.flow?.reconstruction) shot.label = style.labels.reconstruction;
  });

  const overlays = buildOverlays({ shots, script, placements, voBySeg, style });
  for (const shot of shots) delete shot._key;

  return ShotList.parse({
    duration_s: total,
    vo_placements: placements,
    breaths,
    shots: shots.map((s) => ({ ...s, start_s: round(s.start_s), duration_s: round(s.duration_s) })),
    overlays,
  });
}

function baseShot(span, start, duration, visualType, shotClass, extra = {}) {
  return {
    shot_id: '', seq_id: '', act: span.act, seg_refs: span.seg ? [span.seg.seg_id] : [],
    start_s: start, duration_s: duration,
    mode: span.mode || 'CINEMATIC', purpose: span.purpose || 'R', density: span.density || 'low',
    visual_type: visualType, shot_class: shotClass,
    need: span.beat?.need, asset_id: null, asset_range: null, flow_file: null, motion_file: null,
    transition_in: 'cut', label: null, fallback_chain: visualType === 'REAL' ? ['ARCHIVAL', 'FLOW'] : visualType === 'ARCHIVAL' ? ['REAL', 'FLOW'] : [],
    _key: span.key, ...extra,
  };
}

// Footage spans become several shots. Cinematic spans hold longer; information spans cut at footage pace.
function pushFootage(shots, span, start, dur, type, rand, style) {
  const p = style.pacing;
  const cinematic = span.mode === 'CINEMATIC' || span.purpose === 'C' || span.purpose === 'R';
  const target = cinematic ? (p.hold.min + p.hold.max) / 2 * 0.75 : p.footage.target;
  const max = cinematic ? p.hold.max : p.footage.max;
  const min = cinematic ? p.footage.max : p.footage.min;
  let parts = Math.max(1, Math.round(dur / target));
  while (parts > 1 && dur / parts < min) parts -= 1;
  while (dur / parts > max) parts += 1;
  // Uneven but bounded lengths so the rhythm does not feel mechanical.
  const weights = Array.from({ length: parts }, () => 0.85 + rand() * 0.3);
  const sum = weights.reduce((a, b) => a + b, 0);
  let t = start;
  weights.forEach((w, i) => {
    const len = i === parts - 1 ? start + dur - t : (dur * w) / sum;
    const shotClass = cinematic ? (len > p.hold.max * 0.9 ? 'hero' : 'hold') : len < p.footage.min ? 'fast' : 'footage';
    shots.push(baseShot(span, t, len, type, shotClass, { _part: i }));
    t += len;
  });
}

function mergeShortSpans(spans, minLen) {
  for (let i = spans.length - 1; i > 0; i--) {
    const s = spans[i];
    if (s.special || spans[i - 1].special) continue;
    if (s.end - s.start < minLen) {
      spans[i - 1].end = s.end;
      spans.splice(i, 1);
    }
  }
}

function transitionFor(prev, shot, style, actBreaks) {
  const tr = style.transitions;
  if (!prev) return 'fade_black';
  if (shot.shot_class === 'black' || prev.shot_class === 'black') return 'fade_black';
  if (actBreaks.has(shot.act) && prev.act !== shot.act) return 'fade_black';
  if (prev._key === shot._key) return tr.same_sequence;
  if (EXPLAINER.has(prev.visual_type) || EXPLAINER.has(shot.visual_type)) return tr.explainer_boundary;
  if ((prev.visual_type === 'ARCHIVAL') !== (shot.visual_type === 'ARCHIVAL')) return tr.time_jump;
  return shot.mode === 'INFORMATION' ? tr.between_sources_information : tr.between_sources_cinematic;
}

// Number cards: at the word that states the number, never over an explainer, rate-limited.
function buildOverlays({ shots, script, placements, voBySeg, style }) {
  const cfg = style.type_cards;
  const startOf = new Map(placements.map((p) => [p.seg_id, p.start_s]));
  const overlays = [];
  let lastAt = -Infinity;
  for (const seg of script.segments) {
    for (const stat of seg.stats || []) {
      const timing = voBySeg.get(seg.seg_id);
      const digitWord = timing.words.find((w) => /\d/.test(w.w));
      const at = startOf.get(seg.seg_id) + (digitWord ? digitWord.s : 0.6);
      if (at - lastAt < cfg.min_gap_s) continue;
      const shot = shots.find((s) => at >= s.start_s && at < s.start_s + s.duration_s);
      if (!shot || EXPLAINER.has(shot.visual_type) || shot.shot_class === 'black') continue;
      const dur = Math.min(cfg.duration_s, shot.start_s + shot.duration_s - at - 0.2);
      if (dur < 1.2) continue;
      overlays.push({ overlay_id: `OV-${String(overlays.length + 1).padStart(3, '0')}`, kind: 'stat', shot_id: shot.shot_id, start_s: round(at), duration_s: round(dur), data: { value: stat.value, label: stat.label }, motion_file: null });
      lastAt = at;
    }
  }
  for (const shot of shots) {
    if (shot.label) overlays.push({ overlay_id: `OV-${String(overlays.length + 1).padStart(3, '0')}`, kind: 'label', shot_id: shot.shot_id, start_s: round(shot.start_s), duration_s: round(shot.duration_s), data: { text: shot.label }, motion_file: null });
  }
  return overlays;
}

// Pacing metrics straight from the plan (used by QC and by tests).
export function pacingMetrics(shotList, style) {
  const shots = shotList.shots.filter((s) => s.shot_class !== 'black');
  const durs = shots.map((s) => s.duration_s);
  const total = shotList.duration_s;
  const share = (pred) => shots.filter(pred).reduce((n, s) => n + s.duration_s, 0) / total;
  const trans = {};
  for (const s of shotList.shots) trans[s.transition_in] = (trans[s.transition_in] || 0) + 1;
  let infoRun = 0;
  let maxInfoRun = 0;
  for (const s of shots) { infoRun = s.purpose === 'I' ? infoRun + 1 : 0; maxInfoRun = Math.max(maxInfoRun, infoRun); }
  return {
    duration_s: total,
    shots: shots.length,
    asl_s: round(durs.reduce((a, b) => a + b, 0) / Math.max(1, durs.length), 2),
    median_s: round([...durs].sort((a, b) => a - b)[Math.floor(durs.length / 2)] || 0, 2),
    short_share: round(share((s) => s.duration_s < 3), 3),
    footage_share: round(share((s) => FOOTAGE.has(s.visual_type)), 3),
    explainer_share: round(share((s) => EXPLAINER.has(s.visual_type)), 3),
    flow_share: round(share((s) => s.visual_type === 'FLOW'), 3),
    transitions: trans,
    black_beats: shotList.shots.filter((s) => s.shot_class === 'black').length,
    max_consecutive_info_shots: maxInfoRun,
    speech_share: round(shotList.vo_placements.reduce((n, v) => n + v.duration_s, 0) / total, 3),
    breaths: shotList.breaths.length,
  };
}

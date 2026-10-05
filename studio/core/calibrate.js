// Measures a finished render the same way the reference videos were measured
// (studio/references/tools), and compares it with the style targets and the references.
import { spawn } from 'node:child_process';
import { measureLoudness } from './render.js';
import { round } from './util.js';

// Reference numbers from studio/references/data/*_metrics.json (00_REFERENCE_ANALYSIS.md).
export const REFERENCES = {
  saudi: { asl_s: 8.2, median_shot_s: 5.2, cuts_per_min: 7.3, short_time_pct: 4.2, cut_pct: 26, dissolve_short_pct: 68, slow_pct: 5, fade_black_pct: 2, explainer_pct: 35, speech_pct: 95.2, pauses_ge1s_per_min: 0.04, bed_rel_db: -24.2, lufs: -17, lra: 2.2 },
  finland: { asl_s: 41, median_shot_s: 37, cuts_per_min: 2.2, short_time_pct: 0.4, cut_pct: 8, dissolve_short_pct: 6, slow_pct: 70, fade_black_pct: 16, explainer_pct: null, speech_pct: 73, pauses_ge1s_per_min: 4.9, bed_rel_db: -23, lufs: -15, lra: 6.7 },
};

// Target bands for the house style (00_REFERENCE_ANALYSIS.md "Yang kita ambil"). Style can override.
export function targets(style) {
  const c = style.calibration || {};
  return {
    asl_s: style.pacing.asl_target,
    median_footage_s: c.median_footage_s || [4, 6],
    short_time_pct: [0, style.pacing.short_shot_time_share_max * 100],
    cut_pct: c.cut_pct || [20, 45],
    dissolve_short_pct: c.dissolve_short_pct || [40, 70],
    explainer_pct: style.visual_mix.explainer.map((x) => x * 100),
    speech_pct: style.narration.speech_share.map((x) => x * 100),
    pauses_ge1s_per_min: style.narration.pause_per_min,
    breathing_per_4min: c.breathing_per_4min || [1, 3],
    vo_run_p90_s: [0, c.vo_run_p90_max_s || 45],
    bed_rel_db: c.bed_rel_db || [-26, -20],
    lufs: [style.audio.lufs - 1, style.audio.lufs + 1],
    lra: style.audio.lra,
    true_peak: [-99, style.audio.true_peak + 0.3],
    black_beats: [style.black_beats.min, style.black_beats.max],
  };
}

// 100 ms RMS levels (dBFS) of a file's audio, mono 16 kHz.
function rmsLevels(file) {
  return new Promise((resolve, reject) => {
    const p = spawn('ffmpeg', ['-v', 'error', '-i', file, '-vn', '-ac', '1', '-ar', '16000', '-f', 'f32le', '-']);
    const chunks = [];
    p.stdout.on('data', (d) => chunks.push(d));
    p.on('error', reject);
    p.on('close', (code) => {
      if (code !== 0) return reject(new Error(`ffmpeg exited ${code}`));
      const buf = Buffer.concat(chunks);
      const y = new Float32Array(buf.buffer, buf.byteOffset, Math.floor(buf.length / 4));
      const hop = 1600;
      const out = new Float64Array(Math.floor(y.length / hop));
      for (let i = 0; i < out.length; i++) {
        let s = 0;
        for (let k = i * hop; k < (i + 1) * hop; k++) s += y[k] * y[k];
        out[i] = 20 * Math.log10(Math.sqrt(s / hop + 1e-12) + 1e-9);
      }
      resolve(out);
    });
  });
}

const median = (a) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : NaN; };
const pct = (a, p) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))] : NaN; };

// Speech segments on the final timeline from the VO word timings (words closer than 250 ms merge).
export function speechSegments(shotList, voTiming) {
  const byId = new Map(voTiming.segments.map((s) => [s.seg_id, s]));
  const words = [];
  for (const p of shotList.vo_placements) {
    for (const w of byId.get(p.seg_id)?.words || []) words.push([p.start_s + w.s, p.start_s + w.e]);
  }
  words.sort((a, b) => a[0] - b[0]);
  const segs = [];
  for (const [s, e] of words) {
    if (segs.length && s - segs.at(-1)[1] < 0.25) segs.at(-1)[1] = Math.max(segs.at(-1)[1], e);
    else segs.push([s, e]);
  }
  return segs;
}

export async function measureRender({ render, shotList, voTiming, audioPlan, style }) {
  const dur = shotList.duration_s;
  const shots = shotList.shots.filter((s) => s.shot_class !== 'black');
  const durs = shots.map((s) => s.duration_s);
  const timeIn = (pred) => (100 * shots.filter(pred).reduce((n, s) => n + s.duration_s, 0)) / dur;
  const trans = shotList.shots.slice(1).map((s) => s.transition_in);
  const share = (kinds) => (100 * trans.filter((t) => kinds.includes(t)).length) / Math.max(1, trans.length);
  const footage = shots.filter((s) => ['REAL', 'ARCHIVAL', 'FLOW'].includes(s.visual_type)).map((s) => s.duration_s);

  const segs = speechSegments(shotList, voTiming);
  const gaps = [[0, segs[0]?.[0] ?? dur], ...segs.slice(1).map((s, i) => [segs[i][1], s[0]]), [segs.at(-1)?.[1] ?? 0, dur]].filter(([a, b]) => b > a);
  const db = await rmsLevels(render);
  const lvl = (s, e) => median(Array.from(db.slice(Math.floor(s * 10), Math.floor(e * 10))));
  const voiceLvl = median(segs.map(([s, e]) => lvl(s, e)).filter(Number.isFinite));
  // Bed level is measured where music plays (the references run music almost wall to wall; our
  // style leaves deliberate music-free stretches, which would otherwise drag the median down).
  const inMusic = (t) => !audioPlan || audioPlan.music.some((m) => t >= m.start_s + 2 && t <= m.end_s - 2);
  const bed = gaps.filter(([a, b]) => b - a >= 0.3 && b - a <= 1.5 && inMusic((a + b) / 2)).map(([a, b]) => lvl(a + 0.08, b - 0.08)).filter(Number.isFinite);
  const runs = [];
  for (const [s, e] of segs) {
    if (runs.length && s - runs.at(-1)[1] < 1) runs.at(-1)[1] = e;
    else runs.push([s, e]);
  }
  const loud = await measureLoudness(render);

  return {
    duration_min: round(dur / 60, 2),
    shots: shots.length,
    asl_s: round(durs.reduce((a, b) => a + b, 0) / Math.max(1, durs.length), 2),
    median_shot_s: round(median(durs), 2),
    median_footage_s: round(median(footage), 2),
    shot_p90_s: round(pct(durs, 90), 2),
    short_time_pct: round(timeIn((s) => s.duration_s < 3), 1),
    cuts_per_min: round(trans.length / (dur / 60), 2),
    cut_pct: round(share(['cut', 'match_cut']), 1),
    dissolve_short_pct: round(share(['dissolve_short']), 1),
    slow_pct: round(share(['dissolve', 'dissolve_slow']), 1),
    fade_black_pct: round(share(['fade_black']), 1),
    explainer_pct: round(timeIn((s) => ['MAP', 'TECH', 'DATA'].includes(s.visual_type)), 1),
    black_beats: shotList.shots.filter((s) => s.shot_class === 'black').length,
    speech_pct: round((100 * segs.reduce((n, [s, e]) => n + (e - s), 0)) / dur, 1),
    pauses_ge1s_per_min: round(gaps.filter(([a, b]) => b - a >= 1).length / (dur / 60), 2),
    breathing_per_4min: round(gaps.filter(([a, b]) => b - a >= 3).length / (dur / 240), 2),
    vo_run_p90_s: round(pct(runs.map(([s, e]) => e - s), 90), 1),
    voice_level_db: round(voiceLvl, 1),
    bed_rel_db: round(median(bed) - voiceLvl, 1),
    lufs: loud.lufs,
    lra: loud.lra,
    true_peak: loud.true_peak,
  };
}

// Rows: metric, ours, target band, references, status.
export function compare(measured, style) {
  const t = targets(style);
  return Object.entries(t).map(([k, [lo, hi]]) => {
    const v = measured[k];
    const status = !Number.isFinite(v) ? 'n/a' : v < lo ? 'low' : v > hi ? 'high' : 'ok';
    return { metric: k, value: v, target: [lo, hi], saudi: REFERENCES.saudi[k] ?? null, finland: REFERENCES.finland[k] ?? null, status };
  });
}

export function formatTable(rows) {
  const f = (x) => (x === null || x === undefined || Number.isNaN(x) ? '-' : String(x));
  const lines = rows.map((r) => `${r.status === 'ok' ? 'ok  ' : r.status.toUpperCase().padEnd(4)} ${r.metric.padEnd(20)} ${f(r.value).padStart(7)}   target ${`${r.target[0]}..${r.target[1]}`.padEnd(12)} saudi ${f(r.saudi).padStart(6)}  finland ${f(r.finland).padStart(6)}`);
  return lines.join('\n');
}

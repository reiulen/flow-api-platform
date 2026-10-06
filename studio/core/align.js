// Word timings for voices whose engine returns none (9router/Gemini TTS, human recordings).
//   1. Speech-to-text with word timestamps through 9router (/v1/audio/transcriptions), when
//      STUDIO_ALIGN_MODEL is set; transcript words are matched back to the script words.
//   2. Otherwise pause-anchored alignment: silences measured in the audio are matched to the
//      places the script expects a pause (explicit pauses, sentence ends, commas), and words are
//      spread inside each speech stretch by syllable weight. Cuts land on real pauses.
import fs from 'node:fs';
import { round, run } from './util.js';

const norm = (w) => w.toLowerCase().replace(/[^a-z0-9]/g, '');

// Rough spoken length of a written word (syllables; digits are read out as several syllables).
export function wordWeight(w) {
  const digits = (w.match(/\d/g) || []).length;
  const letters = w.toLowerCase().replace(/[^a-z]/g, '');
  const syllables = letters ? Math.max(1, (letters.replace(/e\b/, '').match(/[aeiouy]+/g) || []).length) : 0;
  return syllables + digits * 1.6 + 0.35;
}

// Silences (start, end) in a wav, measured with ffmpeg.
export async function detectSilences(wav, { noiseDb = -38, minS = 0.18 } = {}) {
  const { stderr } = await run('ffmpeg', ['-nostats', '-v', 'info', '-i', wav, '-af', `silencedetect=noise=${noiseDb}dB:d=${minS}`, '-f', 'null', '-']);
  const out = [];
  let start = null;
  for (const line of stderr.split('\n')) {
    const s = line.match(/silence_start: ([\d.]+)/);
    const e = line.match(/silence_end: ([\d.]+)/);
    if (s) start = Number(s[1]);
    if (e && start !== null) { out.push({ s: start, e: Number(e[1]) }); start = null; }
  }
  return out;
}

// Script words with the strength of the pause expected after each one.
function scriptWords(pieces, lengths = false) {
  const words = [];
  for (const p of pieces) {
    if (p.pause) { if (words.length) { words.at(-1).after = Math.max(words.at(-1).after, 3); if (lengths) words.at(-1).pause = Math.max(words.at(-1).pause || 0, p.pause); } continue; }
    for (const w of p.text.trim().split(/\s+/).filter(Boolean)) {
      words.push({ w, weight: wordWeight(w), after: /[.!?]["')\]]?$/.test(w) ? 2 : /[,;:—-]$/.test(w) ? 1 : 0 });
    }
  }
  return words;
}

// lengths: the engine renders explicit pauses at their written length (break tags), so silence
// length is evidence too. Engines that read "..." give every pause about the same length.
export function pauseAnchoredAlign(pieces, silences, duration, { lengths = false } = {}) {
  const words = scriptWords(pieces, lengths);
  words.lengths = lengths;
  if (!words.length) return [];
  // Speech region: from the first sound to the last.
  const lead = silences[0] && silences[0].s <= 0.05 ? silences[0].e : 0;
  const tail = silences.at(-1) && silences.at(-1).e >= duration - 0.05 ? silences.at(-1).s : duration;
  const inner = silences.filter((x) => x.s > lead + 0.05 && x.e < tail - 0.05);
  const out = [];
  alignStretch(words, 0, words.length, lead, tail, inner, 0, out);
  return out;
}

// Aligns words[from..to) inside [t0, t1]. Long pauses are matched first; shorter ones (breaths)
// are matched inside each resulting stretch, where the prediction is local and more accurate.
function alignStretch(words, from, to, t0, t1, sils, level, out) {
  const group = words.slice(from, to);
  const anchorsAllowed = level === 0 ? sils.filter((x) => x.e - x.s >= 0.3) : sils;
  const chosen = anchorsAllowed.length ? anchorsAllowed : (level === 0 ? sils : []);
  if (!chosen.length || group.length < 2) return spread(group, t0, t1, sils, out);

  // Positions in "speech time" (silences removed) within this stretch.
  const speechTotal = Math.max(0.05, t1 - t0 - sils.reduce((n, x) => n + (x.e - x.s), 0));
  const speechAt = (t) => t - t0 - sils.filter((x) => x.e <= t).reduce((n, x) => n + (x.e - x.s), 0);
  const totalWeight = group.reduce((n, w) => n + w.weight, 0);
  let acc = 0;
  const bounds = group.slice(0, -1).map((w, k) => { acc += w.weight; return { i: from + k, at: (acc / totalWeight) * speechTotal, strength: w.after, pause: w.pause || 0, lengths: Boolean(words.lengths) }; });
  const cand = chosen.map((x) => ({ ...x, at: speechAt(x.s) }));
  const anchors = matchSilences(cand, bounds, level === 0 ? 1.2 : 3);
  if (!anchors.length) return spread(group, t0, t1, sils, out);

  let wordStart = from;
  let start = t0;
  for (const a of [...anchors, { i: to - 1, sil: { s: t1, e: t1 } }]) {
    const inside = sils.filter((x) => x.s > start + 0.02 && x.e < a.sil.s - 0.02);
    if (level === 0) alignStretch(words, wordStart, a.i + 1, start, a.sil.s, inside, 1, out);
    else spread(words.slice(wordStart, a.i + 1), start, a.sil.s, inside, out);
    wordStart = a.i + 1;
    start = a.sil.e;
  }
}

// Monotone DP matching silences to word boundaries. Skipping a silence costs `skip`; a boundary
// with no expected pause costs more than a comma, a sentence end or an explicit pause.
function matchSilences(sils, bounds, skip) {
  const S = sils.length;
  const B = bounds.length;
  // Position, the kind of boundary, and length: an explicit pause of p seconds comes out as roughly
  // p + 0.5 s of silence (back-to-back pauses: the longest one, measured on Inworld), so a long
  // silence belongs to an explicit pause rather than a comma.
  const lengthCost = (sil, b) => {
    const d = sil.e - sil.s;
    if (!b.lengths) return 0;
    return b.pause ? 2.0 * Math.max(0, Math.abs(d - (b.pause + 0.5)) - 0.35) : 2.0 * Math.max(0, d - 0.9);
  };
  const cost = (si, bi) => Math.abs(sils[si].at - bounds[bi].at) + [0.5, 0.25, 0, -0.3][bounds[bi].strength] + lengthCost(sils[si], bounds[bi]);
  const dp = Array.from({ length: S + 1 }, () => new Float64Array(B + 1).fill(Infinity));
  const from = Array.from({ length: S + 1 }, () => new Int32Array(B + 1).fill(-1));
  for (let b = 0; b <= B; b++) dp[0][b] = 0;
  for (let s = 1; s <= S; s++) {
    let best = Infinity;
    let bestB = -1;
    for (let b = 0; b <= B; b++) {
      if (dp[s - 1][b] + skip < dp[s][b]) { dp[s][b] = dp[s - 1][b] + skip; from[s][b] = -2; }
      if (b > 0) {
        if (dp[s - 1][b - 1] < best) { best = dp[s - 1][b - 1]; bestB = b - 1; }
        const c = best + cost(s - 1, b - 1);
        if (c < dp[s][b]) { dp[s][b] = c; from[s][b] = bestB; }
      }
    }
  }
  let b = 0;
  for (let k = 1; k <= B; k++) if (dp[S][k] < dp[S][b]) b = k;
  const anchors = [];
  for (let s = S; s > 0; s--) {
    const f = from[s][b];
    if (f === -2) continue;
    anchors.push({ i: bounds[b - 1].i, sil: sils[s - 1] });
    b = f;
  }
  return anchors.reverse();
}

// Spreads words over [t0, t1] by weight, skipping the given silences.
function spread(group, t0, t1, gaps, out) {
  const talk = Math.max(0.05, t1 - t0 - gaps.reduce((n, x) => n + (x.e - x.s), 0));
  const gw = group.reduce((n, w) => n + w.weight, 0) || 1;
  const toReal = (p) => {
    let t = t0 + p;
    for (const g of gaps) if (t > g.s) t += g.e - g.s;
    return Math.min(t, t1);
  };
  let pos = 0;
  for (const w of group) {
    const d = (w.weight / gw) * talk;
    out.push({ w: w.w, s: round(toReal(pos)), e: round(toReal(pos + d)) });
    pos += d;
  }
}

// Matches transcript words (with times) to script words; unmatched script words are interpolated.
export function mapTranscript(pieces, transcript) {
  const words = scriptWords(pieces).map((x) => x.w);
  const a = words.map(norm);
  const b = transcript.map((x) => norm(x.word));
  // LCS on normalized tokens.
  const n = a.length;
  const m = b.length;
  const L = Array.from({ length: n + 1 }, () => new Int32Array(m + 1));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) L[i][j] = a[i] && a[i] === b[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
  const times = new Array(n).fill(null);
  for (let i = 0, j = 0; i < n && j < m;) {
    if (a[i] && a[i] === b[j]) { times[i] = { s: transcript[j].start, e: transcript[j].end }; i++; j++; }
    else if (L[i + 1][j] >= L[i][j + 1]) i++;
    else j++;
  }
  const matched = times.filter(Boolean).length;
  // Interpolate gaps between matched neighbours by weight.
  for (let i = 0; i < n; i++) {
    if (times[i]) continue;
    let k = i;
    while (k < n && !times[k]) k++;
    const t0 = i > 0 ? times[i - 1].e : (times[k]?.s ?? 0);
    const t1 = k < n ? times[k].s : (times[i - 1]?.e ?? t0);
    const span = words.slice(i, k);
    const total = span.reduce((s, w) => s + wordWeight(w), 0) || 1;
    let t = t0;
    for (let x = i; x < k; x++) {
      const d = ((wordWeight(words[x]) / total) * Math.max(0, t1 - t0));
      times[x] = { s: t, e: t + d };
      t += d;
    }
    i = k - 1;
  }
  return { words: words.map((w, i) => ({ w, s: round(times[i].s), e: round(times[i].e) })), matchRate: n ? matched / n : 0 };
}

// 9router speech-to-text (OpenAI format) with word timestamps.
export async function transcribeWords(config, wav) {
  const { url, key, model } = config.voice.align;
  const form = new FormData();
  form.append('file', new Blob([fs.readFileSync(wav)], { type: 'audio/wav' }), 'vo.wav');
  form.append('model', model);
  form.append('response_format', 'verbose_json');
  form.append('timestamp_granularities[]', 'word');
  const res = await fetch(`${url.replace(/\/$/, '')}/v1/audio/transcriptions`, { method: 'POST', headers: { authorization: `Bearer ${key}` }, body: form, signal: AbortSignal.timeout(120000) });
  if (!res.ok) throw new Error(`align: transcription ${res.status} ${(await res.text()).slice(0, 200)}`);
  const body = await res.json();
  const words = body.words || (body.segments || []).flatMap((s) => s.words || []);
  if (!words.length) throw new Error('align: transcription returned no word timestamps');
  return words.map((x) => ({ word: x.word, start: Number(x.start), end: Number(x.end) }));
}

// Best available word timings for one voiced segment. Returns { words, method }.
export async function alignSegment({ config, wav, pieces, duration, lengths = false }) {
  if (config.voice.align?.model) {
    try {
      const { words, matchRate } = mapTranscript(pieces, await transcribeWords(config, wav));
      if (matchRate >= 0.7) return { words, method: 'transcript' };
    } catch (err) {
      if (config.voice.align.required) throw err;
    }
  }
  return { words: pauseAnchoredAlign(pieces, await detectSilences(wav), duration, { lengths }), method: 'pauses' };
}

// Generative score. One piece per video, written from the kit seed (key, tempo, theme, timbre) and
// shaped by an emotional arc per act: a quiet clock, a repeating motif, mechanical tension, collapse
// into near silence, a turn into the major, a last warm chord. The arc is data, not code.
import {
  TAU, mulberry, mono, stereo, lowpass, highpass, bandpass, applyEnv, expDecay, addInto, reverb, softClip, midiToHz, writeWav, whiteNoise,
} from './dsp.js';

const SR = 24000;

// One entry per story beat of the film. d0/d1 = density at the start/end of the act, tension and
// bright run 0..1. `pulse` is the rhythmic bed, `motif` the theme: full, broken (stops mid phrase) or none.
export const DEFAULT_ARC = [
  { mode: 'aeolian', d0: 0.2, d1: 0.34, tension: 0.3, bright: 0.2, pulse: 'clock', motif: 'none', arp: false, level: 0.55, rollOut: true },
  { mode: 'aeolian', d0: 0.4, d1: 0.58, tension: 0.4, bright: 0.32, pulse: 'clock', motif: 'full', arp: true, level: 0.66 },
  { mode: 'dorian', d0: 0.52, d1: 0.7, tension: 0.55, bright: 0.38, pulse: 'clock', motif: 'full', arp: true, level: 0.76 },
  { mode: 'phrygian', d0: 0.74, d1: 0.06, tension: 0.95, bright: 0.18, pulse: 'heart', motif: 'broken', arp: false, level: 0.72, rollOut: true },
  { mode: 'dorian', d0: 0.55, d1: 0.9, tension: 0.45, bright: 0.58, pulse: 'drive', motif: 'full', arp: true, level: 0.88, climax: true, impact: true },
  // the happy ending is the loudest, brightest part of the film: a major key, full density, the theme on top
  { mode: 'ionian', d0: 0.6, d1: 0.96, tension: 0.05, bright: 0.86, pulse: 'drive', motif: 'full', arp: true, level: 0.98, key: 3, climax: true, impact: true },
];
const SCALES = { aeolian: [0, 2, 3, 5, 7, 8, 10], dorian: [0, 2, 3, 5, 7, 9, 10], phrygian: [0, 1, 3, 5, 7, 8, 10], lydian: [0, 2, 4, 6, 7, 9, 11], ionian: [0, 2, 4, 5, 7, 9, 11] };
const PROG = { aeolian: [0, 5, 2, 6], dorian: [0, 3, 0, 6], phrygian: [0, 1, 0, 6], lydian: [0, 1, 4, 0], ionian: [0, 4, 5, 3] }; // i VI III VII under the loops, i bII i VII at the wall, a major turn to close

function table(rand, weights) {
  const N = 2048; const t = new Float32Array(N);
  const ph = weights.map(() => rand() * 0.3);
  for (let i = 0; i < N; i++) { let v = 0; weights.forEach((w, k) => { v += w * Math.sin(TAU * (k + 1) * (i / N) + ph[k]); }); t[i] = v; }
  let m = 0; for (const v of t) m = Math.max(m, Math.abs(v)); for (let i = 0; i < N; i++) t[i] /= m;
  return t;
}
function tableNote(dst, tab, f, startS, lenS, { attack = 1, release = 2, gain = 0.2, detune = 0 } = {}) {
  const N = tab.length; const s0 = Math.round(startS * SR); const n = Math.round(lenS * SR);
  const inc = (f * 2 ** (detune / 1200) * N) / SR; let ph = 0;
  for (let i = 0; i < n; i++) {
    const idx = s0 + i; if (idx < 0 || idx >= dst.length) { ph += inc; continue; }
    const t = i / SR; const a = Math.min(1, t / attack); const r = Math.min(1, (lenS - t) / release);
    const p = ph % N; const k = Math.floor(p); const fr = p - k;
    dst[idx] += (tab[k] * (1 - fr) + tab[(k + 1) % N] * fr) * gain * a * Math.max(0, r);
    ph += inc;
  }
}
// Karplus-Strong string: warm, plucked, seeded noise burst.
function pluck(dst, rand, f, startS, { gain = 0.3, decay = 0.996, bright = 0.5 } = {}) {
  const L = Math.max(2, Math.round(SR / f)); const line = new Float32Array(L);
  for (let i = 0; i < L; i++) line[i] = (rand() * 2 - 1) * (0.4 + 0.6 * bright);
  const s0 = Math.round(startS * SR); const n = Math.round(2.4 * SR); let idx = 0; let prev = 0;
  for (let i = 0; i < n; i++) {
    const o = line[idx]; const nv = (o + prev) * 0.5 * decay; line[idx] = nv; prev = o; idx = (idx + 1) % L;
    const j = s0 + i; if (j >= 0 && j < dst.length) dst[j] += o * gain * Math.min(1, i / 30);
  }
}
const lerp = (a, b, t) => a + (b - a) * t;

export function composeScore({ seed, duration, acts, file, arc = DEFAULT_ARC, montages = [], bedless = false, under = null }) {
  const rand = mulberry((seed ^ 0x9e3779b9) >>> 0);
  const bpm = 52 + (seed % 6) * 4;                 // 52 .. 72
  const beat = 60 / bpm; const bar = beat * 4;
  const rootMidi = 40 + (seed % 12);               // E2 .. D#3: minor, centred near A like the film it learned from
  const padTab = table(rand, [1, 0.5 + rand() * 0.2, 0.22 + rand() * 0.15, 0.1 + rand() * 0.1, 0.06, 0.03]);
  const droneTab = table(rand, [1, 0.35, 0.12]);
  const total = Math.max(8, duration);

  // act timeline with an arc entry each
  const spans = (acts && acts.length ? acts : [{ act: 1, s: 0, e: total }]).map((a, i, all) => {
    const p = all.length === 1 ? 0 : i / (all.length - 1);
    const A = arc[Math.min(arc.length - 1, Math.round(p * (arc.length - 1)))];
    return { ...A, s: a.s, e: i === all.length - 1 ? total : a.e };
  });
  const at = (t) => spans.find((s) => t >= s.s && t < s.e) || spans.at(-1);
  const dens = (t) => { const a = at(t); const k = Math.min(1, Math.max(0, (t - a.s) / Math.max(1, a.e - a.s))); return lerp(a.d0, a.d1, k * k * (3 - 2 * k)); };
  const brightAt = (t) => at(t).bright;

  // the theme of this film: five notes of the first act's scale, fixed for the whole piece
  const motifDeg = [0, 2, 4, 1, 2].map((d) => (d + Math.floor(rand() * 3)) % 7);
  const motifBeats = [1, 1, 2, 1.5, 2.5];
  const timbre = 0.35 + rand() * 0.5;

  const pad = [mono(SR, total + 6), mono(SR, total + 6)];
  const drone = mono(SR, total + 6); const bass = mono(SR, total + 6); const strings = mono(SR, total + 6); const rhythm = mono(SR, total + 6);

  for (const a of (bedless ? [] : spans)) {
    const scale = SCALES[a.mode]; const prog = PROG[a.mode];
    const keyShift = a.key || 0;
    const midi = (deg, oct = 0) => rootMidi + keyShift + scale[((deg % 7) + 7) % 7] + 12 * (Math.floor(deg / 7) + oct);
    const chord = (deg) => [midi(deg), midi(deg + 2), midi(deg + 4), ...(a.bright > 0.55 ? [midi(deg + 6)] : [])];
    // drone under the whole act
    tableNote(drone, droneTab, midiToHz(rootMidi - 12), a.s - 1, a.e - a.s + 3, { attack: 3, release: 3, gain: 0.09 + 0.07 * a.tension });
    tableNote(drone, droneTab, midiToHz(rootMidi - 5), a.s - 1, a.e - a.s + 3, { attack: 4, release: 3, gain: 0.04 + 0.05 * a.tension, detune: 6 });
    if (a.tension > 0.8) tableNote(drone, droneTab, midiToHz(rootMidi - 11), a.s, a.e - a.s, { attack: 5, release: 2, gain: 0.07 }); // a clashing semitone under the wall
    let bi = 0;
    for (let t = a.s; t < a.e - 0.5; t += bar, bi++) {
      const d = dens(t);
      const deg = prog[bi % 4];
      chord(deg).forEach((m, k) => [-1, 1].forEach((side, si) => tableNote(pad[si], padTab, midiToHz(m + 12), t, bar + 2.6, { attack: 1.3, release: 2.4, gain: (0.035 + 0.08 * d) / (1 + k * 0.15), detune: side * 5 })));
      tableNote(bass, droneTab, midiToHz(midi(deg, -1)), t, bar * 0.95, { attack: 0.05, release: bar * 0.8, gain: 0.05 + 0.1 * d });
      // plucked arpeggio
      if (a.arp && d > 0.3) {
        const notes = chord(deg).map((m) => m + 12);
        for (let k = 0; k < 8; k++) if (rand() < 0.4 + d * 0.5) pluck(strings, rand, midiToHz(notes[(k * 2 + (k >> 2)) % notes.length] + (k % 3 === 2 ? 12 : 0)), t + k * (beat / 2), { gain: 0.09 + 0.14 * d, bright: 0.6 + a.bright * 0.35 });
      }
      // the theme, every second bar; in the wall it breaks off after three notes
      if (a.motif !== 'none' && bi % 2 === 1 && d > 0.12) {
        let pos = beat * 0.5;
        motifDeg.forEach((md, k) => {
          if (a.motif === 'broken' && k > 2) return;
          pluck(strings, rand, midiToHz(midi(md, 1)), t + pos, { gain: 0.2 + 0.18 * d, decay: 0.9968, bright: 0.75 });
          pos += motifBeats[k] * beat * 0.5;
        });
      }
    }
    // rhythmic bed
    if (a.pulse !== 'none' && a.pulse !== 'drive') {
      for (let t = a.s; t < a.e - 0.2; t += beat) {
        const d = dens(t); const g = 0.4 + 0.6 * d;
        if (a.pulse === 'clock') { const c = highpass(applyEnv(whiteNoise(mono(SR, 0.03), rand), expDecay(0.004), SR), SR, 2500); addInto(rhythm, c, Math.round(t * SR), 0.1 * g); }
        if (a.pulse === 'heart') {
          const lub = mono(SR, 0.4); for (let i = 0; i < lub.length; i++) { const tt = i / SR; lub[i] = Math.sin(TAU * 52 * tt) * Math.exp(-tt / 0.1) + Math.sin(TAU * 49 * Math.max(0, tt - 0.23)) * Math.exp(-Math.max(0, tt - 0.23) / 0.09) * (tt > 0.23 ? 0.75 : 0); }
          addInto(rhythm, lub, Math.round(t * SR), 0.5 * g * (0.5 + a.tension));
        }
        if (a.pulse === 'mechanical' || a.pulse === 'soft') {
          const k = mono(SR, 0.3); for (let i = 0; i < k.length; i++) { const tt = i / SR; k[i] = Math.sin(TAU * (60 + 70 * Math.exp(-tt / 0.03)) * tt) * Math.exp(-tt / 0.09); }
          addInto(rhythm, k, Math.round(t * SR), (a.pulse === 'soft' ? 0.18 : 0.3) * g);
          if (a.pulse === 'mechanical') { const h = highpass(applyEnv(whiteNoise(mono(SR, 0.04), rand), expDecay(0.006), SR), SR, 4500); addInto(rhythm, h, Math.round((t + beat / 2) * SR), 0.05 * g); }
        }
      }
    }
  }

  // montage rhythm: a kick on every cut, hats between, 16ths in the climax. The picture is cut on these hits.
  const kickTimes = [];
  const kickAt = (t, g) => { kickTimes.push([t, g]); const k = mono(SR, 0.32); for (let i = 0; i < k.length; i++) { const tt = i / SR; k[i] = Math.sin(TAU * (52 + 90 * Math.exp(-tt / 0.025)) * tt) * Math.exp(-tt / 0.11); } addInto(rhythm, k, Math.round(t * SR), g); };
  const hatAt = (t, g) => { const h = highpass(applyEnv(whiteNoise(mono(SR, 0.05), rand), expDecay(0.01), SR), SR, 4200); addInto(rhythm, h, Math.round(t * SR), g); };
  const clapAt = (t, g) => { const c = bandpass(applyEnv(whiteNoise(mono(SR, 0.14), rand), expDecay(0.035), SR), SR, 1500, 1.1); addInto(rhythm, c, Math.round(t * SR), g); };
  for (const m of montages) {
    const a = at(m.s + 0.01); const climax = Boolean(a.climax);
    for (let t = m.s, i = 0; t < m.e - 0.05; t += m.cut, i++) {
      const g = 0.5 + 0.5 * dens(t);
      kickAt(t, (climax ? 0.36 : 0.26) * g);
      hatAt(t + m.cut / 2, 0.06 * g);
      if (climax) { hatAt(t + m.cut / 4, 0.04 * g); hatAt(t + (3 * m.cut) / 4, 0.04 * g); clapAt(t + m.cut / 2, 0.16 * g); kickAt(t + m.cut / 2, 0.14 * g); } else if (i % 2) clapAt(t + m.cut / 2, 0.07 * g);
    }
  }
  // accelerating tick roll into the drop, the way the film leaves a loop behind
  spans.forEach((a, i) => {
    if (!a.rollOut) return;
    const end = a.e; const len = Math.min(2.4, (a.e - a.s) * 0.5);
    for (let tk = 0, n = 0; tk < len; n++) { const iv = Math.max(0.035, 0.42 * Math.exp((-3.2 * tk) / len)); hatAt(end - len + tk, 0.12 + 0.2 * (tk / len)); tk += iv; }
    kickAt(end, 0.5);
  });

  // risers into the big acts and a sub impact on their first beat: the lift the picture is cut for
  spans.forEach((a) => {
    if (!a.impact || a.s < 3) return;
    const len = 2.6; const rb = whiteNoise(mono(SR, len), rand);
    bandpass(rb, SR, (t) => 280 + 5400 * Math.pow(t / len, 2), 1.3);
    applyEnv(rb, (t) => Math.pow(t / len, 2.2) * 0.55, SR);
    addInto(rhythm, rb, Math.round((a.s - len) * SR), 1);
    const bm = mono(SR, 2.4); for (let i = 0; i < bm.length; i++) { const tt = i / SR; bm[i] = Math.sin(TAU * (46 + 70 * Math.exp(-tt / 0.1)) * tt) * Math.exp(-tt / 0.75) * 0.9; }
    addInto(rhythm, bm, Math.round(a.s * SR), 1);
    const cr = highpass(applyEnv(whiteNoise(mono(SR, 0.5), rand), expDecay(0.12), SR), SR, 3500); addInto(rhythm, cr, Math.round(a.s * SR), 0.22);
  });

  // shape: the pad opens and closes with the film's brightness
  for (const side of pad) lowpass(side, SR, (t) => 650 + 4200 * brightAt(t));
  lowpass(drone, SR, 240); lowpass(bass, SR, 420); lowpass(strings, SR, (t) => 2600 + 5200 * brightAt(t));
  const duck = new Float32Array(total * SR + 6 * SR | 0).fill(1);
  for (const [tk, g] of kickTimes) { const j0 = Math.round(tk * SR); const depth = Math.min(0.7, 0.35 + g); for (let j = j0; j < Math.min(duck.length, j0 + Math.round(0.4 * SR)); j++) duck[j] = Math.min(duck[j], 1 - depth * Math.exp(-((j - j0) / SR) / 0.11)); }
  for (let i = 0; i < duck.length; i++) { pad[0][i] *= duck[i]; pad[1][i] *= duck[i]; drone[i] *= duck[i]; strings[i] *= 0.5 + 0.5 * duck[i]; }
  const st = stereo(SR, total + 6);
  for (let i = 0; i < st.l.length; i++) {
    st.l[i] = pad[0][i] + pad[1][i] * 0.4 + drone[i] + bass[i] + strings[i] * 1.25 + rhythm[i];
    st.r[i] = pad[0][i] * 0.4 + pad[1][i] + drone[i] + bass[i] + strings[i] * 1.4 + rhythm[i];
  }
  reverb(st, { size: 2.6, mix: 0.22, damp: 0.6 });
  // loudness of the film: quiet intro, a climax at the grind, a softer end
  for (const a of spans) { const lvl = a.level == null ? 0.7 : a.level; const f = Math.max(0, Math.round((a.s - 0.8) * SR)); const to = Math.min(st.l.length, Math.round((a.e + 0.8) * SR)); for (let j = f; j < to; j++) { const w = Math.min(1, (j - f) / (1.6 * SR), (to - j) / (1.6 * SR)); void w; } }
  const gain = new Float32Array(st.l.length);
  for (let j = 0; j < gain.length; j++) gain[j] = 0.7;
  for (const a of spans) { const lvl = a.level == null ? 0.7 : a.level; const f = Math.round(a.s * SR); const to = Math.min(gain.length, Math.round(a.e * SR)); for (let j = f; j < to; j++) gain[j] = lvl; }
  { let y = gain[0]; const c = 1 - Math.exp(-1 / (1.4 * SR)); for (let j = 0; j < gain.length; j++) { y += c * (gain[j] - y); st.l[j] *= y; st.r[j] *= y; } }
  lowpass(st.l, SR, 9000); lowpass(st.r, SR, 9000);
  // sink to silence under the lowest point of the wall, rise out of it at the turn
  for (let i = 0; i < spans.length; i++) {
    const a = spans[i]; if (a.d1 > 0.1) continue;
    const from = Math.round((a.e - 3.2) * SR); const to = Math.round(a.e * SR);
    for (let j = Math.max(0, from); j < Math.min(st.l.length, to); j++) { const g = 1 - 0.92 * ((j - from) / (to - from)); st.l[j] *= g; st.r[j] *= g; }
  }
  if (under) { const n = Math.min(st.l.length, under.l.length); for (let i = 0; i < n; i++) { st.l[i] += under.l[i]; st.r[i] += under.r[i]; } }
  const end = Math.round(total * SR);
  const outroLen = Math.round(6 * SR);
  const L = st.l.subarray(0, end); const R = st.r.subarray(0, end);
  for (let i = 0; i < outroLen && end - 1 - i >= 0; i++) { const g = i / outroLen; L[end - 1 - i] *= g; R[end - 1 - i] *= g; }
  softClip(L, 1.2); softClip(R, 1.2);
  writeWav(file, { sr: SR, l: L, r: R });
  return { file, bpm, rootMidi, duration: total };
}

export { bandpass as __bandpass };

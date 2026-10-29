// Small deterministic DSP toolkit for the synthetic score and sound effects.
// Mono buffers are Float32Array; stereo is a pair. Nothing here uses Math.random.
import fs from 'node:fs';
import path from 'node:path';
import { ensureDir } from './util.js';

export const TAU = Math.PI * 2;
export const dbToGain = (db) => 10 ** (db / 20);
export const midiToHz = (m) => 440 * 2 ** ((m - 69) / 12);

export function mulberry(seed) {
  let a = (seed >>> 0) || 1;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const mono = (sr, sec) => new Float32Array(Math.max(1, Math.ceil(sec * sr)));
export const stereo = (sr, sec) => ({ sr, l: mono(sr, sec), r: mono(sr, sec) });

export function whiteNoise(buf, rand) { for (let i = 0; i < buf.length; i++) buf[i] = rand() * 2 - 1; return buf; }

// One-pole filters, in place. fc may be a number or a function of the sample index (sweeps).
export function lowpass(buf, sr, fc) {
  let y = 0;
  for (let i = 0; i < buf.length; i++) {
    const f = typeof fc === 'function' ? fc(i / sr) : fc;
    const a = 1 - Math.exp((-TAU * Math.min(f, sr * 0.45)) / sr);
    y += a * (buf[i] - y);
    buf[i] = y;
  }
  return buf;
}
export function highpass(buf, sr, fc) {
  let y = 0;
  for (let i = 0; i < buf.length; i++) {
    const f = typeof fc === 'function' ? fc(i / sr) : fc;
    const a = 1 - Math.exp((-TAU * Math.min(f, sr * 0.45)) / sr);
    y += a * (buf[i] - y);
    buf[i] -= y;
  }
  return buf;
}
// Resonant band-pass (RBJ biquad), centre may sweep.
export function bandpass(buf, sr, f0, q = 2) {
  let x1 = 0; let x2 = 0; let y1 = 0; let y2 = 0;
  for (let i = 0; i < buf.length; i++) {
    const f = typeof f0 === 'function' ? f0(i / sr) : f0;
    const w = (TAU * Math.min(f, sr * 0.45)) / sr; const al = Math.sin(w) / (2 * q);
    const b0 = al; const b2 = -al; const a0 = 1 + al; const a1 = -2 * Math.cos(w); const a2 = 1 - al;
    const y = (b0 * buf[i] + b2 * x2 - a1 * y1 - a2 * y2) / a0;
    x2 = x1; x1 = buf[i]; y2 = y1; y1 = y; buf[i] = y;
  }
  return buf;
}

export function applyEnv(buf, fn, sr) { for (let i = 0; i < buf.length; i++) buf[i] *= fn(i / sr); return buf; }
export const expDecay = (tau) => (t) => Math.exp(-t / tau);
export function fade(buf, sr, inS, outS) {
  const n = buf.length;
  const ni = Math.min(n, Math.round(inS * sr)); const no = Math.min(n, Math.round(outS * sr));
  for (let i = 0; i < ni; i++) buf[i] *= i / ni;
  for (let i = 0; i < no; i++) buf[n - 1 - i] *= i / no;
  return buf;
}

// Adds src into dst at a sample offset with gain, clipping at the ends.
export function addInto(dst, src, offset, gain = 1) {
  const start = Math.max(0, offset);
  const end = Math.min(dst.length, offset + src.length);
  for (let i = start; i < end; i++) dst[i] += src[i - offset] * gain;
}
export function addStereo(dst, src, offset, gain, pan = 0) {
  // constant power pan, pan in -1..1
  const a = ((pan + 1) * Math.PI) / 4;
  addInto(dst.l, src, offset, gain * Math.cos(a) * Math.SQRT2);
  addInto(dst.r, src, offset, gain * Math.sin(a) * Math.SQRT2);
}

// Schroeder reverb on a stereo pair, in place. size in seconds of tail, mix 0..1.
export function reverb(st, { size = 2.4, mix = 0.3, damp = 0.4 } = {}) {
  const sr = st.sr;
  const combs = [0.0297, 0.0371, 0.0411, 0.0437].map((d) => Math.round(d * sr));
  const fb = Math.min(0.92, 10 ** ((-3 * 0.035) / size));
  const run = (inp, spread) => {
    const out = new Float32Array(inp.length);
    for (const c0 of combs) {
      const c = c0 + spread; const line = new Float32Array(c); let idx = 0; let lp = 0;
      for (let i = 0; i < inp.length; i++) {
        const y = line[idx];
        lp = y * (1 - damp) + lp * damp;
        line[idx] = inp[i] + lp * fb;
        idx = (idx + 1) % c;
        out[i] += y * 0.25;
      }
    }
    for (const d of [Math.round(0.005 * sr), Math.round(0.0017 * sr)]) {
      const line = new Float32Array(d + spread); let idx = 0;
      for (let i = 0; i < out.length; i++) { const z = line[idx]; const v = out[i] + z * 0.5; line[idx] = v; out[i] = z - v * 0.5; idx = (idx + 1) % line.length; }
    }
    return out;
  };
  const wl = run(st.l, 0); const wr = run(st.r, 23);
  for (let i = 0; i < st.l.length; i++) { st.l[i] = st.l[i] * (1 - mix * 0.5) + wl[i] * mix; st.r[i] = st.r[i] * (1 - mix * 0.5) + wr[i] * mix; }
}

export function softClip(buf, drive = 1) { for (let i = 0; i < buf.length; i++) buf[i] = Math.tanh(buf[i] * drive); }
export function peak(buf) { let p = 0; for (let i = 0; i < buf.length; i++) { const a = Math.abs(buf[i]); if (a > p) p = a; } return p; }
export function rms(buf) { let s = 0; for (let i = 0; i < buf.length; i++) s += buf[i] * buf[i]; return Math.sqrt(s / Math.max(1, buf.length)); }

// 16-bit stereo WAV, written in blocks so long files do not need a second copy in memory.
export function writeWav(file, st) {
  ensureDir(path.dirname(file));
  const n = st.l.length; const sr = st.sr;
  const fd = fs.openSync(file, 'w');
  const header = Buffer.alloc(44);
  header.write('RIFF', 0); header.writeUInt32LE(36 + n * 4, 4); header.write('WAVE', 8); header.write('fmt ', 12);
  header.writeUInt32LE(16, 16); header.writeUInt16LE(1, 20); header.writeUInt16LE(2, 22); header.writeUInt32LE(sr, 24);
  header.writeUInt32LE(sr * 4, 28); header.writeUInt16LE(4, 32); header.writeUInt16LE(16, 34); header.write('data', 36); header.writeUInt32LE(n * 4, 40);
  fs.writeSync(fd, header);
  const block = 1 << 16; const out = Buffer.alloc(block * 4);
  for (let s = 0; s < n; s += block) {
    const m = Math.min(block, n - s);
    for (let i = 0; i < m; i++) {
      out.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(st.l[s + i] * 32767))), i * 4);
      out.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(st.r[s + i] * 32767))), i * 4 + 2);
    }
    fs.writeSync(fd, out, 0, m * 4);
  }
  fs.closeSync(fd);
  return file;
}

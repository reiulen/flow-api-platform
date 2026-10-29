// Lays the act tracks of a story film end to end, cut on bar lines of their own beat, crossfaded, level-matched.
// Returns the stereo buffer at the score's sample rate; composeScore mixes the generated rhythm layer over it.
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { stereo, writeWav } from './dsp.js';

const SR = 24000;

function decode(file, start, len) {
  const r = spawnSync('ffmpeg', ['-v', 'error', '-ss', String(Math.max(0, start)), '-t', String(len), '-i', file, '-ac', '2', '-ar', String(SR), '-f', 'f32le', '-'], { maxBuffer: 1 << 30 });
  if (r.status !== 0 || !r.stdout?.length) return null;
  const b = r.stdout; return new Float32Array(b.buffer, b.byteOffset, Math.floor(b.length / 4));
}

export function renderMusicBed({ plan, grid, acts, total, libraryDir, file, levels = {}, dips = [], minStart = 2.5 }) {
  const out = stereo(SR, total + 6);
  const used = [];
  const sorted = [...acts].sort((a, b) => a.s - b.s);
  // acts that share a track play it as one unbroken stretch; the music only changes where the track does
  const segs = [];
  for (const a of sorted) {
    const prev = segs.at(-1);
    if (prev && plan[a.act] && plan[prev.act] && plan[a.act].id === plan[prev.act].id) prev.e = a.e;
    else segs.push({ ...a });
  }
  const XF = 2.6;
  segs.forEach((a, i) => {
    const tr = plan[a.act];
    if (!tr) return;
    const first = i === 0; const last = i === segs.length - 1;
    const segStart = first ? 0 : Math.max(0, a.s - XF);
    const segEnd = last ? total + 4 : Math.min(total, a.e + XF);
    const len = segEnd - segStart;
    const dur = tr.duration_s || 180;
    // start offset: on the track's beat grid so the act's anchor lands on a beat
    let tau = minStart;
    const g = grid[a.act];
    if (tr.bpm && g) {
      const P = 60 / tr.bpm;
      let t0 = (tr.beat0_s || 0) - (g.anchor - segStart);
      t0 += Math.ceil((minStart - t0) / P) * P;
      tau = t0;
      // run out of track: step back whole beats
      while (tau + len > dur - 0.5 && tau - P >= 0) tau -= P;
    } else if (tau + len > dur - 0.5) tau = Math.max(0, dur - 0.5 - len);
    const lenUse = Math.min(len, Math.max(1, dur - 0.2 - tau));
    const buf = decode(path.join(libraryDir, 'music', tr.file), tau, lenUse);
    if (!buf) return;
    const n = Math.floor(buf.length / 2);
    // level match: this act's slice to a common loudness, then the act's own weight
    let ss = 0; for (let k = 0; k < buf.length; k += 7) ss += buf[k] * buf[k];
    const rms = Math.sqrt(ss / Math.max(1, buf.length / 7)) || 1e-4;
    const norm = Math.min(4, Math.max(0.25, 0.1 / rms));
    const lvl = (levels[a.act] ?? 0.8) * norm;
    const fin = Math.round((first ? 1.5 : XF) * SR); const fout = Math.round((last ? 5 : XF) * SR);
    const o0 = Math.round(segStart * SR);
    for (let k = 0; k < n; k++) {
      let g2 = lvl;
      if (k < fin) g2 *= k / fin;
      if (n - k < fout) g2 *= (n - k) / fout;
      const idx = o0 + k; if (idx >= out.l.length) break;
      out.l[idx] += buf[2 * k] * g2; out.r[idx] += buf[2 * k + 1] * g2;
    }
    used.push({ act: a.act, id: tr.id, tau: Math.round(tau * 100) / 100, aligned: Boolean(tr.bpm && g) });
  });
  // sink toward silence under the lowest point (the end of the listed acts)
  for (const act of dips) {
    const a = sorted.find((x) => x.act === act); if (!a) continue;
    const from = Math.round((a.e - 3.4) * SR); const to = Math.round(a.e * SR);
    for (let j = Math.max(0, from); j < Math.min(out.l.length, to); j++) { const g2 = 1 - 0.9 * ((j - from) / (to - from)); out.l[j] *= g2; out.r[j] *= g2; }
  }
  if (file) writeWav(file, out);
  return { buffer: out, used };
}

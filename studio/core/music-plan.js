// Real music for story films. Each act gets one licensed track from the library; tracks whose pulse was measured
// (bpm and first beat in studio/library/music/index.json) also set the film's cut grid, so the picture is cut on
// the music's beats. Everything here is a pure function of the seed, the style and the shot list.
import fs from 'node:fs';
import path from 'node:path';
import { hash } from './util.js';

export function loadMusicIndex(config) {
  try { return JSON.parse(fs.readFileSync(path.join(config.libraryDir, 'music', 'index.json'), 'utf8')); } catch { return []; }
}

// The cut is two beats; a track too fast or too slow for that is cut on four or one.
export function cutOf(bpm) {
  if (!bpm) return 0;
  const P = 60 / bpm;
  for (const k of [2, 4, 1, 8]) if (k * P >= 0.95 && k * P <= 1.75) return k * P;
  return 2 * P;
}

// style.story.music: { "1": [ids], ... , "callback": [2, 6] } (the last act answers the second with the same track)
export function musicPlan(seed, style, index) {
  const cfg = style.story?.music;
  if (!cfg || !index?.length) return null;
  const byId = Object.fromEntries(index.map((t) => [t.id, t]));
  const plan = {};
  for (const [act, ids] of Object.entries(cfg)) {
    if (act === 'callback' || act === 'levels' || act === 'dips') continue;
    if (typeof ids === 'string' && ids.startsWith('=')) continue; // resolved below: this act keeps another act's track
    const pool = (Array.isArray(ids) ? ids : [ids]).map((id) => byId[id]).filter(Boolean);
    if (!pool.length) continue;
    plan[act] = pool[parseInt(hash(`music:${seed}:${act}`, 4), 16) % pool.length];
  }
  for (const [act, ids] of Object.entries(cfg)) { if (typeof ids === 'string' && ids.startsWith('=') && plan[ids.slice(1)]) plan[act] = plan[ids.slice(1)]; }
  if (Array.isArray(cfg.callback) && plan[cfg.callback[0]]) plan[cfg.callback[1]] = plan[cfg.callback[0]];
  return plan;
}

// Grid of every act: the film time at which a beat falls (anchor) and the beat length. The anchor is the start of the
// act's first montage, so every cut of that montage lands on a beat; without a montage it is the act's start.
export function beatGrid(plan, shots) {
  const grid = {};
  if (!plan) return grid;
  const acts = [...new Set(shots.map((s) => s.act))];
  for (const act of acts) {
    const tr = plan[act];
    if (!tr?.bpm) continue;
    const inAct = shots.filter((s) => s.act === act);
    const m = inAct.find((s) => s.motion?.data?.montage_cut);
    const anchor = m ? m.start_s : inAct[0].start_s;
    grid[act] = { anchor, period: 60 / tr.bpm, bpm: tr.bpm, id: tr.id };
  }
  return grid;
}

export function planKey(plan) { return plan ? Object.entries(plan).map(([a, t]) => `${a}:${t.id}`).join(',') : ''; }

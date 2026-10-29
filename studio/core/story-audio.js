// Sound for story films: a generated score and one synchronised effects bed per project.
import path from 'node:path';
import fs from 'node:fs';
import { buildKit } from './story.js';
import { composeScore, DEFAULT_ARC } from './score.js';
import { sfxEvents, bedSegments, renderSfxBed } from './sfx.js';
import { ensureDir, hash, round } from './util.js';
import { beatGrid, loadMusicIndex, musicPlan, planKey } from './music-plan.js';
import { renderMusicBed } from './music-bed.js';
import { writeWav } from './dsp.js';

// One call for the film's score: licensed tracks cut on their own beats when the style lists them, with the generated
// rhythm, risers and impacts over them; the fully generated score otherwise.
export function renderScore({ config, kit, seed, style, shots, total, actSpans, montages, file }) {
  const arc = style.story?.score?.arc || DEFAULT_ARC;
  const plan = musicPlan(seed, style, loadMusicIndex(config));
  const acts = actSpans.map((a) => ({ act: a.act, s: a.s, e: a.e }));
  if (!plan || !Object.keys(plan).length) { composeScore({ seed: kit.seed, duration: total, acts, file, arc, montages }); return { mode: 'generated' }; }
  const grid = beatGrid(plan, shots);
  const m = style.story.music || {};
  const bed = renderMusicBed({ plan, grid, acts, total, libraryDir: config.libraryDir, levels: m.levels || {}, dips: m.dips || [] });
  // The music is the licensed track alone: no kick on the cuts, no risers, no impacts. Those made it fight the picture.
  const end = Math.round(total * bed.buffer.sr);
  const L = bed.buffer.l.subarray(0, end); const R = bed.buffer.r.subarray(0, end);
  const out = Math.round(6 * bed.buffer.sr);
  for (let i = 0; i < out && end - 1 - i >= 0; i++) { const g = i / out; L[end - 1 - i] *= g; R[end - 1 - i] *= g; }
  writeWav(file, { sr: bed.buffer.sr, l: L, r: R });
  return { mode: 'library', used: bed.used };
}

export function buildStoryAudio({ project, shotList, actSpans, regions, noMusic, total, style, config }) {
  const kit = project.has('kit.json') ? project.read('kit.json') : buildKit(project.id, style);
  const dir = ensureDir(project.file('audio'));
  const arc = style.story?.score?.arc || DEFAULT_ARC;

  // montage runs: consecutive shots cut on the grid, the score puts its kick on each cut
  const montages = [];
  for (const sh of shotList.shots) {
    const cut = sh.motion?.data?.montage_cut;
    if (!cut) continue;
    const last = montages.at(-1);
    if (last && Math.abs(sh.start_s - last.e) < 0.05 && last.cut === cut) last.e = sh.start_s + sh.duration_s;
    else montages.push({ s: sh.start_s, e: sh.start_s + sh.duration_s, cut });
  }
  const musicPlanKey = planKey(musicPlan(project.id, style, loadMusicIndex(config)));
  const scoreKey = hash({ musicPlanKey, v: 3, seed: kit.seed, total: round(total, 1), acts: actSpans.map((a) => [a.act, round(a.s, 1), round(a.e, 1)]), arc, montages: montages.map((m) => [round(m.s, 2), round(m.e, 2), m.cut]) });
  const scoreFile = path.join(dir, `score-${scoreKey}.wav`);
  if (!fs.existsSync(scoreFile)) renderScore({ config, kit, seed: project.id, style, shots: shotList.shots, total, actSpans, montages, file: scoreFile });

  const events = sfxEvents({ shotList, kit, style });
  const beds = bedSegments({ shotList });
  const sfxKey = hash({ seed: kit.seed, total: round(total, 1), events: events.map((e) => [round(e.t, 2), e.kind, e.gain]), beds });
  const sfxFile = path.join(dir, `sfx-${sfxKey}.wav`);
  if (!fs.existsSync(sfxFile)) renderSfxBed({ events, beds, duration: total, regions, kit, file: sfxFile });
  for (const f of fs.readdirSync(dir)) if ((f.startsWith('score-') && f !== path.basename(scoreFile)) || (f.startsWith('sfx-') && f !== path.basename(sfxFile))) fs.rmSync(path.join(dir, f), { force: true });

  // The score runs the whole film; it is cut only around the style's no-music windows.
  let pieces = [{ s: 0, e: total }];
  for (const w of noMusic) pieces = pieces.flatMap((p) => (w.e <= p.s || w.s >= p.e ? [p] : [{ s: p.s, e: w.s }, { s: w.e, e: p.e }]));
  // CC BY tracks must be credited: the list travels with the project and ends up in the video description.
  const creditsFile = path.join(dir, 'music_credits.json');
  const plan = musicPlan(project.id, style, loadMusicIndex(config));
  const usedIds = plan ? [...new Set(Object.values(plan).map((t) => t.id))] : [];
  fs.writeFileSync(creditsFile, JSON.stringify(usedIds.map((id) => { const t = Object.values(plan).find((x) => x.id === id); return { id, name: t.name, artist: t.artist, license: t.license }; }), null, 2));
  const music = pieces.filter((x) => x.e - x.s >= 6).map((p) => ({ file: scoreFile, start_s: round(p.s), end_s: round(p.e), function: 'score', src_in: round(p.s) }));
  return { music, sfx: { file: sfxFile, at_s: 0, gain_db: 0 }, meta: { events: events.length, beds: beds.length } };
}

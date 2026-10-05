import { z } from 'zod';
import { QcReport } from '../contracts.js';
import { pacingMetrics } from '../engine/editor.js';
import { houseRules, reviewPrompt } from '../prompts.js';
import { measureLoudness } from '../render.js';
import { compare, measureRender } from '../calibrate.js';
import { ffprobe, round } from '../util.js';

const ReviewOut = z.object({
  findings: z.array(z.object({ pass: z.number().int(), level: z.enum(['blocker', 'major', 'minor']), ref: z.string(), detail: z.string(), fix: z.string() })),
});

// S12. Automated passes are exact rules from the style profile; passes 3/5/6 get an LLM review;
// passes 6 and 8 are always listed for a human.
export async function runQc({ project, shotList, edl, audioPlan, script, outline, research, style, llm, render, voTiming, extras }) {
  const findings = [];
  const add = (pass, level, rule, detail, at = null, fix = null) => findings.push({ pass, level, rule, detail, at_s: at, fix_stage: fix });
  const m = pacingMetrics(shotList, style);
  const p = style.pacing;

  // Pass 1 — facts
  const claimIds = new Set(research.claims.map((c) => c.claim_id));
  for (const s of script.segments) {
    for (const c of s.claims) if (!claimIds.has(c)) add(1, 'blocker', '02.5 claim exists', `${s.seg_id} cites missing claim ${c}`, null, 'S3');
  }
  // Pass 2 — visual accuracy / licensing
  for (const r of extras.assetReport.shots.filter((x) => x.status === 'none')) add(2, 'major', '04.6 every footage shot has an asset', `${r.shot_id} has no usable footage`, null, 'S6');
  for (const r of extras.repairs) add(2, 'major', 'edit repair', `${r.shot_id} (${r.visual_type}) had no media and was absorbed by the previous shot`, r.at_s, r.visual_type === 'FLOW' ? 'S8' : 'S6');
  for (const r of extras.assetReport.shots.filter((x) => x.status === 'found' && !style.assets.allowed_licenses.includes(x.license))) add(2, 'blocker', '04.2 license', `${r.shot_id} uses ${r.license}`, null, 'S6');
  for (const f of extras.motionFailures) add(2, 'major', 'motion render', `${f.id} (${f.template}) failed: ${f.error}`, null, 'S9');

  // Pass 4 — pacing
  const [aslLo, aslHi] = p.asl_target;
  if (m.asl_s < aslLo || m.asl_s > aslHi) add(4, 'major', '01.5 ASL', `ASL ${m.asl_s}s outside ${aslLo}-${aslHi}s`);
  if (m.short_share > p.short_shot_time_share_max) add(4, 'major', '01.5 short shots', `${round(m.short_share * 100, 1)}% of time in shots < 3s`);
  if (m.flow_share > style.visual_mix.flow_hard_max) add(4, 'blocker', '03.1 flow share', `FLOW ${round(m.flow_share * 100, 1)}% > ${style.visual_mix.flow_hard_max * 100}%`);
  else if (m.flow_share > style.visual_mix.flow[1]) add(4, 'major', '03.1 flow share', `FLOW ${round(m.flow_share * 100, 1)}%`);
  if (m.explainer_share < style.visual_mix.explainer[0] - 0.08) add(4, 'minor', '03.1 explainer share', `MAP+TECH ${round(m.explainer_share * 100, 1)}% (target ${style.visual_mix.explainer.join('-')})`);
  if (m.black_beats < style.black_beats.min - 1) add(4, 'minor', '01.7 black beats', `${m.black_beats} black beats`);
  for (const s of shotList.shots) {
    if (['REAL', 'ARCHIVAL', 'FLOW'].includes(s.visual_type) && s.duration_s > p.hero.max + 0.5) add(4, 'major', '01.5 shot length', `${s.shot_id} lasts ${s.duration_s}s`, s.start_s, 'S5');
  }

  // Pass 7 — audio
  const loud = await measureLoudness(render);
  const info = await ffprobe(render);
  if (Math.abs(loud.lufs - style.audio.lufs) > 1) add(7, 'major', '06.7 loudness', `${loud.lufs} LUFS (target ${style.audio.lufs})`);
  if (loud.true_peak > style.audio.true_peak + 0.5) add(7, 'major', '06.7 true peak', `${loud.true_peak} dBTP`);
  if (Math.abs(info.duration - shotList.duration_s) > 1) add(7, 'major', 'duration', `render ${round(info.duration)}s vs plan ${shotList.duration_s}s`);
  const [spLo, spHi] = style.narration.speech_share;
  if (m.speech_share < spLo - 0.05 || m.speech_share > spHi + 0.03) add(7, 'minor', '02.4 narration share', `${round(m.speech_share * 100, 1)}% narration`);
  if (!audioPlan.music.length) add(7, 'major', '06.3 music', 'no music: studio/library/music is empty or unmatched');
  const musicShare = audioPlan.music.reduce((n, x) => n + (x.end_s - x.start_s), 0) / audioPlan.duration_s;
  if (musicShare > style.audio.music_max_share + 0.02) add(7, 'minor', '06.3 music coverage', `${round(musicShare * 100, 1)}%`);

  // Calibration: the render measured like the reference videos, against the style's target bands.
  let calibration = null;
  if (voTiming) {
    const measured = await measureRender({ render, shotList, voTiming, audioPlan, style });
    calibration = { measured, rows: compare(measured, style) };
    const covered = new Set(['asl_s', 'short_time_pct', 'lufs', 'true_peak']); // already checked above
    for (const r of calibration.rows.filter((x) => x.status !== 'ok' && x.status !== 'n/a' && !covered.has(x.metric))) {
      const level = ['bed_rel_db', 'speech_pct', 'lra'].includes(r.metric) ? 'major' : 'minor';
      add(r.metric.startsWith('bed') || ['lra', 'speech_pct', 'pauses_ge1s_per_min', 'breathing_per_4min', 'vo_run_p90_s'].includes(r.metric) ? 7 : 4, level, `calibration ${r.metric}`, `${r.value} is ${r.status} (target ${r.target.join('..')}; saudi ${r.saudi ?? '-'}, finland ${r.finland ?? '-'})`);
    }
  }

  // Passes 3, 5, 6 — LLM editorial review
  const shotSummary = shotList.shots.map((s) => `${fmt(s.start_s)} ${s.visual_type.padEnd(8)} ${s.duration_s.toFixed(1)}s ${s.need?.subject || s.motion?.template || ''}`).join('\n');
  try {
    const review = await llm.json({ stage: 'review', schema: ReviewOut, system: houseRules(style), prompt: reviewPrompt({ outline, script, shotSummary }) });
    for (const f of review.findings) add([3, 5, 6].includes(f.pass) ? f.pass : 3, f.level, `review ${f.ref}`, `${f.detail} -> ${f.fix}`, null, f.pass === 3 ? 'S3' : 'S5');
  } catch (err) {
    add(3, 'minor', 'review', `LLM review unavailable: ${err.message.slice(0, 200)}`);
  }

  const passed = !findings.some((f) => f.level === 'blocker');
  return QcReport.parse({ render: project ? render.replace(`${project.dir}/`, '') : render, metrics: { ...m, ...loud, music_share: round(musicShare, 3), render_duration_s: round(info.duration, 2), calibration }, findings, passed, human_required: [6, 8] });
}

const fmt = (t) => `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(Math.floor(t % 60)).padStart(2, '0')}`;

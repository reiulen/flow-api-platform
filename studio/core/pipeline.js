// Orchestrator. Each stage reads files written by earlier stages and writes its own.
// A stage is skipped when its inputs (and the style profile) are unchanged since it last ran,
// so a run can always be resumed, and re-running a finished project is a no-op.
import fs from 'node:fs';
import path from 'node:path';
import { Brief, Outline, Research, Script, ShotList, VoTiming } from './contracts.js';
import { createLlm } from './llm.js';
import { Project } from './project.js';
import { lintResearch, runOutline, runResearch, runScript, runScriptEdit, scriptWordBudget } from './stages/editorial.js';
import { runVoice } from './stages/voice.js';
import { runVisualDirector } from './stages/visual.js';
import { buildShotList, pacingMetrics } from './engine/editor.js';
import { AssetDb, runAssets } from './stages/assets.js';
import { hardwareChecklistText, runFlow } from './stages/flow.js';
import { runMotion } from './stages/motion.js';
import { buildAudioPlan, buildEdl, syncShotListWithVo } from './stages/edit.js';
import { renderProject } from './render.js';
import { runQc } from './stages/qc.js';
import { loadMusicIndex, musicPlan } from './music-plan.js';
import { hash, hashFile, nowIso, readJson, round, sleep, slugify, writeJson } from './util.js';

const STAGE_VERSION = 1;

export const STAGES = [
  { id: 'research', label: 'S1 Deep research', inputs: ['brief.json'], outputs: ['research.json'] },
  { id: 'outline', label: 'S2 Story architect', inputs: ['brief.json', 'research.json'], outputs: ['outline.json'] },
  { id: 'script', label: 'S3 Scriptwriter', inputs: ['research.json', 'outline.json'], outputs: ['script.json'] },
  { id: 'G2', gate: true, label: 'G2 Script approval', inputs: ['script.json'] },
  { id: 'voice', label: 'S4 Voice', inputs: ['script.json'], outputs: ['vo_timing.json'] },
  { id: 'visual', label: 'S5a Visual director', inputs: ['script.json', 'research.json'], outputs: ['visual_beats.json'] },
  { id: 'shotlist', label: 'S5b Editor engine', inputs: ['script.json', 'vo_timing.json', 'visual_beats.json', 'outline.json'], outputs: ['shotlist.plan.json'] },
  { id: 'assets', label: 'S6 Asset research', inputs: ['shotlist.plan.json', 'script.json', 'research.json'], outputs: ['asset_plan.json', 'shotlist.assets.json', 'asset_report.json'] },
  { id: 'G3', gate: true, label: 'G3 Shot plan approval', inputs: ['shotlist.assets.json'] },
  { id: 'flow', label: 'S7-S8 Flow generation', inputs: ['shotlist.assets.json'], outputs: ['shotlist.flow.json'] },
  { id: 'motion', label: 'S9 Motion', inputs: ['shotlist.flow.json'], outputs: ['shotlist.final.json', 'motion_report.json'] },
  { id: 'edit', label: 'S10 Edit', inputs: ['shotlist.final.json', 'vo_timing.json'], outputs: ['edl.json', 'audio_plan.json', 'edit_report.json'] },
  { id: 'render', label: 'S11 Render', inputs: ['edl.json', 'audio_plan.json'], outputs: ['render.json'] },
  { id: 'qc', label: 'S12 QC', inputs: ['render.json'], outputs: ['qc_report.json'] },
  { id: 'G4', gate: true, label: 'G4 Rough cut approval', inputs: ['qc_report.json'] },
  { id: 'final', label: 'S14 Final', inputs: ['render.json', 'qc_report.json'], outputs: ['final.json'] },
];

export class WaitingError extends Error {}

export function newBrief({ genre, title, question, angle = '', minutes = 25, topicId, overrides = [] }) {
  const date = nowIso().slice(0, 10).replace(/-/g, '');
  const prefix = genre.slice(0, 3).toUpperCase();
  const plannedShots = Math.round(minutes * 8);
  const maxGen = Math.max(100, Math.round(minutes * 20));
  return Brief.parse({
    project_id: `${prefix}-${slugify(title, 40)}-${date}`,
    genre, title_working: title, central_question: question, angle, target_duration_min: minutes,
    topic_id: topicId, overrides, created_at: nowIso(),
    flow_budget: { planned_shots: plannedShots, max_generations: maxGen },
  });
}

function inputHash(project, stage) {
  return hash({ v: STAGE_VERSION, stage: stage.id, files: stage.inputs.map((f) => hashFile(project.file(f))), style: hash(project.style()) });
}

export async function runProject(config, projectId, { until, from, log = console.log, llm: llmOverride } = {}) {
  const project = Project.open(config, projectId);
  const llm = llmOverride || createLlm(config);
  const ctx = { config, project, llm, style: project.style(), log };
  const state = project.state;
  const startIdx = from ? STAGES.findIndex((s) => s.id === from) : 0;
  if (startIdx < 0) throw new Error(`Unknown stage ${from}`);
  if (from) {
    for (const s of STAGES.slice(startIdx)) { delete state.stages[s.id]; if (s.gate) delete state.gates[s.id]; }
  }
  state.status = 'running';
  project.saveState(state);

  for (const [i, stage] of STAGES.entries()) {
    if (i < startIdx) continue;
    const hashNow = inputHash(project, stage);
    if (stage.gate) {
      const g = state.gates[stage.id];
      if (g?.decision === 'approve' && (g.input_hash === hashNow || !from)) continue;
      const decision = await autoGate(ctx, stage.id);
      if (decision.pass) {
        state.gates[stage.id] = { decision: 'approve', by: 'auto', at: nowIso(), input_hash: hashNow, notes: decision.notes };
        project.saveState(state);
        log(`[${project.id}] ${stage.label}: auto-approved${decision.notes.length ? ` (${decision.notes.join('; ')})` : ''}`);
        continue;
      }
      state.status = `waiting:${stage.id}`;
      state.gates[stage.id] = { decision: 'pending', at: nowIso(), input_hash: hashNow, notes: decision.notes };
      project.saveState(state);
      log(`[${project.id}] ${stage.label}: waiting for approval — studio gate ${project.id} ${stage.id} approve${decision.notes.length ? `\n  ${decision.notes.join('\n  ')}` : ''}`);
      return { status: state.status, project };
    }
    const prev = state.stages[stage.id];
    const outputsExist = stage.outputs.every((f) => project.has(f));
    if (prev?.status === 'done' && outputsExist && (prev.input_hash === hashNow || !from)) {
      if (until === stage.id) break;
      continue;
    }
    const started = Date.now();
    log(`[${project.id}] ${stage.label}...`);
    state.stages[stage.id] = { status: 'running', started_at: nowIso(), attempts: (prev?.attempts || 0) + 1 };
    project.saveState(state);
    try {
      const summary = await withRetries(() => STAGE_RUNNERS[stage.id](ctx), config.stageRetries, (err, n) => log(`[${project.id}] ${stage.id} attempt ${n} failed: ${err.message}`));
      state.stages[stage.id] = { status: 'done', input_hash: inputHash(project, stage), finished_at: nowIso(), seconds: round((Date.now() - started) / 1000, 1), summary };
      project.log('stage_done', { stage: stage.id, summary });
      log(`[${project.id}] ${stage.label}: done ${summary ? JSON.stringify(summary) : ''}`);
    } catch (err) {
      if (err instanceof WaitingError) {
        state.stages[stage.id] = { status: 'waiting', note: err.message, at: nowIso() };
        state.status = `waiting:${stage.id}`;
        project.saveState(state);
        log(`[${project.id}] ${stage.label}: waiting — ${err.message}`);
        return { status: state.status, project };
      }
      state.stages[stage.id] = { status: 'failed', error: err.message, at: nowIso() };
      state.status = `failed:${stage.id}`;
      project.saveState(state);
      project.log('stage_failed', { stage: stage.id, error: err.message });
      throw Object.assign(err, { stage: stage.id, project: project.id });
    }
    project.saveState(state);
    if (until === stage.id) break;
  }
  state.status = state.stages.final?.status === 'done' ? 'done' : 'paused';
  project.saveState(state);
  return { status: state.status, project };
}

async function withRetries(fn, retries, onFail) {
  for (let attempt = 1; ; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (err instanceof WaitingError || attempt > retries) throw err;
      onFail(err, attempt);
      await sleep(Math.min(60000, 2000 * 2 ** attempt));
    }
  }
}

// Automated gate checks. Policy 'manual' always stops; 'auto' stops only when a check fails.
async function autoGate({ config, project, style }, gate) {
  const notes = [];
  if (gate === 'G2') {
    const script = project.read('script.json', Script);
    const budget = scriptWordBudget(style, project.brief);
    if (script.words < budget * 0.85 || script.words > budget * 1.15) notes.push(`script has ${script.words} words, budget ${budget}`);
  }
  if (gate === 'G3') {
    const shots = project.read('shotlist.assets.json', ShotList);
    const report = project.read('asset_report.json');
    const footage = shots.shots.filter((s) => ['REAL', 'ARCHIVAL', 'NEWS'].includes(s.visual_type)).length;
    const missing = report.shots.filter((s) => s.status === 'none').length;
    if (missing > Math.max(2, footage * 0.1)) notes.push(`${missing} of ${footage} footage shots have no asset`);
    const m = pacingMetrics(shots, style);
    const isFullFlowProject = style.visual_mix?.flow_share === 1.0 || shots.shots.every((s) => s.visual_type === 'FLOW');
    if (!isFullFlowProject && m.flow_share > (style.visual_mix?.flow_hard_max || 1.0)) notes.push(`FLOW share ${round(m.flow_share * 100, 1)}%`);
  }
  if (gate === 'G4') {
    const qc = project.read('qc_report.json');
    if (!qc.passed) notes.push(`QC has ${qc.findings.filter((f) => f.level === 'blocker').length} blocker(s)`);
    notes.push(`QC: ${qc.findings.filter((f) => f.level === 'major').length} major, ${qc.findings.filter((f) => f.level === 'minor').length} minor; passes 6 and 8 need a human viewing`);
  }
  const policy = config.gates[gate] || 'auto';
  const blocking = gate === 'G4' ? notes.some((n) => n.includes('blocker')) : notes.length > 0;
  return { pass: policy === 'auto' && !blocking, notes };
}

export function setGate(config, projectId, gate, decision, note = '') {
  const project = Project.open(config, projectId);
  const state = project.state;
  const stage = STAGES.find((s) => s.id === gate && s.gate);
  if (!stage) throw new Error(`Unknown gate ${gate}`);
  state.gates[gate] = { decision, by: 'human', at: nowIso(), input_hash: inputHash(project, stage), notes: note ? [note] : [] };
  if (decision !== 'approve') state.status = `rejected:${gate}`;
  project.saveState(state);
  project.log('gate', { gate, decision, note });
  return state.gates[gate];
}

// Per-act results of a multi-call stage, kept on disk so a retry of the stage only redoes the acts
// that did not finish. The key changes whenever the stage's inputs change.
function actCheckpoint(project, name, inputs) {
  const file = project.file(name);
  const key = hash(inputs);
  const saved = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : null;
  const acts = saved?.key === key ? saved.acts : {};
  return {
    get: (act) => acts[act] || null,
    set: (act, value) => { acts[act] = value; fs.writeFileSync(file, JSON.stringify({ key, acts })); },
    clear: () => fs.rmSync(file, { force: true }),
  };
}

// ---------- stage runners ----------

const STAGE_RUNNERS = {
  async research({ project, llm, style, config }) {
    const { research, notes } = await runResearch({ llm, style, brief: project.brief, config });
    project.write('research.json', research, Research);
    fs.writeFileSync(project.file('research_notes.md'), notes);
    return { sources: research.sources.length, claims: research.claims.length };
  },

  async outline({ project, llm, style }) {
    const research = lintResearch(project.read('research.json', Research));
    const outline = await runOutline({ llm, style, brief: project.brief, research });
    project.write('outline.json', outline, Outline);
    return { title: outline.title, beats: outline.acts.reduce((n, a) => n + a.beats.length, 0) };
  },

  async script({ project, llm, style, log }) {
    const research = project.read('research.json', Research);
    const outline = project.read('outline.json', Outline);
    const checkpoint = actCheckpoint(project, 'script.acts.json', { outline, claims: research.claims.map((c) => [c.claim_id, c.text, c.confidence]), minutes: project.brief.target_duration_min, narration: style.narration, acts: style.acts });
    const draft = await runScript({ llm, style, brief: project.brief, research, outline, checkpoint });
    // One editor pass over the whole film; if it fails, the draft stands.
    let script = draft;
    try {
      const edited = await runScriptEdit({ llm, style, brief: project.brief, research, outline, script: draft });
      script = edited.script;
      project.write('script_edits.json', edited.report);
      log(`[${project.id}] script edit: ${edited.report.applied.length} applied, ${edited.report.rejected.length} rejected`);
    } catch (err) {
      log(`[${project.id}] script edit skipped: ${err.message.slice(0, 200)}`);
    }
    project.write('script.draft.json', draft, Script);
    project.write('script.json', script, Script);
    checkpoint.clear();
    fs.writeFileSync(project.file('script.md'), script.segments.map((s) => `**${s.seg_id}** _(act ${s.act}, ${s.purpose}/${s.density}, ${s.tone})_\n${s.text}\n`).join('\n'));
    return { words: script.words, segments: script.segments.length, est_min: round(script.est_duration_s / 60, 1) };
  },

  async voice({ project, style, config }) {
    const script = project.read('script.json', Script);
    const activeVoice = { ...config.voice, ...(style.voice || {}) };
    const vo = await runVoice({ project, script, voice: activeVoice, style, config, concurrency: config.testMode ? 4 : 3 });
    project.write('vo_timing.json', vo, VoTiming);
    return { seconds: round(vo.segments.reduce((n, s) => n + s.duration_s, 0), 1) };
  },

  async visual({ project, llm, style }) {
    const script = project.read('script.json', Script);
    const research = project.read('research.json', Research);
    const checkpoint = actCheckpoint(project, 'visual.acts.json', { script, claims: research.claims.map((c) => [c.claim_id, c.text]), acts: style.acts });
    const visual = await runVisualDirector({ llm, style, script, research, checkpoint, seed: project.id });
    project.write('visual_beats.json', visual);
    checkpoint.clear();
    const beats = Object.values(visual.segments).flat();
    const count = (t) => beats.filter((b) => b.visual_type === t).length;
    return { beats: beats.length, REAL: count('REAL'), MAP: count('MAP'), TECH: count('TECH'), FLOW: count('FLOW') };
  },

  async shotlist({ project, style, config }) {
    const shotList = buildShotList({
      script: project.read('script.json', Script), vo: project.read('vo_timing.json', VoTiming), visual: project.read('visual_beats.json'),
      style, seed: project.id, title: project.read('outline.json', Outline).title,
      music: musicPlan(project.id, style, loadMusicIndex(config)),
    });
    project.write('shotlist.plan.json', shotList, ShotList);
    const m = pacingMetrics(shotList, style);
    return { shots: m.shots, minutes: round(m.duration_s / 60, 1), asl: m.asl_s, explainer: m.explainer_share, flow: m.flow_share };
  },

  async assets({ project, style, config, llm, log }) {
    const { shotList, report, plan } = await runAssets({ project, shotList: project.read('shotlist.plan.json', ShotList), script: project.read('script.json', Script), research: project.read('research.json', Research), style, config, flowAvailable: config.flow.mode !== 'off', llm, log: (m) => log(`[${project.id}] ${m}`) });
    project.write('asset_plan.json', plan);
    project.write('shotlist.assets.json', shotList, ShotList);
    project.write('asset_report.json', report);
    const found = report.shots.filter((s) => s.status === 'found');
    return { found: found.length, strong: found.filter((s) => s.relevance >= 2).length, weak: found.filter((s) => s.relevance < 2).length, flow_fallback: report.flow_added, motion_fallback: report.motion_added, missing: report.shots.filter((s) => s.status === 'none').length, downloaded: report.totals.downloaded_new, reviewed: report.totals.reviewed };
  },

  async flow({ project, style, config, llm }) {
    const shotList = project.read('shotlist.assets.json', ShotList);
    const res = await runFlow({ project, shotList, style, config, llm, hardwareChecklist: hardwareChecklistText(config, style) });
    if (res.pending) throw new WaitingError(`${res.pending} Flow request(s) queued in flow_queue/ — run "studio flow-runner" on the Flow machine, then "studio run ${project.id}"`);
    project.write('shotlist.flow.json', res.shotList, ShotList);
    const flowShots = res.shotList.shots.filter((s) => s.visual_type === 'FLOW');
    return { flow_shots: flowShots.length, generated: flowShots.filter((s) => s.flow_file).length, generations: res.generations };
  },

  async motion({ project, style, config }) {
    const res = await runMotion({ project, shotList: project.read('shotlist.flow.json', ShotList), style, config });
    project.write('shotlist.final.json', res.shotList, ShotList);
    project.write('motion_report.json', { failures: res.failures, rendered: res.rendered });
    return { rendered: res.rendered, failed: res.failures.length };
  },

  async edit({ project, style, config }) {
    const rawShotList = project.read('shotlist.final.json', ShotList);
    const vo = project.read('vo_timing.json', VoTiming);
    const script = project.read('script.json', Script);
    const shotList = syncShotListWithVo({ shotList: rawShotList, vo, script });
    const { edl, repairs } = buildEdl({ project, shotList, style, config });
    const audioPlan = buildAudioPlan({ project, shotList, vo, script, style, config });
    project.write('shotlist.final.json', shotList, ShotList);
    project.write('edl.json', edl);
    project.write('audio_plan.json', audioPlan);
    project.write('edit_report.json', { repairs });
    return { clips: edl.clips.length, repairs: repairs.length, music_cues: audioPlan.music.length };
  },

  async render({ project, style, config }) {
    const file = await renderProject({ project, edl: project.read('edl.json'), audioPlan: project.read('audio_plan.json'), style, config });
    project.write('render.json', { file: path.relative(project.dir, file), at: nowIso() });
    return { file: path.relative(project.dir, file) };
  },

  async qc({ project, style, llm }) {
    const report = await runQc({
      project, style, llm,
      render: project.file(project.read('render.json').file),
      shotList: project.read('shotlist.final.json', ShotList), edl: project.read('edl.json'), audioPlan: project.read('audio_plan.json'),
      script: project.read('script.json', Script), outline: project.read('outline.json', Outline), research: project.read('research.json', Research),
      voTiming: project.read('vo_timing.json', VoTiming),
      extras: { assetReport: project.read('asset_report.json'), repairs: project.read('edit_report.json').repairs, motionFailures: project.read('motion_report.json').failures },
    });
    project.write('qc_report.json', report);
    project.write('calibration.json', report.metrics.calibration);
    const count = (l) => report.findings.filter((f) => f.level === l).length;
    return { passed: report.passed, blocker: count('blocker'), major: count('major'), minor: count('minor') };
  },

  async final({ project, config }) {
    const render = project.read('render.json');
    const out = project.file('renders', 'final.mp4');
    fs.rmSync(out, { force: true });
    try { fs.linkSync(project.file(render.file), out); } catch { fs.copyFileSync(project.file(render.file), out); }
    // Intermediate clips are only needed to re-render; the final file and plans stay.
    fs.rmSync(project.file('renders', 'work'), { recursive: true, force: true });
    const upload = buildUploadPackage({ project, config });
    project.write('credits.json', upload.credits);
    project.write('upload.json', upload.youtube);
    project.write('final.json', { file: 'renders/final.mp4', at: nowIso() });
    return { file: 'renders/final.mp4' };
  },
};

function buildUploadPackage({ project, config }) {
  const outline = project.read('outline.json', Outline);
  const research = project.read('research.json', Research);
  const shotList = project.read('shotlist.final.json', ShotList);
  const script = project.read('script.json', Script);
  const db = new AssetDb(config);
  const assets = [...new Set(shotList.shots.map((s) => s.asset_id).filter(Boolean))].map((id) => db.byId(id)).filter(Boolean);
  db.close();
  const firstSegOfAct = new Map();
  for (const s of script.segments) if (!firstSegOfAct.has(s.act)) firstSegOfAct.set(s.act, s.seg_id);
  const chapters = outline.acts.map((a) => {
    const place = shotList.vo_placements.find((p) => p.seg_id === firstSegOfAct.get(a.act));
    return { t: a.act === 1 ? 0 : Math.floor(place?.start_s || 0), name: a.beats[0]?.summary.split(/[.:;]/)[0].slice(0, 60) || a.name };
  });
  const fmt = (t) => `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
  const usesFlow = shotList.shots.some((s) => s.visual_type === 'FLOW' && s.flow_file);
  const audioPlan = project.read('audio_plan.json');
  const libraryMeta = new Map(['music', 'ambience'].flatMap((kind) => {
    const index = path.join(config.libraryDir, kind, 'index.json');
    return fs.existsSync(index) ? readJson(index).map((t) => [path.resolve(path.dirname(index), t.file), { kind, ...t }]) : [];
  }));
  const audioFiles = [...new Set([...audioPlan.music, ...audioPlan.ambience].map((m) => m.file))];
  const credits = {
    footage: assets.map((a) => ({ asset_id: a.asset_id, source: a.source, url: a.source_url, credit: a.credit, license: a.license })),
    audio: [
      ...audioFiles.map((f) => libraryMeta.get(f)).filter(Boolean).map((t) => ({ kind: t.kind, file: path.basename(t.file), credit: t.credit || '', license: t.license || '' })),
      ...(project.has('audio/music_credits.json') ? project.read('audio/music_credits.json').map((t) => ({ kind: 'music', file: t.id, credit: `"${t.name}" by ${t.artist}`, license: t.license || '' })) : []),
    ],
    sources: research.sources.filter((s) => s.tier <= 3).map((s) => ({ title: s.title, publisher: s.publisher, url: s.url })),
  };
  const description = [
    outline.central_question,
    '',
    'Chapters',
    ...chapters.map((c) => `${fmt(c.t)} ${c.name}`),
    '',
    'Sources',
    ...credits.sources.slice(0, 40).map((s) => `- ${s.publisher}: ${s.title} ${s.url}`),
    '',
    'Footage',
    ...[...new Set(credits.footage.map((f) => f.credit))].map((c) => `- ${c}`),
    ...(credits.audio.length ? ['', 'Music & sound', ...[...new Set(credits.audio.map((t) => `${t.credit}${t.license ? ` (${t.license})` : ''}`))].map((c) => `- ${c}`)] : []),
    usesFlow ? '\nSome scenes are visual reconstructions and are labeled on screen.' : '',
  ].join('\n');
  return { credits, youtube: { title: outline.title, description, chapters, altered_or_synthetic_content: usesFlow, made_for_kids: false } };
}

export function projectStatus(config, projectId) {
  const project = Project.open(config, projectId);
  const state = project.state;
  return {
    project: project.id, status: state.status,
    stages: STAGES.map((s) => ({ id: s.id, label: s.label, status: s.gate ? state.gates[s.id]?.decision || '-' : state.stages[s.id]?.status || '-', seconds: state.stages[s.id]?.seconds, summary: state.stages[s.id]?.summary, error: state.stages[s.id]?.error })),
  };
}

export function listProjects(config) {
  if (!fs.existsSync(config.projectsDir)) return [];
  return fs.readdirSync(config.projectsDir).filter((d) => fs.existsSync(path.join(config.projectsDir, d, 'state.json')))
    .map((d) => ({ id: d, ...readJson(path.join(config.projectsDir, d, 'state.json')) }))
    .map((s) => ({ id: s.id, status: s.status, created_at: s.created_at }));
}

export function topicsFile(config, genre) { return path.join(config.root, 'data', `topics-${genre}.json`); }
export function usedTopicsFile(config) { return path.join(config.root, 'data', 'used_topics.json'); }
export function markTopicUsed(config, genre, title, projectId) {
  const file = usedTopicsFile(config);
  const used = readJson(file, []);
  used.push({ genre, title, project_id: projectId, at: nowIso() });
  writeJson(file, used);
}

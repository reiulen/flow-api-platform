#!/usr/bin/env node
// Documentary studio command line. See studio/README.md.
import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { loadConfig } from './core/config.js';
import { createLlm } from './core/llm.js';
import { Project } from './core/project.js';
import { loadStyle } from './core/style.js';
import { adapters } from './core/sources.js';
import { pickTopic, scoutTopics } from './core/stages/editorial.js';
import { runFlowQueue } from './core/stages/flow.js';
import { chromePath, renderGeo } from './core/geo.js';
import { searchConfigured } from './core/search.js';
import { compare, formatTable, measureRender } from './core/calibrate.js';
import { MotionData } from './core/stages/visual.js';
import { listProjects, markTopicUsed, newBrief, projectStatus, runProject, setGate, topicsFile, usedTopicsFile } from './core/pipeline.js';
import { readJson, run, sleep, writeJson } from './core/util.js';

const HELP = `studio <command> [options]

  doctor                                   check tools, keys and the Flow API
  topics  --genre military [--count 8] [--seed "ideas"]
                                           propose and score topics (writes studio/data/topics-<genre>.json)
  new     --genre military (--topic T-001 | --title "..." --question "...") [--minutes 25]
                                           create a project
  run     <project> [--from <stage>] [--until <stage>]
                                           run/resume a project until done or a gate
  batch   --genre military --count 5 [--minutes 25]
                                           pick the best unused topics, create projects and run them
  gate    <project> <G2|G3|G4> <approve|revise|reject> [--note "..."]
  status  [project]
  flow-runner [--watch]                    (Flow machine) process queued Flow requests
  calibrate <project_id>                   measure the render like the reference videos and compare
  map-preview [--file map.json] [--seconds 15] [--out preview.mp4]
                                           render one map shot with the configured imagery
`;

const config = loadConfig();
const [command, ...rest] = process.argv.slice(2);
const { values: opt, positionals: pos } = parseArgs({
  args: rest, allowPositionals: true,
  options: {
    genre: { type: 'string', default: 'military' }, count: { type: 'string' }, seed: { type: 'string' }, topic: { type: 'string' },
    title: { type: 'string' }, question: { type: 'string' }, angle: { type: 'string' }, minutes: { type: 'string' },
    from: { type: 'string' }, until: { type: 'string' }, note: { type: 'string' }, watch: { type: 'boolean' },
    file: { type: 'string' }, seconds: { type: 'string' }, out: { type: 'string' },
  },
});

async function footageProbe(query) {
  for (const name of ['dvids', 'nasa']) {
    const a = adapters[name];
    if (!a.enabled(config)) continue;
    const results = await a.search(query, config, { kind: 'video', limit: 50 });
    return results.length;
  }
  return null;
}

async function scout(genre, count, seed) {
  const style = loadStyle(config, genre);
  const used = readJson(usedTopicsFile(config), []).filter((u) => u.genre === genre).map((u) => u.title);
  const topics = await scoutTopics({ llm: createLlm(config), style, genre, count, exclude: used, seedIdeas: seed, footageProbe });
  writeJson(topicsFile(config, genre), topics);
  return topics;
}

function createFromTopic(genre, topic, minutes) {
  const brief = newBrief({ genre, title: topic.title, question: topic.central_question, angle: topic.angle, minutes, topicId: topic.topic_id });
  Project.create(config, brief);
  markTopicUsed(config, genre, topic.title, brief.project_id);
  return brief.project_id;
}

const commands = {
  async doctor() {
    const checks = [];
    const ok = (name, pass, detail = '') => checks.push(`${pass ? 'ok  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
    try { await run('ffmpeg', ['-version']); ok('ffmpeg', true); } catch { ok('ffmpeg', false, 'install ffmpeg'); }
    try {
      const { stdout } = await run(config.render.hyperframes, ['doctor', '--json'], { timeoutMs: 120000 });
      const checks = JSON.parse(stdout).checks || [];
      // Only the render essentials matter here; transcription/TTS/music/docker checks are optional.
      const bad = checks.filter((c) => !c.ok && /chrome|browser|ffmpeg|ffprobe|node/i.test(c.name));
      ok('hyperframes', !bad.length, bad.map((c) => `${c.name}: ${c.hint || c.detail}`).join('; '));
    } catch (err) { ok('hyperframes', false, err.message.slice(0, 120)); }
    ok('LLM provider', config.llm.provider !== 'anthropic' || Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN), `${config.llm.provider} ${config.llm.model}`);
    if (process.env.ANTHROPIC_BASE_URL) {
      ok('research search', searchConfigured(config), searchConfigured(config) ? `9router ${config.search.model} @ ${config.search.url}` : 'set STUDIO_SEARCH_MODEL to a search provider enabled in 9router (research refuses to run from model memory)');
    }
    ok('voice', true, `${config.voice.provider} ${config.voice.voice}`);
    if (!['edge', 'elevenlabs', 'synthetic'].includes(config.voice.provider)) {
      ok('voice sync', true, config.voice.align.model ? `speech-to-text ${config.voice.align.model} via 9router, pause alignment as fallback` : 'pause alignment (set STUDIO_ALIGN_MODEL to a 9router Whisper model for word-exact timings)');
    }
    ok('map imagery', config.map.provider !== 'maptiler' || Boolean(config.map.maptilerKey), `${config.map.provider}${config.map.provider === 'gibs' ? ' (regional detail only; set MAPTILER_KEY or STUDIO_MAP_PROVIDER=s2cloudless for close zooms)' : ''}`);
    ok('map browser', Boolean(chromePath(config)), chromePath(config) || 'set CHROME_EXECUTABLE_PATH');
    for (const k of ['dvids', 'nara', 'pexels', 'pixabay']) ok(`source ${k}`, Boolean(config.sources[k]), config.sources[k] ? 'key set' : 'no key (source skipped)');
    const lib = (k) => fs.existsSync(path.join(config.libraryDir, k, 'index.json'));
    ok('music library', lib('music'), lib('music') ? '' : `add tracks + ${path.join(config.libraryDir, 'music', 'index.json')}`);
    ok('ambience library', lib('ambience'), lib('ambience') ? '' : 'optional');
    if (config.flow.mode === 'direct') {
      try {
        const res = await fetch(`${config.flow.baseUrl}/healthz`);
        ok('Flow API', res.ok, config.flow.baseUrl);
      } catch (err) { ok('Flow API', false, `${config.flow.baseUrl} unreachable (${err.message}); use STUDIO_FLOW_MODE=queue or off`); }
    } else ok('Flow API', true, `mode ${config.flow.mode}`);
    console.log(checks.join('\n'));
  },

  async topics() {
    const topics = await scout(opt.genre, Number(opt.count || 8), opt.seed || '');
    for (const c of topics.candidates) console.log(`${c.topic_id}  ${String(c.total).padStart(5)}  footage ${c.scores.footage}  ${c.title}`);
    console.log(`\nwritten ${topicsFile(config, opt.genre)}`);
  },

  async new() {
    let id;
    if (opt.topic) {
      const topics = readJson(topicsFile(config, opt.genre));
      const topic = topics.candidates.find((c) => c.topic_id === opt.topic);
      if (!topic) throw new Error(`topic ${opt.topic} not found`);
      id = createFromTopic(opt.genre, topic, Number(opt.minutes || 25));
    } else {
      if (!opt.title || !opt.question) throw new Error('--title and --question are required without --topic');
      id = createFromTopic(opt.genre, { title: opt.title, central_question: opt.question, angle: opt.angle || '' }, Number(opt.minutes || 25));
    }
    console.log(id);
  },

  async run() {
    if (!pos[0]) throw new Error('usage: studio run <project>');
    const res = await runProject(config, pos[0], { from: opt.from, until: opt.until });
    console.log(`${pos[0]}: ${res.status}`);
  },

  async batch() {
    const count = Number(opt.count || 3);
    let topics = fs.existsSync(topicsFile(config, opt.genre)) ? readJson(topicsFile(config, opt.genre)) : await scout(opt.genre, Math.max(8, count * 2), opt.seed || '');
    const ids = [];
    for (let i = 0; i < count; i++) {
      const used = readJson(usedTopicsFile(config), []).map((u) => u.title);
      let topic = pickTopic(topics, used);
      if (!topic) { topics = await scout(opt.genre, Math.max(8, count * 2), opt.seed || ''); topic = pickTopic(topics, used); }
      if (!topic) throw new Error('no usable topic left');
      ids.push(createFromTopic(opt.genre, topic, Number(opt.minutes || 25)));
    }
    for (const id of ids) {
      try {
        const res = await runProject(config, id);
        console.log(`${id}: ${res.status}`);
      } catch (err) {
        console.error(`${id}: failed at ${err.stage}: ${err.message}`);
      }
    }
  },

  async gate() {
    const [project, gate, decision] = pos;
    if (!['approve', 'revise', 'reject'].includes(decision)) throw new Error('decision must be approve, revise or reject');
    console.log(setGate(config, project, gate, decision, opt.note));
  },

  async status() {
    if (!pos[0]) {
      for (const p of listProjects(config)) console.log(`${p.status.padEnd(18)} ${p.id}`);
      return;
    }
    const s = projectStatus(config, pos[0]);
    console.log(`${s.project}: ${s.status}`);
    for (const st of s.stages) console.log(`  ${st.label.padEnd(24)} ${String(st.status).padEnd(9)} ${st.seconds ? `${st.seconds}s ` : ''}${st.summary ? JSON.stringify(st.summary) : ''}${st.error ? ` ERROR ${st.error}` : ''}`);
  },

  async calibrate() {
    const id = pos[0];
    if (!id) throw new Error('usage: studio calibrate <project_id>');
    const project = Project.open(config, id);
    const render = project.file(project.read('render.json').file);
    const measured = await measureRender({ render, shotList: project.read('shotlist.final.json'), voTiming: project.read('vo_timing.json'), audioPlan: project.read('audio_plan.json'), style: project.style() });
    const rows = compare(measured, project.style());
    project.write('calibration.json', { measured, rows });
    console.log(formatTable(rows));
    console.log(`\n${rows.filter((r) => r.status !== 'ok').length} metrics outside target. Saved ${project.file('calibration.json')}`);
  },

  async 'map-preview'() {
    const file = opt.file || path.join(config.root, 'motion', 'geo', 'examples', 'red-sea.json');
    const data = MotionData.map.parse(readJson(file));
    const out = path.resolve(opt.out || 'map-preview.mp4');
    const started = Date.now();
    await renderGeo({ config, style: loadStyle(config, opt.genre), data, duration: Number(opt.seconds || 15), out });
    console.log(`${out} (${config.map.provider}, ${Math.round((Date.now() - started) / 1000)}s)`);
  },

  async 'flow-runner'() {
    do {
      const n = await runFlowQueue(config);
      if (n) console.log(`processed ${n} Flow request(s)`);
      if (opt.watch) await sleep(15000);
    } while (opt.watch);
  },
};

const fn = commands[command];
if (!fn) {
  console.log(HELP);
  process.exit(command ? 1 : 0);
}
fn().catch((err) => {
  console.error(`error: ${err.message}`);
  process.exit(1);
});

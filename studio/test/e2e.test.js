import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadConfig } from '../core/config.js';
import { createLlm } from '../core/llm.js';
import { Project } from '../core/project.js';
import { newBrief, runProject, projectStatus } from '../core/pipeline.js';
import { ffprobe, readJson, run } from '../core/util.js';
import { mockResponders } from './fixtures.js';

async function makeLibrary(dir) {
  const music = path.join(dir, 'music');
  fs.mkdirSync(music, { recursive: true });
  const index = [];
  for (const [i, fn] of ['investigation', 'scale', 'engineering', 'threat', 'action', 'ending'].entries()) {
    const file = path.join(music, `${fn}.wav`);
    await run('ffmpeg', ['-y', '-v', 'error', '-f', 'lavfi', '-i', `sine=frequency=${110 + i * 20}:sample_rate=48000:duration=90`, '-af', 'volume=0.3', '-ac', '2', file]);
    index.push({ file: `${fn}.wav`, function: fn, duration_s: 90, license: 'test', credit: 'test' });
  }
  fs.writeFileSync(path.join(music, 'index.json'), JSON.stringify(index));
}

test('full pipeline produces a rendered, QC-checked documentary from mocks', { timeout: 60 * 60 * 1000 }, async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'studio-e2e-'));
  await makeLibrary(path.join(tmp, 'library'));
  const config = loadConfig({
    projectsDir: path.join(tmp, 'projects'), assetsDir: path.join(tmp, 'assets'), libraryDir: path.join(tmp, 'library'),
    llm: { provider: 'mock', mock: mockResponders() }, voice: { provider: 'synthetic', voice: 'synthetic' },
    flow: { mode: 'synthetic' }, render: { motionStub: true, threads: 2, preset: 'ultrafast', crf: 32 }, testMode: true, stageRetries: 0, concurrency: 2,
    gates: { G2: 'auto', G3: 'auto', G4: 'auto' }, disabledSources: ['nasa', 'wikimedia'],
  });
  const brief = newBrief({ genre: 'military', title: 'Why Aircraft Carriers Are So Hard to Sink', question: 'How can a ship everyone can find survive?', minutes: 3 });
  Project.create(config, brief);
  const logs = [];
  const res = await runProject(config, brief.project_id, { llm: createLlm(config), log: (l) => logs.push(l) });
  assert.equal(res.status, 'done', logs.join('\n'));

  const project = Project.open(config, brief.project_id);
  const shots = readJson(project.file('shotlist.final.json'));
  const qc = readJson(project.file('qc_report.json'));
  const info = await ffprobe(project.file('renders', 'final.mp4'));
  assert.ok(Math.abs(info.duration - shots.duration_s) < 1, `render ${info.duration} vs plan ${shots.duration_s}`);
  assert.equal(info.width, 1920);
  assert.ok(info.hasAudio);
  assert.ok(Math.abs(qc.metrics.lufs - -14) <= 1.5, `loudness ${qc.metrics.lufs}`);
  assert.ok(shots.shots.some((s) => s.visual_type === 'MAP' && s.motion_file));
  assert.ok(shots.shots.some((s) => s.visual_type === 'FLOW' && s.flow_file));
  assert.ok(shots.overlays.some((o) => o.kind === 'label'));
  const upload = readJson(project.file('upload.json'));
  assert.equal(upload.altered_or_synthetic_content, true);

  // Re-running a finished project does no work.
  const again = [];
  await runProject(config, brief.project_id, { llm: createLlm(config), log: (l) => again.push(l) });
  assert.equal(again.length, 0, again.join('\n'));
  assert.equal(projectStatus(config, brief.project_id).status, 'done');
  fs.rmSync(tmp, { recursive: true, force: true });
});

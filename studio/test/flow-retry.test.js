import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { runFlow } from '../core/stages/flow.js';
import { loadConfig } from '../core/config.js';
import { loadStyle } from '../core/style.js';

test('Flow shots get platform features up front, and a rejected take is corrected on retry', { timeout: 120000 }, async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'studio-flow-'));
  const config = loadConfig({ assetsDir: path.join(dir, 'assets'), testMode: false, flow: { mode: 'synthetic' } });
  const style = loadStyle(config, 'military');
  const files = {};
  const project = {
    id: 'P', dir, brief: { flow_budget: { max_generations: 50 } },
    subdir: (n) => { const d = path.join(dir, n); fs.mkdirSync(d, { recursive: true }); return d; },
    read: (n, _s, fallback) => files[n] ?? fallback,
    write: (n, v) => { files[n] = v; },
    log: () => {},
  };
  const prompts = [];
  let specCalls = 0;
  let qcCalls = 0;
  const llm = {
    async json({ stage, prompt }) {
      if (stage === 'flow_spec') { specCalls += 1; return { constraints: ['eight engines in four underwing pods', 'tall single vertical tail'] }; }
      assert.equal(stage, 'flowqc');
      qcCalls += 1;
      prompts.push(prompt);
      // First take of the first shot shows the wrong engine count; everything after is fine.
      return qcCalls === 1
        ? { verdict: 'rejected', usable_from: 0, usable_to: 1, issues: ['shows six engines instead of eight'] }
        : { verdict: 'approved', usable_from: 0, usable_to: 1, issues: [] };
    },
  };
  const need = { subject: 'bomber takeoff', platform: 'B-52H', action: 'takeoff', mood: [] };
  const shotList = { shots: [
    { shot_id: 'SH-1', visual_type: 'FLOW', mode: 'CINEMATIC', duration_s: 4, need, flow: { reconstruction: true, spec: {} } },
    { shot_id: 'SH-2', visual_type: 'FLOW', mode: 'CINEMATIC', duration_s: 4, need, flow: { reconstruction: true, spec: {} } },
  ] };
  try {
    await runFlow({ project, shotList, style, config, llm, hardwareChecklist: 'engine count' });
    const results = files['flow_results.json'].results;
    const sh1 = results.find((r) => r.shot_id === 'SH-1');
    assert.equal(sh1.attempt, 2);
    assert.match(sh1.prompt, /eight engines in four underwing pods/);
    assert.match(sh1.prompt, /previous attempt was rejected[^\n]*six engines instead of eight/);
    assert.ok(shotList.shots.every((s) => s.flow_file));
    assert.equal(specCalls, 1, 'features of one platform are written once');
    // ...and kept for the next video.
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(config.assetsDir, 'platform-constraints.json'), 'utf8'))['b-52h'], ['eight engines in four underwing pods', 'tall single vertical tail']);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

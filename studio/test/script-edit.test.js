import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runScriptEdit } from '../core/stages/editorial.js';
import { loadConfig } from '../core/config.js';
import { loadStyle } from '../core/style.js';

const style = loadStyle(loadConfig(), 'military');
const research = { claims: [{ claim_id: 'C-001', text: 'The B-52H first flew in 1961 and 76 remain in service with Air Force Global Strike Command.', confidence: 'confirmed' }] };
const outline = { title: 'Why the B-52 Will Outlive Its Replacements', central_question: 'Why?', answer: 'Because.', acts: style.acts.map((a) => ({ act: a.act, name: a.name })) };
const seg = (seg_id, act, text, claims = []) => ({ seg_id, act, beat_id: 'B', text, claims, tone: 'normal', purpose: 'I', density: 'medium', mode: 'INFORMATION', pron: [], stats: [] });

test('the story editor may sharpen the script but never add facts, numbers or names', async () => {
  const script = {
    version: 1, title: outline.title, words: 0, est_duration_s: 0,
    segments: [
      seg('S-01-01', 1, 'There is a bomber that is older than the pilots who fly it, and it is still flying today.'),
      seg('S-01-02', 1, 'The B-52H first flew in 1961, and 76 of them remain in service.', ['C-001']),
      seg('S-02-01', 2, 'It was designed for a war that never came, at a time when nobody had heard of stealth.'),
      seg('S-02-02', 2, 'The aircraft is maintained by crews who rebuild it again and again.'),
    ],
  };
  const llm = {
    async json({ stage, prompt }) {
      assert.equal(stage, 'script_edit');
      assert.match(prompt, /C-001: The B-52H first flew in 1961/);
      return {
        edits: [
          { seg_id: 'S-01-01', text: "There's a bomber older than the pilots who fly it. [PAUSE 0.5] And it's still flying.", reason: 'hook, spoken' },
          { seg_id: 'S-01-02', text: 'The B-52H first flew in 1961, and 76 of them still fly with Air Force Global Strike Command.', reason: 'fact from its claim' },
          { seg_id: 'S-02-01', text: 'It was designed in 1948 for a war that never came, before anyone had heard of stealth.', reason: 'adds a date' },
          { seg_id: 'S-02-02', text: 'Boeing crews at Tinker rebuild it again and again, keeping it alive.', reason: 'adds names' },
          { seg_id: 'S-09-09', text: 'x', reason: 'unknown' },
        ],
        notes: ['act 7 never answers the cost question'],
      };
    },
  };
  const { script: out, report } = await runScriptEdit({ llm, style, brief: { target_duration_min: 25 }, research, outline, script });
  assert.deepEqual(report.applied.map((a) => a.seg_id), ['S-01-01', 'S-01-02']);
  const why = Object.fromEntries(report.rejected.map((r) => [r.seg_id, r.why]));
  assert.match(why['S-02-01'], /new number 1948/);
  assert.match(why['S-02-02'], /new name (Boeing|Tinker)/);
  assert.equal(why['S-09-09'], 'unknown segment');
  assert.match(out.segments[0].text, /^There's a bomber/);
  assert.equal(out.segments[2].text, script.segments[2].text);
  assert.equal(out.version, 2);
  assert.deepEqual(report.notes, ['act 7 never answers the cost question']);
});

test('edits that make an act fail its lint are reverted for that act', async () => {
  const script = {
    version: 1, title: outline.title, words: 0, est_duration_s: 0,
    segments: [seg('S-02-01', 2, 'The aircraft is maintained by crews who rebuild it again and again over the years.')],
  };
  const llm = { async json() { return { edits: [{ seg_id: 'S-02-01', text: 'Crews rebuild the wings, engines, radars, and cockpits again and again.', reason: 'tighter' }], notes: [] }; } };
  const { script: out, report } = await runScriptEdit({ llm, style, brief: { target_duration_min: 25 }, research, outline, script });
  assert.equal(report.applied.length, 0);
  assert.match(report.rejected[0].why, /like a list/);
  assert.equal(out.segments[0].text, script.segments[0].text);
});

test('a retried script stage only writes the acts that did not finish', async () => {
  const { runScript } = await import('../core/stages/editorial.js');
  const { createLlm } = await import('../core/llm.js');
  const { mockResponders } = await import('./fixtures.js');
  const mock = createLlm({ llm: { provider: 'mock', mock: mockResponders() } });
  const brief = { target_duration_min: 4 };
  const research = mockResponders().research();
  const outline = mockResponders().outline();
  const saved = {};
  const checkpoint = { get: (a) => saved[a] || null, set: (a, segs) => { saved[a] = segs; } };
  // First run fails in act 4.
  let calls = 0;
  const flaky = { ...mock, async json(args) { calls += 1; if (args.prompt.includes('narration for Act 4')) throw new Error('proxy hiccup'); return mock.json(args); } };
  await assert.rejects(runScript({ llm: flaky, style, brief, research, outline, checkpoint }), /proxy hiccup/);
  assert.deepEqual(Object.keys(saved).map(Number), [1, 2, 3]);
  // The retry starts at act 4.
  const acts = [];
  const counting = { ...mock, async json(args) { acts.push(Number(args.prompt.match(/narration for Act (\d+)/)[1])); return mock.json(args); } };
  const script = await runScript({ llm: counting, style, brief, research, outline, checkpoint });
  assert.deepEqual([...new Set(acts)], [4, 5, 6, 7]);
  assert.equal(new Set(script.segments.map((s) => s.act)).size, 7);
});

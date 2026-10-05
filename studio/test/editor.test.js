import test from 'node:test';
import assert from 'node:assert/strict';
import { loadConfig } from '../core/config.js';
import { loadStyle } from '../core/style.js';
import { buildShotList, pacingMetrics } from '../core/engine/editor.js';
import { lintAct } from '../core/stages/editorial.js';
import { estimateWords, tokenize } from '../core/stages/voice.js';
import { buildFlowPrompt } from '../core/stages/flow.js';
import { parseMotion } from '../core/stages/visual.js';
import { stableStringify } from '../core/util.js';

const config = loadConfig();
const style = loadStyle(config, 'military');

function fixture() {
  const segments = [];
  const vo = { voice: { provider: 'x', id: 'x' }, segments: [] };
  const visual = { cold_open: [{ visual_type: 'REAL', need: { subject: 'ocean at dawn', platform: '', action: '', mood: [], era: '', query_terms: [] }, flow: {} }], segments: {} };
  for (let act = 1; act <= 7; act++) {
    for (let i = 0; i < 6; i++) {
      const seg_id = `S-0${act}-0${i + 1}`;
      const words = Array.from({ length: 40 }, (_, k) => `word${k}`);
      segments.push({ seg_id, act, beat_id: 'b', text: words.join(' '), claims: [], tone: 'normal', purpose: i % 3 === 2 ? 'C' : 'I', density: 'medium', mode: act % 2 ? 'CINEMATIC' : 'INFORMATION', pron: [], stats: i === 0 ? [{ value: '1,106 FT', label: 'LENGTH', claim_id: 'C-001' }] : [] });
      vo.segments.push({ seg_id, file: 'x.wav', duration_s: 16, words: words.map((w, k) => ({ w: k === 3 ? '1,106' : w, s: k * 0.4, e: k * 0.4 + 0.35 })) });
      visual.segments[seg_id] = i === 1
        ? [{ from_word: 0, visual_type: 'MAP', need: { subject: 'map', platform: '', action: '', mood: [], era: '', query_terms: [] }, motion: { template: 'map', data: { view: { center: [0, 0] }, steps: [] } } }, { from_word: 20, visual_type: 'REAL', need: { subject: 'deck', platform: '', action: '', mood: [], era: '', query_terms: [] } }]
        : [{ from_word: 0, visual_type: i === 4 ? 'FLOW' : 'REAL', need: { subject: `scene ${i}`, platform: '', action: '', mood: [], era: '', query_terms: [] }, flow: { reconstruction: true } }];
    }
  }
  return { script: { version: 1, title: 't', words: 0, est_duration_s: 0, segments }, vo, visual };
}

test('editor engine is deterministic for the same inputs', () => {
  const f = fixture();
  const a = buildShotList({ ...f, style, seed: 'P1', title: 'T' });
  const b = buildShotList({ ...f, style, seed: 'P1', title: 'T' });
  assert.equal(stableStringify(a), stableStringify(b));
});

test('editor engine respects the style profile', () => {
  const plan = buildShotList({ ...fixture(), style, seed: 'P1', title: 'T' });
  const m = pacingMetrics(plan, style);
  for (const s of plan.shots.filter((x) => ['REAL', 'ARCHIVAL', 'FLOW'].includes(x.visual_type))) {
    assert.ok(s.duration_s >= style.pacing.min_shot - 0.01, `${s.shot_id} too short ${s.duration_s}`);
    assert.ok(s.duration_s <= style.pacing.hero.max + 0.01, `${s.shot_id} too long ${s.duration_s}`);
  }
  assert.equal(plan.shots[0].transition_in, 'fade_black');
  assert.ok(plan.breaths.some((b) => b.kind === 'cold_open'));
  assert.ok(plan.shots.some((s) => s.motion?.template === 'title'), 'title card after the hook');
  assert.ok(m.black_beats >= style.black_beats.min && m.black_beats <= style.black_beats.max, `black beats ${m.black_beats}`);
  assert.ok(plan.shots.filter((s) => s.visual_type === 'FLOW').every((s) => s.label === style.labels.reconstruction));
  // VO placements never overlap and stay in order.
  for (let i = 1; i < plan.vo_placements.length; i++) {
    const p = plan.vo_placements[i - 1];
    assert.ok(plan.vo_placements[i].start_s >= p.start_s + p.duration_s - 0.001);
  }
  // Shots tile the timeline without gaps.
  for (let i = 1; i < plan.shots.length; i++) {
    const p = plan.shots[i - 1];
    assert.ok(Math.abs(plan.shots[i].start_s - (p.start_s + p.duration_s)) < 0.01, `gap before ${plan.shots[i].shot_id}`);
  }
  // Stat cards are rate limited and never sit on explainers.
  const stats = plan.overlays.filter((o) => o.kind === 'stat');
  for (let i = 1; i < stats.length; i++) assert.ok(stats[i].start_s - stats[i - 1].start_s >= style.type_cards.min_gap_s);
});

test('script lint catches banned phrases, unsourced numbers and unknown claims', () => {
  const research = { claims: [{ claim_id: 'C-001' }] };
  const seg = (text, claims = []) => ({ seg_id: 'S-01-01', text, claims, stats: [], purpose: 'I' });
  const problems = lintAct([seg("Let's dive in to the story."), seg('It is 300 meters long.'), seg('Fine.', ['C-999'])], { style, research, budget: 15, actNo: 2 });
  const msgs = problems.map((p) => p.msg).join('\n');
  assert.match(msgs, /banned phrase/);
  assert.match(msgs, /number without citing/);
  assert.match(msgs, /unknown claims/);
});

test('voice markup becomes pauses and estimated word timings stay in order', () => {
  const pieces = tokenize('It is enormous. [PAUSE 0.6] Its *position* can be tracked. [BEAT] And yet.', style);
  assert.deepEqual(pieces.filter((p) => p.pause).map((p) => p.pause), [0.6, style.narration.beat_s]);
  const words = estimateWords(pieces, 6);
  assert.equal(words.length, 10);
  for (let i = 1; i < words.length; i++) assert.ok(words[i].s >= words[i - 1].e);
  assert.equal(words[4].w, 'position');
});

test('flow prompts are assembled from the spec and the style, never free-form', () => {
  const prompt = buildFlowPrompt({ mode: 'CINEMATIC', need: { subject: 'aircraft carrier at sea', platform: 'Nimitz-class', action: 'steaming slowly', mood: ['scale'] }, flow: { reconstruction: true, spec: { constraints: ['island on the starboard side'] } } }, style);
  assert.match(prompt, /^8-second documentary reconstruction\./);
  assert.match(prompt, /island on the starboard side\./);
  assert.match(prompt, /Avoid: .*HUD overlays/);
});

test('motion data that does not fit a template is rejected', () => {
  assert.equal(parseMotion('{"template":"map","data":{"steps":[]}}'), null);
  assert.equal(parseMotion('not json'), null);
  assert.ok(parseMotion(JSON.stringify({ template: 'process', data: { steps: [{ label: 'A' }, { label: 'B' }] } })));
});

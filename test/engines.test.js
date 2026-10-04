import test from 'node:test';
import assert from 'node:assert/strict';
import { HookEngine } from '../src/hook-engine.js';
import { FashionEngine } from '../src/fashion-engine.js';
import { KineticEngine } from '../src/kinetic-engine.js';
import { GoogleAgent } from '../src/google-agent.js';
import { HookGenerateInput, FashionGenerateInput, KineticGenerateInput, parse } from '../src/schemas.js';

test('5 Commercial Engines Suite', async (t) => {
  const mockStore = {
    createJob(job) {
      return { job: { id: `job_mock_${Date.now()}`, status: 'queued', ...job }, reused: false };
    },
  };
  const mockAgent = new GoogleAgent({}, mockStore);

  await t.test('Engine 2: HookEngine generates 5 psychology-backed hooks with spoken lines', async () => {
    const engine = new HookEngine({}, mockStore, mockAgent, {});
    const input = {
      productName: 'Serum Pencerah Kulit',
      description: 'Mencerahkan kulit kusam dalam 7 hari',
      count: 5,
    };
    const valid = parse(HookGenerateInput, input);
    assert.equal(valid.error, undefined);

    const result = await engine.generateHooks(valid.data);
    assert.equal(result.totalHooks, 5);
    assert.equal(result.hooks.length, 5);
    assert.ok(result.hooks[0].spokenLine.includes('Serum Pencerah Kulit'));
    assert.ok(result.hooks[0].visualPrompt.includes('Creator speaks naturally to camera in Indonesian'));
    assert.ok(result.hooks[0].visualPrompt.includes('Audio: Clear synchronized spoken Indonesian voice'));
  });

  await t.test('Engine 3: FashionEngine generates 3-shot continuous 360 runway showcase', async () => {
    const engine = new FashionEngine({}, mockStore, mockAgent, {});
    const input = {
      outfitName: 'Gamis Silk Premium Sage Green',
      modelType: 'hijab',
      setting: 'aesthetic_studio',
      targetDuration: 20,
    };
    const valid = parse(FashionGenerateInput, input);
    assert.equal(valid.error, undefined);

    const result = await engine.planAndGenerate(valid.data);
    assert.equal(result.status, 'accepted');
    assert.equal(result.shots.length, 3);
    assert.ok(result.shots[0].visualPrompt.includes('graceful Indonesian female model wearing an elegant neutral-tone hijab'));
    assert.ok(result.shots[1].visualPrompt.includes('360-degree turnaround'));
    assert.ok(result.shots[2].visualPrompt.includes('Close-up camera highlights the premium texture weave'));
    assert.ok(result.job.request.prompts.length === 3);
  });

  await t.test('Engine 4: KineticEngine generates dynamic paper collage documentary for US-Iran topic', async () => {
    const engine = new KineticEngine({}, mockStore, mockAgent, {});
    const input = {
      topic: 'The United States and Iran',
      description: 'Active conflict and Strait of Hormuz naval tensions impacting global oil prices',
      targetDuration: 30,
    };
    const valid = parse(KineticGenerateInput, input);
    assert.equal(valid.error, undefined);

    const result = await engine.planAndGenerate(valid.data);
    assert.equal(result.status, 'accepted');
    assert.equal(result.storyboard.shots.length, 3);
    assert.ok(result.storyboard.shots[0].visualPrompt.includes('Persian Gulf, Strait of Hormuz'));
    assert.ok(result.storyboard.shots[2].visualPrompt.includes('industrial oil pressure gauge'));
    assert.ok(result.job.request.prompts.length === 3);
  });

  await t.test('Engine 4: KineticEngine generates dynamic paper collage documentary for Indonesian history topic', async () => {
    const engine = new KineticEngine({}, mockStore, mockAgent, {});
    const input = {
      topic: 'Proklamasi Kemerdekaan Indonesia',
      description: 'Peristiwa 17 Agustus 1945 pembacaan teks proklamasi kemerdekaan oleh Soekarno dan Hatta',
      targetDuration: 20,
    };
    const valid = parse(KineticGenerateInput, input);
    assert.equal(valid.error, undefined);

    const result = await engine.planAndGenerate(valid.data);
    assert.equal(result.status, 'accepted');
    assert.ok(result.storyboard.shots[0].visualPrompt.includes('Indonesian archipelago'));
    assert.ok(result.storyboard.shots[0].visualPrompt.includes('Audio: Dramatic cinematic historical orchestral strings'));
  });
});

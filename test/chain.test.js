import test from 'node:test';
import assert from 'node:assert/strict';
import { VideoChainInput, parse } from '../src/schemas.js';
import { parsePromptScenes } from '../src/chain-engine.js';

test('VideoChainInput schema validation', async (t) => {
  await t.test('accepts single prompt with targetDuration', () => {
    const input = {
      prompt: 'Cinematic drone shot over mist-covered mountains',
      targetDuration: 30,
      aspectRatio: '16:9',
      model: 'omni-1-1-flash',
    };
    const res = parse(VideoChainInput, input);
    assert.ok(res.data, 'should parse successfully');
    assert.equal(res.data.targetDuration, 30);
    assert.equal(res.data.segmentDuration, 10);
    assert.equal(res.data.aspectRatio, '16:9');
    assert.equal(res.data.mode, 'frames');
  });

  await t.test('accepts multi-shot storyboard prompts array', () => {
    const input = {
      prompts: [
        'Shot 1: Wide establishing view of futuristic metropolis',
        'Shot 2: Camera dives between neon skyscrapers',
        'Shot 3: Close-up of flying vehicle speeding past',
      ],
      targetDuration: 30,
    };
    const res = parse(VideoChainInput, input);
    assert.ok(res.data, 'should parse successfully');
    assert.equal(res.data.prompts.length, 3);
  });

  await t.test('rejects request with neither prompt nor prompts', () => {
    const input = {
      targetDuration: 20,
    };
    const res = parse(VideoChainInput, input);
    assert.ok(res.error, 'should return error');
    assert.ok(res.error.formErrors.length > 0 || Object.keys(res.error.fieldErrors).length > 0);
  });

  await t.test('rejects targetDuration outside valid range (8-120)', () => {
    const tooShort = parse(VideoChainInput, { prompt: 'Test', targetDuration: 5 });
    assert.ok(tooShort.error);

    const tooLong = parse(VideoChainInput, { prompt: 'Test', targetDuration: 300 });
    assert.ok(tooLong.error);
  });
});

test('VideoChain durable store job lifecycle', async () => {
  const os = await import('node:os');
  const path = await import('node:path');
  const fs = await import('node:fs');
  const { Store } = await import('../src/db.js');

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'flow-chain-test-'));
  try {
    const store = new Store(dir);
    const account = store.createAccount({ label: 'ChainWorker', profileName: 'chainworker' });
    store.markAccount(account.id, 'ready', 100);

    const jobResult = store.createJob({
      type: 'video_chain',
      request: {
        prompt: 'Aerial flight over rainforest',
        targetDuration: 30,
        model: 'omni-1-1-flash',
      },
      idempotencyKey: 'chain_test_key_1',
      maxAttempts: 3,
    });

    assert.equal(jobResult.reused, false);
    assert.equal(jobResult.job.type, 'video_chain');
    assert.equal(jobResult.job.state, 'queued');

    const claimed = store.claimJob('worker-chain-1', 60_000);
    assert.equal(claimed.id, jobResult.job.id);
    assert.equal(claimed.state, 'running');

    store.checkpoint(claimed.id, {
      phase: 'generating_segment',
      segmentIndex: 1,
      totalSegments: 3,
    });

    const refreshed = store.getJob(claimed.id);
    assert.equal(refreshed.checkpoint.phase, 'generating_segment');
    assert.equal(refreshed.checkpoint.segmentIndex, 1);

    store.finishJob(claimed.id, {
      type: 'video_chain',
      masterUrl: `/v1/media/chains/${claimed.id}/master.mp4`,
      totalDuration: 30,
      segmentsCount: 3,
    });

    const finished = store.getJob(claimed.id);
    assert.equal(finished.state, 'completed');
    assert.equal(finished.result.totalDuration, 30);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('parsePromptScenes splits multi-scene scripts into individual segment prompts', () => {
  const script = `
Create an Indonesian UGC video.
SCENE 0–10 SECONDS:
Creator introduces the product enthusiastically.
SCENE 10–20 SECONDS:
Creator demonstrates using the product and smiles.
VISUAL STYLE:
4k photorealistic smartphone camera.
NEGATIVE:
plastic skin, CGI.
  `.trim();

  const scenes = parsePromptScenes(script);
  assert.equal(scenes.length, 2);
  assert.ok(scenes[0].includes('Creator introduces the product'));
  assert.ok(!scenes[0].includes('Creator demonstrates using'));
  assert.ok(scenes[1].includes('Creator demonstrates using'));
  assert.ok(scenes[1].includes('4k photorealistic'));

  // Fallback for single prompt without scene markers
  const single = 'Cinematic drone shot over beach';
  assert.deepEqual(parsePromptScenes(single), [single]);
});

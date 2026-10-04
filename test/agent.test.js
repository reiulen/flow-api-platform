import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import {
  StoryboardInput,
  PromptEnhanceInput,
  UgcGenerateInput,
  parse,
} from '../src/schemas.js';
import { GoogleAgent } from '../src/google-agent.js';
import { UgcEngine } from '../src/ugc-engine.js';
import { Store } from '../src/db.js';
import * as indexExports from '../src/index.js';

test('Agent and UGC Schema validation', async (t) => {
  await t.test('StoryboardInput validates product name and defaults duration', () => {
    const parsed = parse(StoryboardInput, { productName: 'Sepatu Lari Ultralight' });
    assert.ok(parsed.data);
    assert.equal(parsed.data.productName, 'Sepatu Lari Ultralight');
    assert.equal(parsed.data.duration, 20);
  });

  await t.test('StoryboardInput rejects missing product name', () => {
    const parsed = parse(StoryboardInput, {});
    assert.ok(parsed.error);
  });

  await t.test('PromptEnhanceInput requires prompt string', () => {
    const valid = parse(PromptEnhanceInput, { prompt: 'A car driving in the rain' });
    assert.ok(valid.data);
    const invalid = parse(PromptEnhanceInput, {});
    assert.ok(invalid.error);
  });

  await t.test('UgcGenerateInput validates full options with crossfade default', () => {
    const parsed = parse(UgcGenerateInput, {
      productName: 'Smart Watch X',
      description: 'Jam pintar baterai tahan 14 hari',
      targetDuration: 30,
      aspectRatio: '9:16',
    });
    assert.ok(parsed.data);
    assert.equal(parsed.data.transition, 'crossfade');
    assert.equal(parsed.data.aspectRatio, '9:16');
  });
});

test('GoogleAgent storyboard and prompt enhancement', async (t) => {
  const agent = new GoogleAgent({}, null, null);

  await t.test('generates structured storyboard with shots, visualPrompts, and voiceovers', async () => {
    const storyboard = await agent.generateStoryboard({
      productName: 'Kopi Gayo Organik',
      description: 'Aroma wangi cokelat karamel dengan aftertaste lembut',
      targetDuration: 20,
    });

    assert.ok(storyboard.title);
    assert.ok(storyboard.hook);
    assert.equal(storyboard.targetDuration, 20);
    assert.ok(Array.isArray(storyboard.shots));
    assert.equal(storyboard.shots.length, 2);

    for (const shot of storyboard.shots) {
      assert.ok(shot.visualPrompt, 'should have visual prompt');
      assert.ok(shot.voiceover, 'should have voiceover script');
      assert.ok(shot.textOverlay, 'should have text overlay');
      assert.equal(shot.duration, 10);
    }
  });

  await t.test('enhances concise prompt with cinematic camera and lighting tags', async () => {
    const enhanced = await agent.enhancePrompt('Drone shot over mountain river');
    assert.ok(enhanced.includes('Drone shot over mountain river'));
    assert.ok(enhanced.includes('cinematic'));
    assert.ok(enhanced.includes('lighting'));
  });
});

test('UgcEngine end-to-end plan and generate registration', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'flow-ugc-test-'));
  try {
    const store = new Store(dir);
    const agent = new GoogleAgent({}, store, null);
    const ugcEngine = new UgcEngine({}, store, agent, null);

    const result = await ugcEngine.planAndGenerate({
      productName: 'Serum Niacinamide Glowing',
      description: 'Mencerahkan flek hitam dalam 7 hari',
      targetDuration: 20,
      transition: 'crossfade',
      aspectRatio: '9:16',
    });

    assert.equal(result.status, 'accepted');
    assert.ok(result.jobId.startsWith('job_'));
    assert.ok(result.storyboard);
    assert.equal(result.storyboard.shots.length, 2);

    // Verify durable job was registered in SQLite
    const fetched = store.getJob(result.jobId);
    assert.ok(fetched);
    assert.equal(fetched.type, 'video_chain');
    assert.equal(fetched.state, 'queued');
    assert.equal(fetched.request.targetDuration, 20);
    assert.equal(fetched.request.transition, 'crossfade');
    assert.equal(fetched.request.prompts.length, 2);
    assert.equal(fetched.request.aspectRatio, '9:16');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('src/index.js exports all core platform modules', () => {
  assert.ok(indexExports.FlowAdapter);
  assert.ok(indexExports.VideoChainEngine);
  assert.ok(indexExports.GoogleAgent);
  assert.ok(indexExports.UgcEngine);
  assert.ok(indexExports.BrowserPool);
  assert.ok(indexExports.JobStore);
  assert.ok(indexExports.loadConfig);
  assert.ok(indexExports.extractLastFrame);
  assert.ok(indexExports.concatenateVideos);
  assert.ok(indexExports.getVideoInfo);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { GoogleAgent } from '../src/google-agent.js';
import { AffiliateEngine } from '../src/affiliate-engine.js';
import { AFFILIATE_CONTINUITY, normalizeAffiliateStoryboard, resolveAffiliateTimeline } from '../src/affiliate-prompt.js';

function rawStoryboard(productName = 'Botol Minum Tritan Biru', duration = 18) {
  const timeline = resolveAffiliateTimeline(duration);
  return {
    title: `Storyboard ${productName}`,
    hook: 'Botol ini ringkas untuk dibawa kerja.',
    targetDuration: duration,
    creativeDirection: { styleName: 'Desk carry proof', rationale: 'Produk digunakan untuk aktivitas harian.' },
    continuityBible: {
      subject: 'one creator', product: productName, wardrobe: 'locked', environment: 'locked desk',
      props: 'bag', lighting: 'locked window light', camera: 'locked handheld lens', color: 'neutral', handoffRule: 'continue exact motion',
    },
    audioContinuity: 'Quiet desk ambience with tactile bottle and bag sounds; natural Indonesian dialogue when enabled.',
    hookAlternatives: ['Penasaran dengan tutupnya?', 'Aku pakai botol ini saat kerja.'],
    shots: timeline.segmentDurations.map((clipDuration, index) => ({
      shotIndex: index,
      role: index === 0 ? 'Hook and introduction' : 'Proof and closing',
      title: `Shot ${index + 1}`,
      duration: clipDuration,
      timeCode: 'assigned-by-server',
      visualPrompt: `Single continuous shot, no scene cuts. Natural vertical product demo of ${productName}, exact translucent blue material and flip lid.`,
      visualCue: `Peragakan detail produk tahap ${index + 1}.`,
      scriptCue: `Ini detail produk tahap ${index + 1}.`,
    })),
    copywriting: {
      primaryHook: 'Botol ringkas untuk aktivitas harian.',
      caption: 'Lihat bentuk, tutup, dan ukurannya langsung di video.',
      hashtags: ['#botolminum', '#reviewproduk', '#belanjaonline'],
      usps: ['Bahan Tritan sesuai deskripsi'],
      pinnedComment: 'Mau lihat bagian tutup atau ukuran botol lebih dekat?',
    },
  };
}

test('affiliate timeline composes every selectable duration from Flow clip capabilities', () => {
  for (const duration of [10, 14, 18, 20, 24, 26, 30]) {
    const timeline = resolveAffiliateTimeline(duration);
    assert.equal(timeline.segmentDurations.reduce((sum, value) => sum + value, 0), duration);
    assert.ok(timeline.segmentDurations.every((value) => [4, 6, 8, 10].includes(value)));
  }
});

test('affiliate storyboard normalization derives structure and continuity from duration', () => {
  const normalized = normalizeAffiliateStoryboard(rawStoryboard(), 'Botol Minum Tritan Biru', { duration: 18 });
  assert.deepEqual(normalized.shots.map((shot) => shot.duration), [10, 8]);
  assert.deepEqual(normalized.shots.map((shot) => shot.timeCode), ['00:00 - 00:10', '00:10 - 00:18']);
  assert.ok(normalized.shots[1].visualPrompt.startsWith(AFFILIATE_CONTINUITY.continuationPrefix));
  assert.equal(normalized.framePrompts.length, normalized.shots.length);
  for (const shot of normalized.shots) assert.ok(shot.visualPrompt.includes('[Audio Continuity]'));
});

test('affiliate planning uses 9router result and forwards image references', async () => {
  const calls = [];
  const router = {
    async generateJson(request) {
      calls.push(request);
      return { data: rawStoryboard(), model: 'cx/test-model' };
    },
  };
  const agent = new GoogleAgent({}, null, null, router);
  const storyboard = await agent.generateAffiliateStoryboard({
    productName: 'Botol Minum Tritan Biru',
    description: 'Botol Tritan biru transparan dengan tutup flip.',
    productImages: ['data:image/png;base64,AAAA'],
    duration: 18,
    niche: 'auto',
    character: { id: 'auto_creator', avatar: 'data:image/png;base64,BBBB' },
  });
  assert.equal(storyboard.planningProvider, '9router');
  assert.equal(storyboard.planningModel, 'cx/test-model');
  assert.deepEqual(calls[0].images, ['data:image/png;base64,AAAA', 'data:image/png;base64,BBBB']);
});

test('affiliate render waits for approved references and registers exact clip durations', async () => {
  const jobs = [];
  const store = {
    createJob(input) {
      jobs.push(input);
      return { job: { id: 'job_affiliate_test', ...input }, reused: false };
    },
  };
  const agent = {
    async generateAffiliateStoryboard(input) {
      return {
        ...normalizeAffiliateStoryboard(rawStoryboard('Botol Minum Tritan Biru', input.duration), 'Botol Minum Tritan Biru', { duration: input.duration }),
        planningProvider: '9router',
        planningModel: 'cx/test-model',
      };
    },
  };
  const engine = new AffiliateEngine({}, store, agent, null);
  const plan = await engine.plan({ productName: 'Botol Minum Tritan Biru', duration: 24, character: { id: 'none', isNone: true } });
  const references = plan.storyboard.shots.map((_, index) => `https://example.com/frame-${index}.png`);
  const result = await engine.planAndGenerate({
    productName: 'Botol Minum Tritan Biru',
    duration: 24,
    startFrame: references[0],
    referenceFrames: references,
    storyboard: plan.storyboard,
  });
  assert.equal(result.jobId, 'job_affiliate_test');
  assert.equal(jobs[0].request.transition, 'cut');
  assert.deepEqual(jobs[0].request.segmentDurations, [8, 8, 8]);
  assert.equal(jobs[0].request.startFrame, references[0]);
  assert.deepEqual(result.clipFrames.map((shot) => shot.thumbnailUrl), references);
});

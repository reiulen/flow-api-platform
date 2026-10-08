import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { AssetDb, detectSegments, needKey, reviewAsset, usableShots } from '../core/stages/assets.js';
import { buildEdl } from '../core/stages/edit.js';
import { buildNatTrack } from '../core/render.js';
import { runVoice } from '../core/stages/voice.js';
import { loadConfig } from '../core/config.js';
import { loadStyle } from '../core/style.js';
import { ffprobe, run } from '../core/util.js';

const tmpDir = (name) => fs.mkdtempSync(path.join(os.tmpdir(), `studio-${name}-`));

// Two visually different scenes (4 s grey, 4 s white) with a tone, like a short archive clip.
async function twoSceneClip(file, { audio = true } = {}) {
  const args = ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'color=c=0x303030:s=320x180:r=30:d=4', '-f', 'lavfi', '-i', 'color=c=white:s=320x180:r=30:d=4'];
  if (audio) args.push('-f', 'lavfi', '-i', 'sine=frequency=330:sample_rate=48000:duration=8');
  args.push('-filter_complex', '[0][1]concat=n=2:v=1:a=0[v]', '-map', '[v]');
  if (audio) args.push('-map', '2:a', '-c:a', 'aac');
  args.push('-c:v', 'libx264', '-pix_fmt', 'yuv420p', file);
  await run('ffmpeg', args);
}

test('scene detection never offers the unscanned tail of a long clip as one clean shot', async () => {
  const dir = tmpDir('scenes');
  const file = path.join(dir, 'clip.mp4');
  await twoSceneClip(file, { audio: false });
  // Pretend the clip is 600 s long but only 6 s are scanned.
  const segs = await detectSegments(file, 600, { assets: { sceneScanMaxSeconds: 6 } });
  assert.ok(segs.length >= 1);
  assert.ok(segs.every((s) => s.out <= 6), JSON.stringify(segs));
  assert.ok(segs[0].out < 4.1, 'the cut at 4 s splits the shots');
  fs.rmSync(dir, { recursive: true, force: true });
});

test('usable shots: defects are dropped, strongest relevance and taste come first', () => {
  const asset = { kind: 'video', segments: [{ in: 0, out: 5 }, { in: 5, out: 15 }, { in: 15, out: 30 }] };
  const review = [
    { in: 0, out: 5, relevance: 3, defects: ['slate'], taste: 2 },
    { in: 5, out: 15, relevance: 2, defects: [], taste: 0 },
    { in: 15, out: 30, relevance: 2, defects: [], taste: 2 },
  ];
  assert.deepEqual(usableShots(asset, review, 2).map((s) => s.in), [15, 5]);
  assert.equal(usableShots(asset, review, 3).length, 0);
  // Unreviewed assets only count in the weak pass, like the old text-only matching.
  assert.equal(usableShots(asset, null, 2).length, 0);
  assert.equal(usableShots(asset, null, 1).length, 3);
});

test('footage review looks at every shot once per need and falls back when the model fails', async () => {
  const dir = tmpDir('review');
  const config = loadConfig({ assetsDir: dir, testMode: false });
  const style = loadStyle(config, 'military');
  const db = new AssetDb(config);
  try {
    const rel = 'files/test/clip.mp4';
    fs.mkdirSync(path.join(dir, 'files', 'test'), { recursive: true });
    await twoSceneClip(path.join(dir, rel));
    const asset = { asset_id: 'A-test', kind: 'video', source: 'dvids', title: 'B-52H takeoff', description: '', file: rel, segments: [{ in: 0.25, out: 3.75 }, { in: 4.25, out: 7.75 }] };
    const need = { subject: 'bomber takeoff', platform: 'B-52H', action: 'takeoff', era: '' };
    let calls = 0;
    let images = 0;
    const llm = { async json(args) { calls += 1; images = args.images.length; assert.equal(args.stage, 'footage'); return { frames: [{ index: 1, relevance: 3, defects: [], taste: 2 }, { index: 2, relevance: 1, defects: ['Slate'], taste: 0 }] }; } };
    const review = await reviewAsset({ db, llm, asset, need, style, config });
    assert.equal(images, 2);
    assert.deepEqual(review.map((r) => [r.relevance, r.defects]), [[3, []], [1, ['slate']]]);
    // Cached per asset and need.
    await reviewAsset({ db, llm, asset, need, style, config });
    assert.equal(calls, 1);
    assert.ok(db.review('A-test', needKey(need)));
    // A failing model leaves the decision to text matching.
    const broken = { async json() { throw new Error('proxy down'); } };
    assert.equal(await reviewAsset({ db, llm: broken, asset, need: { ...need, action: 'landing' }, style, config }), null);
  } finally {
    db.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('a shot without media is covered by clean neighbour time, then a gentle slow-down', () => {
  const dir = tmpDir('edl');
  const config = loadConfig({ assetsDir: dir });
  const style = loadStyle(config, 'military');
  const db = new AssetDb(config);
  fs.mkdirSync(path.join(dir, 'files'), { recursive: true });
  for (const id of ['A', 'B']) {
    fs.writeFileSync(path.join(dir, 'files', `${id}.mp4`), '');
    db.put({ asset_id: `A-${id}`, kind: 'video', source: 't', source_id: id, file: `files/${id}.mp4`, segments: [{ in: 0, out: 10 }] });
  }
  db.close();
  const shot = (id, start, dur, extra) => ({ shot_id: id, start_s: start, duration_s: dur, visual_type: 'REAL', shot_class: 'footage', transition_in: 'cut', ...extra });
  const shotList = {
    duration_s: 15,
    shots: [
      shot('S1', 0, 5, { asset_id: 'A-A', asset_range: { in: 2, out: 7, speed: 1 } }), // 3 s of clean room after
      shot('S2', 5, 6, {}), // missing
      shot('S3', 11, 4, { asset_id: 'A-B', asset_range: { in: 5, out: 9, speed: 1 } }), // 1 s of room after
    ],
    overlays: [{ overlay_id: 'OV-1', kind: 'stat', shot_id: 'S2', start_s: 6, duration_s: 2, data: {}, motion_file: 'motion/stat.mov' }],
  };
  try {
    const { edl, repairs } = buildEdl({ project: { dir }, shotList, style, config });
    assert.equal(repairs.length, 1);
    assert.equal(edl.clips.length, 2);
    const [a, b] = edl.clips;
    assert.ok(Math.abs(a.duration_s + b.duration_s - 15) < 0.01, 'timeline length is kept');
    // Prev used its 3 s of room, next its 1 s; the remaining 2 s came from slowing down (>= 0.7x).
    assert.ok(a.speed >= 0.7 && b.speed >= 0.7, `${a.speed} ${b.speed}`);
    assert.ok(a.duration_s * a.speed <= 8 + 0.01, 'prev never plays past its clean shot');
    assert.ok(b.src_in + b.duration_s * b.speed <= 10 + 0.01, 'next never plays past its clean shot');
    assert.equal(b.start_s + b.duration_s, 15);
    // The number card that sat over the missing shot is kept.
    assert.equal(a.overlays.length + b.overlays.length, 1);
    assert.ok(a.nat && b.nat);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('natural sound sits exactly under its clip and stays silent elsewhere', async () => {
  const dir = tmpDir('nat');
  const src = path.join(dir, 'clip.mp4');
  await twoSceneClip(src);
  const config = loadConfig({});
  const style = loadStyle(config, 'military');
  const edl = { clips: [
    { kind: 'video', src, src_in: 1, speed: 1, duration_s: 3, nat: true },
    { kind: 'image', src: null, src_in: 0, speed: 1, duration_s: 2, nat: false },
    { kind: 'video', src, src_in: 2, speed: 0.8, duration_s: 4, nat: true },
  ] };
  try {
    const nat = await buildNatTrack(edl, style, dir, 2);
    const info = await ffprobe(nat);
    assert.ok(Math.abs(info.duration - 9) < 0.05, `nat track ${info.duration}s`);
    const level = async (from, len) => {
      const { stderr } = await run('ffmpeg', ['-v', 'info', '-ss', String(from), '-t', String(len), '-i', nat, '-af', 'volumedetect', '-f', 'null', '-']);
      return Number(stderr.match(/mean_volume: (-?[\d.]+) dB/)[1]);
    };
    assert.ok(await level(0.5, 2) > -40, 'sound under the first clip');
    assert.ok(await level(3.3, 1.4) < -80, 'silence under the still image');
    assert.ok(await level(5.5, 3) > -40, 'sound under the slowed clip');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

function toneWav(seconds, rate = 24000) {
  const pcm = Buffer.alloc(Math.round(seconds * rate) * 2);
  for (let i = 0; i < pcm.length / 2; i++) pcm.writeInt16LE(Math.round(6000 * Math.sin((2 * Math.PI * 200 * i) / rate)), i * 2);
  const h = Buffer.alloc(44);
  h.write('RIFF', 0); h.writeUInt32LE(36 + pcm.length, 4); h.write('WAVE', 8); h.write('fmt ', 12); h.writeUInt32LE(16, 16);
  h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22); h.writeUInt32LE(rate, 24); h.writeUInt32LE(rate * 2, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34);
  h.write('data', 36); h.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([h, pcm]);
}

test('inworld voices get real break tags for script pauses', async () => {
  const inputs = [];
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (d) => { body += d; });
    req.on('end', () => { inputs.push(JSON.parse(body)); res.writeHead(200, { 'content-type': 'audio/wav' }); res.end(toneWav(2)); });
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  process.env.NINE_ROUTER_BASE_URL = `http://127.0.0.1:${server.address().port}/v1`;
  process.env.NINE_ROUTER_API_KEY = 'test';
  const dir = tmpDir('inworld');
  const project = { dir, subdir: (n) => { const d = path.join(dir, n); fs.mkdirSync(d, { recursive: true }); return d; } };
  const segments = [{ seg_id: 'S-01-01', act: 1, text: 'It still flies. [PAUSE 1.0] Nobody planned for that. [BEAT]', pron: [], tone: 'normal' }];
  try {
    await (runVoice({ project, script: { segments }, voice: { provider: 'inworld', voice: 'Tristan', model: 'inworld-tts-2' }, style: { narration: { wpm: 150, beat_s: 2 } }, config: { voice: { chunkSeconds: 0, rpm: 0, align: { model: '' } } } }));
    assert.match(inputs[0].input, /flies\. <break time="1\.0s" \/> Nobody/);
    assert.match(inputs[0].input, /that\. <break time="2\.0s" \/>/);
    assert.equal(inputs[0].model, 'inworld/inworld-tts-2/Tristan');
  } finally {
    server.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('map infographics: icon grids, pies and insets parse and the inset is drawn with its highlight', async () => {
  const { parseMotion } = await import('../core/stages/visual.js');
  const { insetPaths } = await import('../core/geo.js');
  const map = parseMotion(JSON.stringify({ template: 'map', data: { view: { center: [45, 20] }, steps: [
    { type: 'icons', lon: 55, lat: 25, icon: 'person', count: 20, total: 35, label: 'SAUDI POPULATION', role: 'success' },
    { type: 'pie', lon: 36, lat: 16, percent: 95, value: '-95%', label: 'RED SEA EXPORTS' },
    { type: 'inset', center: [-79.5, 22], scale: 18, highlight: ['Cuba'], label: 'SECOND FRONT' },
  ] } }));
  assert.deepEqual(map.data.steps.map((s) => s.type), ['icons', 'pie', 'inset']);
  assert.equal(map.data.steps[2].position, 'tr');
  // count above total is a contradiction: the whole map falls back to footage.
  assert.equal(parseMotion(JSON.stringify({ template: 'map', data: { view: { center: [45, 20] }, steps: [{ type: 'icons', lon: 55, lat: 25, icon: 'coin', count: 40, total: 10 }] } })), null);
  const { createRequire } = await import('node:module');
  const require = createRequire(import.meta.url);
  const topojson = require('topojson-client');
  const countries = require('world-atlas/countries-50m.json');
  const features = topojson.feature(countries, countries.objects.countries).features;
  const w = { byName: new Map(features.map((f) => [f.properties.name.toLowerCase(), f])) };
  const inset = insetPaths(w, { center: [-79.5, 22], scale: 18, highlight: ['Cuba'] });
  assert.ok(inset.land.length > 1000 && inset.hi.length > 100, 'land and the highlighted country are drawn');
  assert.ok(inset.hi.length < inset.land.length);
});

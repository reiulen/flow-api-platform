import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { runVoice } from '../core/stages/voice.js';
import { wordWeight } from '../core/align.js';

// Fake 9router TTS: tone per word, silence for word gaps, commas, sentence ends, "..." and paragraph breaks.
function speak(text) {
  const rate = 24000;
  const parts = [];
  const tone = (d) => { const n = Math.round(d * rate); const b = Buffer.alloc(n * 2); for (let i = 0; i < n; i++) b.writeInt16LE(Math.round(8000 * Math.sin((2 * Math.PI * 200 * i) / rate)), i * 2); parts.push(b); };
  const gap = (d) => parts.push(Buffer.alloc(Math.round(d * rate) * 2));
  gap(0.1);
  for (const tok of text.split(/(\n\n|\.\.\.)|\s+/).filter(Boolean)) {
    if (tok === '\n\n') { gap(0.7); continue; }
    if (tok === '...') { gap(0.5); continue; }
    tone(wordWeight(tok) * 0.12);
    gap(/[.!?]$/.test(tok) ? 0.45 : /,$/.test(tok) ? 0.25 : 0.04);
  }
  gap(0.3);
  const pcm = Buffer.concat(parts);
  const h = Buffer.alloc(44);
  h.write('RIFF', 0); h.writeUInt32LE(36 + pcm.length, 4); h.write('WAVE', 8); h.write('fmt ', 12); h.writeUInt32LE(16, 16);
  h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22); h.writeUInt32LE(rate, 24); h.writeUInt32LE(rate * 2, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34);
  h.write('data', 36); h.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([h, pcm]);
}

test('rate-limited voices are generated per chunk and split back into segments', async () => {
  const requests = [];
  let limited = false;
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (d) => { body += d; });
    req.on('end', () => {
      // First call is rate limited once, with a Retry-After header.
      if (!limited) { limited = true; res.writeHead(429, { 'retry-after': '1' }); return res.end('slow down'); }
      requests.push(JSON.parse(body).input);
      res.writeHead(200, { 'content-type': 'audio/wav' });
      res.end(speak(JSON.parse(body).input));
    });
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  process.env.NINE_ROUTER_BASE_URL = `http://127.0.0.1:${server.address().port}/v1`;
  process.env.NINE_ROUTER_API_KEY = 'test';
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vo-'));
  const project = { dir, subdir: (n) => { const d = path.join(dir, n); fs.mkdirSync(d, { recursive: true }); return d; } };
  const texts = [
    'The bomber first flew in 1952. It was meant to serve for twenty years.',
    'Seventy years later, it still flies. [PAUSE 1.0] Nobody planned for that.',
    'The reason is simple, and it is not the airframe.',
    'It is the bomb bay.',
    'A second act starts here, with a new question.',
    'Why keep an old design flying?',
  ];
  const segments = texts.map((text, i) => ({ seg_id: `S-0${i < 4 ? 1 : 2}-0${i + 1}`, act: i < 4 ? 1 : 2, text, pron: [], tone: 'normal' }));
  const style = { narration: { wpm: 150, beat_s: 2 } };
  const config = { voice: { chunkSeconds: 90, rpm: 0, align: { model: '' } } };
  try {
    const vo = await runVoice({ project, script: { segments }, voice: { provider: 'nine_router', voice: 'Puck' }, style, config });
    assert.equal(requests.length, 2, 'one request per act');
    assert.equal(vo.segments.length, 6);
    for (const [i, s] of vo.segments.entries()) {
      const n = texts[i].replace(/\[PAUSE [\d.]+\]/g, '').split(/\s+/).filter(Boolean).length;
      assert.equal(s.words.length, n, s.seg_id);
      assert.ok(s.words[0].s < 0.2, `${s.seg_id} starts with speech (${s.words[0].s})`);
      assert.ok(s.duration_s > s.words.at(-1).e, `${s.seg_id} keeps its last word`);
      assert.ok(s.duration_s - s.words.at(-1).e < 0.6, `${s.seg_id} has no long tail (${s.duration_s} vs ${s.words.at(-1).e})`);
    }
    // A second run reuses everything.
    await runVoice({ project, script: { segments }, voice: { provider: 'nine_router', voice: 'Puck' }, style, config });
    assert.equal(requests.length, 2);
    // Editing one segment re-voices only its chunk.
    segments[4] = { ...segments[4], text: 'A second act starts here, with a better question.' };
    await runVoice({ project, script: { segments }, voice: { provider: 'nine_router', voice: 'Puck' }, style, config });
    assert.equal(requests.length, 3);
    assert.match(requests[2], /better question/);
    assert.doesNotMatch(requests[2], /bomber/);
  } finally {
    server.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { z } from 'zod';
import { createLlm, parseJsonLoose } from '../core/llm.js';

test('loose JSON parsing takes fenced or embedded objects', () => {
  assert.deepEqual(parseJsonLoose('Here:\n```json\n{"a":1}\n```\nDone'), { a: 1 });
  assert.deepEqual(parseJsonLoose('note {"b":2} end'), { b: 2 });
  assert.equal(parseJsonLoose('no json here'), undefined);
});

// Fake Anthropic-compatible proxy: streams a scripted reply per request.
function fakeProxy(replies) {
  const seen = [];
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (d) => { body += d; });
    req.on('end', () => {
      const msg = JSON.parse(body);
      seen.push(msg);
      const reply = replies.shift();
      if (reply.status) { res.writeHead(reply.status, { 'content-type': 'application/json' }); return res.end(JSON.stringify({ type: 'error', error: { type: 'not_found_error', message: reply.message } })); }
      res.writeHead(200, { 'content-type': 'text/event-stream' });
      const ev = (type, data) => res.write(`event: ${type}\ndata: ${JSON.stringify({ type, ...data })}\n\n`);
      ev('message_start', { message: { id: 'm', type: 'message', role: 'assistant', model: msg.model, content: [], stop_reason: null, usage: { input_tokens: 1, output_tokens: 0 } } });
      ev('content_block_start', { index: 0, content_block: { type: 'text', text: '' } });
      ev('content_block_delta', { index: 0, delta: { type: 'text_delta', text: reply.text } });
      ev('content_block_stop', { index: 0 });
      ev('message_delta', { delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 5 } });
      ev('message_stop', {});
      res.end();
    });
  });
  return new Promise((r) => server.listen(0, '127.0.0.1', () => r({ server, seen, url: `http://127.0.0.1:${server.address().port}` })));
}

const config = (lightModel) => ({ llm: { provider: 'anthropic', model: 'main-model', lightModel, lightStages: null, effort: {} }, search: {} });

test('an invalid reply gets one repair turn instead of failing the stage', async () => {
  const { server, seen, url } = await fakeProxy([{ text: '{"count":"three"}' }, { text: '```json\n{"count":3}\n```' }]);
  process.env.ANTHROPIC_BASE_URL = url;
  process.env.ANTHROPIC_API_KEY = 'k';
  try {
    const out = await createLlm(config('')).json({ stage: 'script', system: 's', prompt: 'p', schema: z.object({ count: z.number() }) });
    assert.deepEqual(out, { count: 3 });
    assert.equal(seen.length, 2);
    assert.match(seen[1].messages.at(-1).content, /failed validation: count/);
  } finally {
    server.close();
    delete process.env.ANTHROPIC_BASE_URL;
  }
});

test('mechanical stages use the light model; an unknown light model falls back to the main one', async () => {
  const { server, seen, url } = await fakeProxy([
    { text: '{"ok":true}' }, // script -> main
    { status: 404, message: 'model: light-model not found' }, // footage -> light, unknown
    { text: '{"ok":true}' }, // footage retried on main
    { text: '{"ok":true}' }, // asset_plan -> main from now on
  ]);
  process.env.ANTHROPIC_BASE_URL = url;
  process.env.ANTHROPIC_API_KEY = 'k';
  try {
    const llm = createLlm(config('light-model'));
    const schema = z.object({ ok: z.boolean() });
    await llm.json({ stage: 'script', system: 's', prompt: 'p', schema });
    await llm.json({ stage: 'footage', system: 's', prompt: 'p', schema });
    await llm.json({ stage: 'asset_plan', system: 's', prompt: 'p', schema });
    assert.deepEqual(seen.map((m) => m.model), ['main-model', 'light-model', 'main-model', 'main-model']);
  } finally {
    server.close();
    delete process.env.ANTHROPIC_BASE_URL;
  }
});

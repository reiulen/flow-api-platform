import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { searchResearch, routerSearch } from '../core/search.js';

// Fake 9router: /v1/search returns pages served by the same server.
async function fakeRouter() {
  const seen = [];
  const server = http.createServer((req, res) => {
    if (req.url === '/v1/search') {
      let body = '';
      req.on('data', (d) => { body += d; });
      req.on('end', () => {
        const q = JSON.parse(body);
        seen.push({ q, auth: req.headers.authorization });
        const base = `http://127.0.0.1:${server.address().port}`;
        const results = [1, 2, 3].map((i) => ({ title: `${q.query} ${i}`, url: `${base}/page/${encodeURIComponent(q.query)}-${i}`, snippet: 'snippet' }));
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ provider: q.model, results }));
      });
      return;
    }
    res.writeHead(200, { 'content-type': 'text/html' });
    res.end(`<html><script>bad()</script><p>Fact from ${req.url}</p></html>`);
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  return { server, seen, url: `http://127.0.0.1:${server.address().port}` };
}

test('router search sends model, query and key', async () => {
  const { server, seen, url } = await fakeRouter();
  try {
    const out = await routerSearch({ search: { url, key: 'k1', model: 'tavily' } }, 'aegis radar');
    assert.equal(out.length, 3);
    assert.deepEqual(seen[0], { q: { model: 'tavily', query: 'aegis radar', max_results: 6 }, auth: 'Bearer k1' });
  } finally { server.close(); }
});

test('search research cites only fetched pages', async () => {
  const { server, url } = await fakeRouter();
  try {
    const config = { search: { url, key: 'k', model: 'tavily' } };
    const json = async ({ stage }) => ({ queries: stage.endsWith('-plan') ? ['q1', 'q2'] : ['q3'] });
    let corpus = '';
    const write = async (_sys, prompt) => { corpus = prompt; return 'notes'; };
    const out = await searchResearch({ config, json, write, stage: 'research', system: 's', prompt: 'p' });
    assert.equal(out.text, 'notes');
    assert.equal(out.sources.length, 9);
    assert.match(corpus, /Fact from \/page\/q1-1/);
    assert.doesNotMatch(corpus, /bad\(\)/);
  } finally { server.close(); }
});

test('search research refuses to continue with too few pages', async () => {
  const config = { search: { url: 'http://127.0.0.1:9', key: 'k', model: 'tavily' } };
  const json = async () => ({ queries: ['q'] });
  await assert.rejects(searchResearch({ config, json, write: async () => '', stage: 'research', system: 's', prompt: 'p' }), /only 0 readable pages/);
});

test('research lint rejects memory-only research (sources without verified URLs)', async () => {
  const { lintResearch } = await import('../core/stages/editorial.js');
  const src = (i, url, notes = '') => ({ source_id: `SRC-${i}`, tier: 1, title: 't', publisher: 'p', url, date: '', accessed: '', notes });
  const claims = (ids) => Array.from({ length: 20 }, (_, i) => ({ claim_id: `C-${i}`, text: 'x', sources: [ids[i % ids.length]], confidence: 'confirmed', context: '', conflicts: [] }));
  const base = { chronology: [], open_questions: [], visual_leads: [] };
  // Like a research.json written from memory: most sources have no URL.
  const memory = { ...base, sources: [src(1, 'https://www.af.mil/x'), src(2, ''), src(3, '')], claims: claims(['SRC-2', 'SRC-3', 'SRC-2', 'SRC-1']) };
  assert.throws(() => lintResearch(memory), /backed by verified sources/);
  // URLs the search never returned are flagged and do not count either.
  const invented = { ...base, sources: [src(1, 'https://a.gov/x', 'not found by search;')], claims: claims(['SRC-1']) };
  assert.throws(() => lintResearch(invented), /not found by web search/);
  const good = { ...base, sources: [src(1, 'https://a.gov/x')], claims: claims(['SRC-1']) };
  assert.equal(lintResearch(good).claims.length, 20);
});

test('a re-run reads searches and pages from the disk cache instead of the network', async () => {
  const { server, seen, url } = await fakeRouter();
  const assetsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'webcache-'));
  try {
    const config = { assetsDir, search: { url, key: 'k', model: 'tavily' } };
    const json = async ({ stage }) => ({ queries: stage.endsWith('-plan') ? ['q1', 'q2'] : ['q3'] });
    const write = async () => 'notes';
    const first = await searchResearch({ config, json, write, stage: 'research', system: 's', prompt: 'p' });
    const calls = seen.length;
    server.close();
    // The router is gone: everything must come from the cache.
    const again = await searchResearch({ config, json, write, stage: 'research', system: 's', prompt: 'p' });
    assert.equal(seen.length, calls);
    assert.deepEqual(again.sources, first.sources);
  } finally {
    server.close();
    fs.rmSync(assetsDir, { recursive: true, force: true });
  }
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
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

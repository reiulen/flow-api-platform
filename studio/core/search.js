// Web research for LLM endpoints without server-side web search (e.g. Claude behind 9router).
// The model plans queries, 9router's /v1/search finds pages, we read them, and the model writes
// notes that cite only those pages, so every fact in research.json traces back to a real URL.
import { z } from 'zod';

const UA = 'flow-api-platform-studio/0.1 (documentary research)';

export function searchConfigured(config) {
  return Boolean(config.search.url && config.search.model);
}

// 9router POST /v1/search: { model: <search provider>, query, max_results } -> { results: [{ title, url, snippet, content }] }
export async function routerSearch(config, query, maxResults = 6) {
  const { url, key, model } = config.search;
  const res = await fetch(`${url.replace(/\/$/, '')}/v1/search`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
    body: JSON.stringify({ model, query, max_results: maxResults }),
    signal: AbortSignal.timeout(30000),
  });
  if (!res.ok) throw new Error(`search ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const body = await res.json();
  return (body.results || []).map((r) => ({ title: r.title || '', url: r.url, snippet: r.snippet || '', text: r.content?.text || '' }));
}

// Readable text of an HTML page, truncated. Returns '' when it cannot be read.
export async function fetchPageText(url, maxChars = 12000) {
  try {
    const res = await fetch(url, { headers: { 'user-agent': UA, accept: 'text/html,text/plain' }, signal: AbortSignal.timeout(20000) });
    if (!res.ok || !/html|text\/plain/.test(res.headers.get('content-type') || '')) return '';
    const html = (await res.text()).slice(0, 3_000_000);
    return html
      .replace(/<(script|style|noscript|svg|nav|footer|header|form)[\s\S]*?<\/\1>/gi, ' ')
      .replace(/<\/(p|div|li|h\d|tr|br|section|article)>/gi, '\n')
      .replace(/<[^>]+>/g, '')
      .replace(/&nbsp;/g, ' ').replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>')
      .replace(/[ \t]+/g, ' ')
      .replace(/\n\s*\n+/g, '\n')
      .trim()
      .slice(0, maxChars);
  } catch {
    return '';
  }
}

const QueryPlan = z.object({ queries: z.array(z.string().min(3)).min(1).max(12) });

// json(): the provider's structured call; write(): a plain text completion (system, prompt) -> text.
export async function searchResearch({ config, json, write, stage, system, prompt, maxPages = 30 }) {
  const pages = new Map();
  const gather = async (queries) => {
    for (const q of queries) {
      const results = await routerSearch(config, q).catch(() => []);
      for (const r of results) if (r.url && !pages.has(r.url) && pages.size < maxPages) pages.set(r.url, r);
    }
    await Promise.all([...pages.values()].filter((p) => !p.text).map(async (p) => { p.text = (await fetchPageText(p.url)) || p.snippet; }));
  };

  const plan = await json({ stage: `${stage}-plan`, system, schema: QueryPlan, prompt: `${prompt}\n\nYou cannot browse. List the web search queries (up to 10) that will find the best primary and reputable sources for this research. Be specific: program names, official reports, agencies, dates.` });
  await gather(plan.queries);
  // Second round: search for what is still missing or only weakly sourced.
  const gaps = await json({ stage: `${stage}-gaps`, system, schema: QueryPlan, prompt: `${prompt}\n\nSources found so far:\n${[...pages.values()].map((p) => `- ${p.title} ${p.url}`).join('\n')}\n\nList up to 8 further search queries for what is still missing or only covered by weak sources.` });
  await gather(gaps.queries);

  const read = [...pages.values()].filter((p) => p.text);
  if (read.length < 5) throw new Error(`${stage}: web search returned only ${read.length} readable pages; check STUDIO_SEARCH_MODEL and the 9router search provider`);
  const corpus = read.map((p, i) => `[S${i + 1}] ${p.title}\nURL: ${p.url}\n${p.text}`).join('\n\n---\n\n');
  const text = await write(system, `${prompt}\n\nYou cannot browse. Use only the source texts below and cite every fact inline with its source URL. Never cite a URL that is not listed below. When sources disagree, say so.\n\n${corpus}`);
  return { text, sources: read.map((p) => ({ url: p.url, title: p.title })) };
}

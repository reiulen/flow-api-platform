import fs from 'node:fs';
import Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import { jsonrepair } from 'jsonrepair';
import { searchConfigured, searchResearch } from './search.js';

// One interface for every stage:
//   json({ stage, system, prompt, schema, images })  -> parsed object (validated by the stage's zod schema)
//   research({ stage, system, prompt, maxSearches }) -> { text, sources[] } using server-side web search
export function createLlm(config) {
  if (config.llm.provider === 'mock') return createMockLlm(config.llm.mock || {});
  if (config.llm.provider === 'nine_router' || config.llm.provider === 'gemini') return createNineRouterLlm(config);
  if (config.llm.provider === 'anthropic') return createAnthropicLlm(config);
  throw new Error(`Unknown STUDIO_LLM_PROVIDER: ${config.llm.provider}`);
}

class RefusalError extends Error {}

export const SAFETY_RETRY = `The previous attempt at this request was declined. Do the same task at public documentary level, the way RealLifeLore covers war: geography, budgets, decisions, politics and consequences. Leave out any detail about how to find, track, target, guide, defeat or evade a weapon, platform or force, even where the input contains it or asks for it. Everything else in the task stays the same.`;

// Writing and judgement (topics, outline, script, story editor, visual director, editorial review)
// run on the main model. Reading and checking run on the light model when one is set: research
// (query planning, reading sources into notes, extracting claims), footage planning and review,
// motion fill-ins, Flow QC and platform features. If the light model is unavailable, everything
// falls back to the main model for the rest of the run.
export const LIGHT_STAGES = new Set(['research', 'research-plan', 'research-gaps', 'research-notes', 'asset_plan', 'footage', 'motion_fill', 'flowqc', 'flow_spec', 'rank']);

function createAnthropicLlm(config) {
  const client = new Anthropic({ maxRetries: 4 });
  const model = config.llm.model;
  let lightModel = config.llm.lightModel || '';
  const lightStages = config.llm.lightStages ? new Set(config.llm.lightStages) : LIGHT_STAGES;
  const modelFor = (stage) => (lightModel && lightStages.has(stage) ? lightModel : model);
  const effortFor = (stage) => config.llm.effort[stage] || config.llm.effort[stage.split('-')[0]] || 'high';
  // A light model the endpoint does not know is dropped once, not retried on every call.
  async function streamWithFallback(opts, stage) {
    const first = await streamOnce(opts, stage);
    if (first.stop_reason !== 'refusal') return first;
    // A refusal is usually one detail in the input (a source page, an angle) pulling toward
    // operational territory. Retry once with the safety lens restated; a second refusal stands.
    console.log(`[llm] ${stage} declined; retrying once at public documentary level`);
    return streamOnce({ ...opts, system: [...(opts.system || []), { type: 'text', text: SAFETY_RETRY }] }, stage);
  }
  async function streamOnce(opts, stage) {
    try {
      return await client.beta.messages.stream(opts).finalMessage();
    } catch (err) {
      const unknownModel = opts.model === lightModel && /model|not[_ ]found|invalid/i.test(err.message) && [400, 404].includes(err.status);
      if (!unknownModel) throw err;
      console.log(`[llm] light model ${lightModel} unavailable (${err.message.slice(0, 100)}); using ${model} for ${stage} and every later light stage`);
      lightModel = '';
      return client.beta.messages.stream({ ...opts, model }).finalMessage();
    }
  }
  // Large stable system prompts (style rules) are cached across the many calls of a batch.
  const system = (text) => [{ type: 'text', text, cache_control: { type: 'ephemeral', ttl: '1h' } }];

  function content(prompt, images = []) {
    const blocks = images.map((file) => ({
      type: 'image',
      source: { type: 'base64', media_type: file.endsWith('.png') ? 'image/png' : 'image/jpeg', data: fs.readFileSync(file).toString('base64') },
    }));
    return [...blocks, { type: 'text', text: prompt }];
  }

  const llm = {
    name: `anthropic:${model}`,

    async json({ stage, system: sys, prompt, schema, images = [], maxTokens = 32000 }) {
      const format = betaZodOutputFormat(schema);
      const isProxy = Boolean(process.env.ANTHROPIC_BASE_URL);
      const finalPrompt = isProxy
        ? `${prompt}\n\nIMPORTANT: You MUST return ONLY a valid JSON object strictly matching this schema:\n${JSON.stringify(format.schema, null, 2)}\nOutput pure JSON without any markdown formatting, preamble, or conversational commentary.`
        : prompt;
      const messages = [{ role: 'user', content: content(finalPrompt, images) }];
      // One repair turn: an invalid reply is shown back with the exact problem, instead of failing
      // (and retrying) the whole stage.
      let problem = '';
      for (let attempt = 0; attempt < 2; attempt++) {
        const opts = {
          model: modelFor(stage),
          max_tokens: maxTokens,
          system: system(sys),
          // The schema still constrains the output, but without the SDK's parse step: a reply that
          // misses the schema must reach the repair turn below, not throw inside the SDK.
          output_config: { effort: effortFor(stage), format: { type: format.type, schema: format.schema } },
          messages,
        };
        if (!isProxy) {
          opts.betas = ['server-side-fallback-2026-07-01'];
          opts.fallbacks = 'default';
        }
        const response = await streamWithFallback(opts, stage);
        if (response.stop_reason === 'refusal') throw new RefusalError(`${stage}: model declined (${response.stop_details?.category || 'unknown'})`);
        if (response.stop_reason === 'max_tokens') throw new Error(`${stage}: output hit max_tokens`);
        const text = response.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
        const data = parseJsonLoose(text);
        if (data === undefined) problem = `the reply is not valid JSON (${text.slice(0, 80)})`;
        else {
          const parsed = schema.safeParse(data);
          if (parsed.success) return parsed.data;
          problem = `the reply failed validation: ${parsed.error.issues.slice(0, 8).map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`).join('; ')}`;
        }
        messages.push({ role: 'assistant', content: text || '{}' }, { role: 'user', content: `That reply cannot be used: ${problem}. Reply again with the complete, corrected JSON object only.` });
      }
      throw new Error(`${stage}: ${problem}`);
    },

    async research({ stage, system: sys, prompt, maxSearches = 30 }) {
      const isProxy = Boolean(process.env.ANTHROPIC_BASE_URL);
      // Behind a proxy there are no server-side search tools: search through 9router instead.
      // Never research from model memory alone; the documentary's facts must trace to real sources.
      if (isProxy) {
        if (!searchConfigured(config)) throw new Error(`${stage}: web search is not configured for the proxy; set STUDIO_SEARCH_MODEL (a search provider enabled in 9router)`);
        return searchResearch({ config, json: llm.json, write: (s, p) => writeText(s, p, `${stage}-notes`), stage, system: sys, prompt, maxPages: maxSearches });
      }
      const tools = isProxy ? [] : [
        { type: 'web_search_20260209', name: 'web_search', max_uses: maxSearches },
        { type: 'web_fetch_20260209', name: 'web_fetch', max_uses: Math.ceil(maxSearches / 2) },
      ];
      const messages = [{ role: 'user', content: prompt }];
      let final;
      for (let turn = 0; turn < 8; turn++) {
        const opts = {
          model: modelFor(stage),
          max_tokens: 64000,
          system: system(sys),
          output_config: { effort: effortFor(stage) },
          messages,
        };
        if (tools.length) opts.tools = tools;
        if (!isProxy) {
          opts.betas = ['server-side-fallback-2026-07-01'];
          opts.fallbacks = 'default';
        }
        final = await streamWithFallback(opts, stage);
        if (final.stop_reason !== 'pause_turn') break;
        messages.push({ role: 'assistant', content: final.content });
      }
      if (final.stop_reason === 'refusal') throw new RefusalError(`${stage}: model declined`);
      const text = final.content.filter((b) => b.type === 'text').map((b) => b.text).join('\n');
      const sources = [];
      for (const block of final.content) {
        if (block.type === 'web_search_tool_result' && Array.isArray(block.content)) {
          for (const r of block.content) if (r.type === 'web_search_result') sources.push({ url: r.url, title: r.title, page_age: r.page_age || '' });
        }
        if (block.type === 'text' && Array.isArray(block.citations)) {
          for (const c of block.citations) if (c.url) sources.push({ url: c.url, title: c.title || '', cited_text: c.cited_text || '' });
        }
      }
      return { text, sources };
    },
  };

  // Plain text completion through the proxy (no tools, no proxy-incompatible options).
  async function writeText(sys, prompt, stage) {
    const final = await streamWithFallback({ model: modelFor(stage), max_tokens: 64000, system: system(sys), messages: [{ role: 'user', content: prompt }] }, stage);
    if (final.stop_reason === 'refusal') throw new RefusalError(`${stage}: model declined`);
    return final.content.filter((b) => b.type === 'text').map((b) => b.text).join('\n');
  }

  return llm;
}

function createNineRouterLlm(config) {
  const baseUrl = config.search?.url || process.env.NINE_ROUTER_BASE_URL?.replace(/\/v1\/?$/, '') || 'http://127.0.0.1:20128';
  const apiKey = config.search?.key || process.env.NINE_ROUTER_API_KEY || '';
  const model = config.llm.model || 'gemini/gemini-3.5-flash-lite';
  const lightModel = config.llm.lightModel || model;
  const lightStages = config.llm.lightStages ? new Set(config.llm.lightStages) : LIGHT_STAGES;
  const modelFor = (stage) => (lightModel && lightStages.has(stage) ? lightModel : model);

  async function queryChat({ stage, sys, prompt, images = [], maxTokens = 32000 }) {
    const activeModel = modelFor(stage);
    const messages = [];
    if (sys) messages.push({ role: 'system', content: sys });

    const userContent = [];
    userContent.push({ type: 'text', text: prompt });
    for (const file of images) {
      if (fs.existsSync(file)) {
        const data = fs.readFileSync(file).toString('base64');
        const mime = file.endsWith('.png') ? 'image/png' : 'image/jpeg';
        userContent.push({ type: 'image_url', image_url: { url: `data:${mime};base64,${data}` } });
      }
    }
    messages.push({ role: 'user', content: userContent.length === 1 ? prompt : userContent });

    const timeoutMs = Number(process.env.NINE_ROUTER_TIMEOUT_MS) || 300000;
    const res = await fetch(`${baseUrl}/v1/chat/completions`, {
      method: 'POST',
      signal: AbortSignal.timeout(timeoutMs),
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: activeModel,
        messages,
        max_tokens: maxTokens,
        temperature: 0.2,
      }),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      throw new Error(`9router ${activeModel} -> ${res.status}: ${errText.slice(0, 300)}`);
    }

    const text = await res.text();
    if (text.includes('data:')) {
      let accumulated = '';
      for (const line of text.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed.startsWith('data:')) continue;
        const payload = trimmed.slice(5).trim();
        if (payload === '[DONE]') continue;
        try {
          const parsed = JSON.parse(payload);
          accumulated += parsed.choices?.[0]?.delta?.content || '';
        } catch {}
      }
      if (accumulated) return accumulated;
    }

    try {
      const parsed = JSON.parse(text);
      return parsed.choices?.[0]?.message?.content || text;
    } catch {
      return text;
    }
  }

  const llm = {
    name: `nine_router:${model}`,

    async json({ stage, system: sys, prompt, schema, images = [], maxTokens = 32000 }) {
      const format = betaZodOutputFormat(schema);
      const schemaStr = JSON.stringify(format.schema, null, 2);
      const jsonPrompt = `${prompt}\n\nIMPORTANT: You MUST return ONLY a valid JSON object strictly matching this JSON Schema:\n${schemaStr}\nOutput pure JSON without any markdown code fences or conversational commentary.`;
      let problem = '';
      for (let attempt = 0; attempt < 3; attempt++) {
        const p = attempt === 0 ? jsonPrompt : `${jsonPrompt}\n\nPrevious attempt failed: ${problem}. Fix and return ONLY a valid JSON object conforming strictly to the JSON Schema.`;
        const text = await queryChat({ stage, sys, prompt: p, images, maxTokens });
        const rawData = parseJsonLoose(text);
        if (rawData === undefined) {
          problem = `the reply is not valid JSON (${text.slice(0, 120)})`;
        } else {
          const data = normalizeJsonData(rawData);
          const parsed = schema.safeParse(data);
          if (parsed.success) return parsed.data;
          problem = `the reply failed validation: ${parsed.error.issues.slice(0, 8).map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`).join('; ')}`;
        }
      }
      throw new Error(`${stage}: ${problem}`);
    },

    async research({ stage, system: sys, prompt, maxSearches = 30 }) {
      if (!searchConfigured(config)) throw new Error(`${stage}: web search is not configured`);
      return searchResearch({ config, json: llm.json, write: (s, p) => queryChat({ stage: s, sys: '', prompt: p }), stage, system: sys, prompt, maxPages: maxSearches });
    },
  };

  return llm;
}

// JSON from a reply that may carry code fences or stray prose around it; undefined when there is none.
export function parseJsonLoose(text) {
  if (!text || typeof text !== 'string') return undefined;
  try { return JSON.parse(text); } catch {}
  
  // 1. Try markdown fence
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) {
    const raw = fence[1].trim();
    try { return JSON.parse(raw); } catch {}
    try { return JSON.parse(jsonrepair(raw)); } catch {}
  }
  
  // 2. Try slice between first { and last }
  const firstBrace = text.indexOf('{');
  const lastBrace = text.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    const candidate = text.slice(firstBrace, lastBrace + 1);
    try { return JSON.parse(candidate); } catch {}
    try { return JSON.parse(jsonrepair(candidate)); } catch {}
  }

  // 3. Try slice between first [ and last ]
  const firstBracket = text.indexOf('[');
  const lastBracket = text.lastIndexOf(']');
  if (firstBracket !== -1 && lastBracket > firstBracket) {
    const candidate = text.slice(firstBracket, lastBracket + 1);
    try { return JSON.parse(candidate); } catch {}
    try { return JSON.parse(jsonrepair(candidate)); } catch {}
  }

  // 4. Fallback to jsonrepair on entire string only if it resolves to an object or array
  try {
    const repaired = JSON.parse(jsonrepair(text));
    if (repaired && typeof repaired === 'object') return repaired;
  } catch {}

  return undefined;
}

export function normalizeJsonData(obj) {
  if (!obj || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(normalizeJsonData);
  const out = { ...obj };
  if (Array.isArray(out.text)) out.text = out.text.join(' ');
  if (out.cold_open === undefined) out.cold_open = [];
  if (Array.isArray(out.segments)) {
    out.segments = out.segments.map((s) => {
      if (s && typeof s === 'object') {
        const seg = { ...s };
        if (Array.isArray(seg.text)) seg.text = seg.text.join(' ');
        if (!Array.isArray(seg.claims)) seg.claims = [];
        if (!Array.isArray(seg.pron)) seg.pron = [];
        if (!Array.isArray(seg.stats)) seg.stats = [];
        if (Array.isArray(seg.beats)) {
          seg.beats = seg.beats.map((b) => {
            if (b && typeof b === 'object') {
              const beat = { ...b };
              if (beat.from_word !== undefined) beat.from_word = Math.round(Number(beat.from_word) || 0);
              if (beat.motion_json && typeof beat.motion_json === 'object') {
                beat.motion_json = JSON.stringify(beat.motion_json);
              } else if (typeof beat.motion_json !== 'string') {
                beat.motion_json = '';
              }
              if (!Array.isArray(beat.claims)) beat.claims = [];
              if (!beat.need || typeof beat.need !== 'object') {
                beat.need = { subject: '', platform: '', action: '', mood: [], era: '', query_terms: [] };
              } else {
                if (!Array.isArray(beat.need.mood)) beat.need.mood = [];
                if (!Array.isArray(beat.need.query_terms)) beat.need.query_terms = [];
              }
              if (!beat.flow || typeof beat.flow !== 'object') {
                beat.flow = { reconstruction: false, composition: '', camera: '', lighting: '', motion: '', constraints: [] };
              } else {
                if (!Array.isArray(beat.flow.constraints)) beat.flow.constraints = [];
                beat.flow.reconstruction = Boolean(beat.flow.reconstruction);
              }
              return beat;
            }
            return b;
          });
        }
        return seg;
      }
      return s;
    });
  }
  return out;
}

// Deterministic provider for tests and dry runs. `responders[stage](args)` returns the object.
function createMockLlm(responders) {
  const call = (stage, args) => {
    const fn = responders[stage];
    if (!fn) throw new Error(`mock llm: no responder for stage "${stage}"`);
    return structuredClone(fn(args));
  };
  return {
    name: 'mock',
    async json(args) { return args.schema.parse(call(args.stage, args)); },
    async research(args) { return call(`${args.stage}:research`, args); },
  };
}

export { RefusalError };

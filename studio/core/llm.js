import fs from 'node:fs';
import Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import { searchConfigured, searchResearch } from './search.js';

// One interface for every stage:
//   json({ stage, system, prompt, schema, images })  -> parsed object (validated by the stage's zod schema)
//   research({ stage, system, prompt, maxSearches }) -> { text, sources[] } using server-side web search
export function createLlm(config) {
  if (config.llm.provider === 'mock') return createMockLlm(config.llm.mock || {});
  if (config.llm.provider === 'anthropic') return createAnthropicLlm(config);
  throw new Error(`Unknown STUDIO_LLM_PROVIDER: ${config.llm.provider}`);
}

class RefusalError extends Error {}

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
    const final = await streamWithFallback({ model: modelFor(stage), max_tokens: 32000, system: system(sys), messages: [{ role: 'user', content: prompt }] }, stage);
    if (final.stop_reason === 'refusal') throw new RefusalError(`${stage}: model declined`);
    return final.content.filter((b) => b.type === 'text').map((b) => b.text).join('\n');
  }

  return llm;
}

// JSON from a reply that may carry code fences or stray prose around it; undefined when there is none.
export function parseJsonLoose(text) {
  try { return JSON.parse(text); } catch {}
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) { try { return JSON.parse(fence[1].trim()); } catch {} }
  const first = text.indexOf('{');
  const last = text.lastIndexOf('}');
  if (first !== -1 && last > first) { try { return JSON.parse(text.slice(first, last + 1)); } catch {} }
  return undefined;
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

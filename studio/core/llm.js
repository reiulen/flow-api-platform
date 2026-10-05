import fs from 'node:fs';
import Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';

// One interface for every stage:
//   json({ stage, system, prompt, schema, images })  -> parsed object (validated by the stage's zod schema)
//   research({ stage, system, prompt, maxSearches }) -> { text, sources[] } using server-side web search
export function createLlm(config) {
  if (config.llm.provider === 'mock') return createMockLlm(config.llm.mock || {});
  if (config.llm.provider === 'anthropic') return createAnthropicLlm(config);
  throw new Error(`Unknown STUDIO_LLM_PROVIDER: ${config.llm.provider}`);
}

class RefusalError extends Error {}

function createAnthropicLlm(config) {
  const client = new Anthropic({ maxRetries: 4 });
  const model = config.llm.model;
  const effortFor = (stage) => config.llm.effort[stage] || 'high';
  // Large stable system prompts (style rules) are cached across the many calls of a batch.
  const system = (text) => [{ type: 'text', text, cache_control: { type: 'ephemeral', ttl: '1h' } }];

  function content(prompt, images = []) {
    const blocks = images.map((file) => ({
      type: 'image',
      source: { type: 'base64', media_type: file.endsWith('.png') ? 'image/png' : 'image/jpeg', data: fs.readFileSync(file).toString('base64') },
    }));
    return [...blocks, { type: 'text', text: prompt }];
  }

  return {
    name: `anthropic:${model}`,

    async json({ stage, system: sys, prompt, schema, images = [], maxTokens = 32000 }) {
      const format = betaZodOutputFormat(schema);
      const isProxy = Boolean(process.env.ANTHROPIC_BASE_URL);
      const finalPrompt = isProxy
        ? `${prompt}\n\nIMPORTANT: You MUST return ONLY a valid JSON object strictly matching this schema:\n${JSON.stringify(format.schema, null, 2)}\nOutput pure JSON without any markdown formatting, preamble, or conversational commentary.`
        : prompt;

      const opts = {
        model,
        max_tokens: maxTokens,
        system: system(sys),
        output_config: { effort: effortFor(stage), format },
        messages: [{ role: 'user', content: content(finalPrompt, images) }],
      };
      if (!isProxy) {
        opts.betas = ['server-side-fallback-2026-07-01'];
        opts.fallbacks = 'default';
      }
      const stream = client.beta.messages.stream(opts);
      const response = await stream.finalMessage();
      if (response.stop_reason === 'refusal') throw new RefusalError(`${stage}: model declined (${response.stop_details?.category || 'unknown'})`);
      if (response.stop_reason === 'max_tokens') throw new Error(`${stage}: output hit max_tokens`);
      const text = response.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
      let data;
      try {
        data = JSON.parse(text);
      } catch {
        const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
        if (fence) {
          try { data = JSON.parse(fence[1].trim()); } catch {}
        }
        if (!data) {
          const first = text.indexOf('{');
          const last = text.lastIndexOf('}');
          if (first !== -1 && last !== -1) {
            try { data = JSON.parse(text.slice(first, last + 1)); } catch {}
          }
        }
        if (!data) throw new Error(`${stage}: response is not valid JSON (${text.slice(0, 100)})`);
      }
      const parsed = schema.safeParse(data);
      if (!parsed.success) throw new Error(`${stage}: response failed validation: ${parsed.error.issues.slice(0, 5).map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}`);
      return parsed.data;
    },

    async research({ stage, system: sys, prompt, maxSearches = 30 }) {
      const isProxy = Boolean(process.env.ANTHROPIC_BASE_URL);
      const tools = isProxy ? [] : [
        { type: 'web_search_20260209', name: 'web_search', max_uses: maxSearches },
        { type: 'web_fetch_20260209', name: 'web_fetch', max_uses: Math.ceil(maxSearches / 2) },
      ];
      const messages = [{ role: 'user', content: prompt }];
      let final;
      for (let turn = 0; turn < 8; turn++) {
        const opts = {
          model,
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
        const stream = client.beta.messages.stream(opts);
        final = await stream.finalMessage();
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

import { z } from 'zod';
import { houseRules, visualPrompt } from '../prompts.js';
import { spokenWords } from './voice.js';

const NeedOut = z.object({
  subject: z.string(), platform: z.string(), action: z.string(), mood: z.array(z.string()), era: z.string(), query_terms: z.array(z.string()),
});
const BeatOut = z.object({
  from_word: z.number().int(),
  visual_type: z.enum(['REAL', 'ARCHIVAL', 'FLOW', 'MAP', 'TECH']),
  need: NeedOut,
  motion_json: z.string().describe('JSON for MAP/TECH beats: {"template":"map|process|compare","data":{...}}. Empty string otherwise.'),
  flow: z.object({ reconstruction: z.boolean(), composition: z.string(), camera: z.string(), lighting: z.string(), motion: z.string(), constraints: z.array(z.string()) }),
  claims: z.array(z.string()),
});
const ActVisualOut = z.object({
  cold_open: z.array(z.object({ visual_type: z.enum(['REAL', 'FLOW']), need: NeedOut, flow: BeatOut.shape.flow })).describe('Act 1 only: 2-3 atmospheric beats for the wordless cold open. Empty for other acts.'),
  segments: z.array(z.object({ seg_id: z.string(), beats: z.array(BeatOut) })),
});

// Motion data schemas. Anything that fails these falls back to footage, so templates never get bad data.
const Role = z.enum(['threat', 'friendly', 'warning', 'info', 'sensor', 'success']);
const LonLat = z.tuple([z.number().min(-180).max(180), z.number().min(-90).max(90)]);
const MapStep = z.discriminatedUnion('type', [
  z.object({ type: z.literal('highlight'), countries: z.array(z.string()).min(1), role: Role }),
  z.object({ type: z.literal('point'), lon: z.number(), lat: z.number(), label: z.string().max(32), role: Role }),
  z.object({ type: z.literal('route'), from: LonLat, via: z.array(LonLat).max(6).default([]), to: LonLat, label: z.string().max(32).default(''), role: Role }),
  z.object({ type: z.literal('ring'), lon: z.number(), lat: z.number(), radius_km: z.number().positive().max(20000), label: z.string().max(32).default(''), role: Role }),
  z.object({ type: z.literal('zoom'), center: LonLat, scale: z.number().min(0.5).max(40) }),
]);
export const MotionData = {
  map: z.object({ title: z.string().default(''), view: z.object({ center: LonLat, scale_from: z.number().default(1), scale_to: z.number().default(3) }), steps: z.array(MapStep).min(1).max(8) }),
  process: z.object({ title: z.string().default(''), steps: z.array(z.object({ label: z.string().max(24), detail: z.string().max(48).default(''), role: Role.default('info') })).min(2).max(6) }),
  compare: z.object({ title: z.string().default(''), unit: z.string().default(''), items: z.array(z.object({ label: z.string().max(24), value: z.number(), role: Role.default('info') })).min(2).max(6) }),
};

export function parseMotion(json) {
  if (!json) return null;
  try {
    const obj = JSON.parse(json);
    const schema = MotionData[obj.template];
    if (!schema) return null;
    const data = schema.safeParse(obj.data);
    return data.success ? { template: obj.template, data: data.data } : null;
  } catch {
    return null;
  }
}

export async function runVisualDirector({ llm, style, script, research }) {
  const result = { cold_open: [], segments: {} };
  for (const act of style.acts) {
    const segments = script.segments.filter((s) => s.act === act.act).map((s) => ({ ...s, words: spokenWords(s.text) }));
    if (!segments.length) continue;
    const out = await llm.json({ stage: 'visual', schema: ActVisualOut, system: houseRules(style), prompt: visualPrompt({ style, act, segments, research }) });
    if (act.act === 1) result.cold_open = out.cold_open.slice(0, 3);
    for (const seg of segments) {
      const got = out.segments.find((s) => s.seg_id === seg.seg_id);
      const beats = (got?.beats || [])
        .map((b) => normalizeBeat(b, seg.words.length))
        .sort((a, b) => a.from_word - b.from_word)
        .filter((b, i, arr) => i === 0 || b.from_word > arr[i - 1].from_word);
      if (!beats.length) beats.push(defaultBeat(seg));
      beats[0].from_word = 0;
      result.segments[seg.seg_id] = beats;
    }
  }
  return result;
}

function normalizeBeat(b, wordCount) {
  const beat = { ...b, from_word: Math.max(0, Math.min(wordCount - 1, b.from_word)) };
  if (b.visual_type === 'MAP' || b.visual_type === 'TECH') {
    const motion = parseMotion(b.motion_json);
    const fits = motion && (b.visual_type === 'MAP' ? motion.template === 'map' : motion.template !== 'map');
    if (fits) beat.motion = motion;
    else beat.visual_type = 'REAL';
  }
  delete beat.motion_json;
  return beat;
}

function defaultBeat(seg) {
  return {
    from_word: 0, visual_type: 'REAL', claims: [],
    need: { subject: seg.words.slice(0, 8).join(' '), platform: '', action: '', mood: [], era: '', query_terms: [] },
    flow: { reconstruction: false, composition: '', camera: '', lighting: '', motion: '', constraints: [] },
  };
}

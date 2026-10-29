import { z } from 'zod';
import { houseRules, visualPrompt } from '../prompts.js';
import { spokenWords } from './voice.js';
import { buildKit, montageSpecs, normalizeScene, sceneFromText, varyScenes } from '../story.js';

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

// Story genres: the director answers with scenes from a closed vocabulary (see core/story.js).
const SceneOut = z.object({
  env: z.string(), time: z.string(), pose: z.string(), pose_to: z.string(), pose_at: z.number(), face: z.string(), face_to: z.string(),
  facing: z.string(), at: z.string(), props: z.array(z.string()), hold: z.string(), say: z.string(), say_pos: z.string(), say_at: z.number(),
  underline: z.boolean(), line: z.string(), tag: z.string(), shadow: z.boolean(), fx: z.array(z.string()), cam: z.string(), flash: z.number(),
  zoom: z.string(), focus: z.string(), growth: z.number(),
});
const StoryActOut = z.object({
  cold_open: z.array(SceneOut).describe('Act 1 only: 2 atmospheric scenes for the silent first seconds. Empty for other acts.'),
  segments: z.array(z.object({ seg_id: z.string(), beats: z.array(z.object({
    from_word: z.number().int(), claims: z.array(z.string()), scene: SceneOut.nullable(),
    montage: z.array(z.object({ setup: z.string(), state: z.string(), tag: z.string(), count: z.number() })).describe('A fast loop of recurring set-ups. Empty array for a single scene.'),
  })) })),
});

// Motion data schemas. Anything that fails these falls back to footage, so templates never get bad data.
const Role = z.enum(['threat', 'friendly', 'warning', 'info', 'sensor', 'success']);
const LonLat = z.tuple([z.number().min(-180).max(180), z.number().min(-90).max(90)]);
const MapStep = z.discriminatedUnion('type', [
  z.object({ type: z.literal('highlight'), countries: z.array(z.string()).min(1), role: Role, label: z.string().max(32).default(''), legend: z.string().max(32).default(''), hatch: z.boolean().default(false) }),
  z.object({ type: z.literal('point'), lon: z.number(), lat: z.number(), label: z.string().max(32), role: Role, marker: z.enum(['chokepoint', 'dot']).optional() }),
  z.object({ type: z.literal('route'), from: LonLat, via: z.array(LonLat).max(8).default([]), to: LonLat, label: z.string().max(32).default(''), role: Role, icon: z.enum(['ship', 'plane', 'missile']).optional() }),
  z.object({ type: z.literal('pipeline'), coords: z.array(LonLat).min(2).max(12), label: z.string().max(32).default(''), role: Role.default('sensor'), legend: z.string().max(32).default('') }),
  z.object({ type: z.literal('ring'), lon: z.number(), lat: z.number(), radius_km: z.number().positive().max(20000), label: z.string().max(32).default(''), role: Role }),
  z.object({ type: z.literal('label'), lon: z.number(), lat: z.number(), text: z.string().max(32), role: Role.default('info') }),
  z.object({ type: z.literal('zoom'), center: LonLat, scale: z.number().min(0.5).max(400) }),
  z.object({ type: z.literal('callout'), lon: z.number(), lat: z.number(), value: z.string().min(1).max(16), label: z.string().max(32).default(''), role: Role.default('info') }),
  z.object({ type: z.literal('icons'), lon: z.number(), lat: z.number(), icon: z.enum(['person', 'barrel', 'coin', 'ship', 'plane', 'tank', 'missile']), count: z.number().int().min(1).max(60), total: z.number().int().min(1).max(60).optional(), label: z.string().max(40).default(''), value: z.string().max(24).default(''), role: Role.default('info') })
    .refine((s) => !s.total || s.total >= s.count, 'total must be >= count'),
  z.object({ type: z.literal('pie'), lon: z.number(), lat: z.number(), percent: z.number().min(0).max(100), value: z.string().max(12).default(''), label: z.string().max(32).default(''), role: Role.default('threat') }),
  z.object({ type: z.literal('inset'), center: LonLat, scale: z.number().min(1).max(400), position: z.enum(['tl', 'tr', 'bl', 'br']).default('tr'), highlight: z.array(z.string()).max(6).default([]), label: z.string().max(32).default(''), role: Role.default('threat') }),
]);
export const MotionData = {
  map: z.object({ title: z.string().default(''), legend: z.array(z.object({ label: z.string().max(32), role: Role })).max(4).default([]), view: z.object({ center: LonLat, scale_from: z.number().default(1), scale_to: z.number().default(3), pitch: z.number().min(0).max(50).optional(), bearing: z.number().min(-60).max(60).optional() }), steps: z.array(MapStep).min(1).max(10) }),
  story: z.any().transform((raw) => normalizeScene(raw)),
  process: z.object({ title: z.string().default(''), steps: z.array(z.object({ label: z.string().max(24), detail: z.string().max(48).default(''), role: Role.default('info') })).min(2).max(6) }),
  compare: z.object({ title: z.string().default(''), unit: z.string().default(''), source: z.string().max(90).default(''), items: z.array(z.object({ label: z.string().max(24), value: z.number(), role: Role.default('info') })).min(2).max(6) }),
  ranking: z.object({
    title: z.string().max(60), subtitle: z.string().max(40).default(''), unit: z.string().max(24).default(''), source: z.string().max(90).default(''),
    highlight: z.string().max(28).default(''), highlight_role: Role.default('warning'), note_label: z.string().max(16).default(''),
    rows: z.array(z.object({ rank: z.number().int().positive().optional(), label: z.string().max(28), value: z.number(), note: z.string().max(16).default('') })).min(3).max(12),
  }),
  trend: z.object({
    title: z.string().max(40), subtitle: z.string().max(40).default(''), unit: z.string().max(16).default(''), kind: z.enum(['bar', 'line']).default('line'),
    x: z.array(z.string().max(10)).min(3).max(40),
    series: z.array(z.object({ label: z.string().max(24), role: Role.default('threat'), values: z.array(z.number()) })).min(1).max(3),
    annotation: z.object({ at: z.string().max(10), text: z.string().max(28) }).nullable().default(null),
    source: z.string().max(90).default(''),
  }).refine((d) => d.series.every((s) => s.values.length === d.x.length), 'every series needs one value per x label'),
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

// checkpoint: { get(act), set(act, out) } keeps finished acts across a retry of this stage.
export async function runVisualDirector({ llm, style, script, research, checkpoint = null, seed = 'story' }) {
  if (style.story?.enabled) return runStoryDirector({ llm, style, script, research, checkpoint, seed });
  const isIllustrated = (style.visual_mix?.footage?.[1] || 0) === 0;
  const result = { cold_open: [], segments: {} };
  for (const act of style.acts) {
    const segments = script.segments.filter((s) => s.act === act.act).map((s) => ({ ...s, words: spokenWords(s.text) }));
    if (!segments.length) continue;
    let out = checkpoint?.get(act.act);
    if (!out) {
      out = await llm.json({ stage: 'visual', schema: ActVisualOut, system: houseRules(style), prompt: visualPrompt({ style, act, segments, research }) });
      checkpoint?.set(act.act, out);
    }
    if (act.act === 1) {
      result.cold_open = (out.cold_open || []).slice(0, 3).map((co) => ({
        ...co,
        visual_type: isIllustrated ? 'FLOW' : co.visual_type,
      }));
    }
    for (const seg of segments) {
      const got = out.segments.find((s) => s.seg_id === seg.seg_id);
      const beats = (got?.beats || [])
        .map((b) => normalizeBeat(b, seg.words.length, isIllustrated))
        .sort((a, b) => a.from_word - b.from_word)
        .filter((b, i, arr) => i === 0 || b.from_word > arr[i - 1].from_word);
      if (!beats.length) beats.push(defaultBeat(seg, isIllustrated));
      beats[0].from_word = 0;
      result.segments[seg.seg_id] = beats;
    }
  }
  return result;
}

function normalizeBeat(b, wordCount, isIllustrated = false) {
  const beat = { ...b, from_word: Math.max(0, Math.min(wordCount - 1, b.from_word)) };
  if (isIllustrated && (beat.visual_type === 'REAL' || beat.visual_type === 'ARCHIVAL')) {
    beat.visual_type = 'FLOW';
  }
  if (b.visual_type === 'MAP' || b.visual_type === 'TECH') {
    const motion = parseMotion(b.motion_json);
    const fits = motion && (b.visual_type === 'MAP' ? motion.template === 'map' : motion.template !== 'map');
    if (fits) beat.motion = motion;
    else beat.visual_type = isIllustrated ? 'FLOW' : 'REAL';
  }
  delete beat.motion_json;
  return beat;
}

function defaultBeat(seg, isIllustrated = false) {
  return {
    from_word: 0, visual_type: isIllustrated ? 'FLOW' : 'REAL', claims: [],
    need: { subject: seg.words.slice(0, 8).join(' '), platform: '', action: '', mood: [], era: '', query_terms: [] },
    flow: { reconstruction: false, composition: '', camera: '', lighting: '', motion: '', constraints: [] },
  };
}

function storyBeat(scene, from_word, claims = [], text = '') {
  return {
    from_word, visual_type: 'TECH', claims,
    need: { subject: scene.line || text.slice(0, 80), platform: '', action: '', mood: [], era: '', query_terms: [] },
    flow: { reconstruction: false, composition: '', camera: '', lighting: '', motion: '', constraints: [] },
    motion: { template: 'story', data: scene },
  };
}

// Never fails: a missing or broken answer for a segment is rebuilt from its own words.
async function runStoryDirector({ llm, style, script, research, checkpoint, seed }) {
  const avoid = buildKit(seed, style).avoid;
  const result = { cold_open: [], segments: {} };
  const ordered = [];
  let index = 0;
  for (const act of style.acts) {
    const segments = script.segments.filter((s) => s.act === act.act).map((s) => ({ ...s, words: spokenWords(s.text) }));
    if (!segments.length) continue;
    let out = checkpoint?.get(act.act);
    if (!out) {
      try {
        out = await llm.json({ stage: 'visual', schema: StoryActOut, system: houseRules(style), prompt: visualPrompt({ style, act, segments, research }) });
      } catch (err) {
        out = { cold_open: [], segments: [] };
      }
      checkpoint?.set(act.act, out);
    }
    if (act.act === 1) {
      const cold = (out.cold_open || []).slice(0, 3).map((c, i) => normalizeScene({ ...c, say: '', line: '', tag: '', shadow: false }, { seed, index: -1 - i, avoid }));
      result.cold_open = cold.map((scene) => ({ ...storyBeat(scene, 0), visual_type: 'TECH' }));
    }
    for (const seg of segments) {
      const got = out.segments.find((x) => x.seg_id === seg.seg_id);
      let beats = (got?.beats || []).map((b) => ({ ...b, from_word: Math.max(0, Math.min(seg.words.length - 1, b.from_word)) }))
        .sort((a, b) => a.from_word - b.from_word).filter((b, i, arr) => i === 0 || b.from_word > arr[i - 1].from_word);
      if (!beats.length) beats = [{ from_word: 0, claims: [], scene: null }];
      beats[0].from_word = 0;
      result.segments[seg.seg_id] = beats.map((b, bi) => {
        const text = seg.words.slice(b.from_word, beats[bi + 1]?.from_word ?? seg.words.length).join(' ');
        const items = b.montage && b.montage.length >= 2 ? montageSpecs(b.montage, { seed, index }) : [];
        if (items.length >= 2) { index += items.length; return { ...storyBeat(items[0], b.from_word, b.claims || [], text), motion: { template: 'story', data: { montage: items } } }; }
        const scene = b.scene ? normalizeScene(b.scene, { seed, index, avoid }) : sceneFromText(text, { seed, index, mode: seg.mode, avoid });
        index += 1;
        ordered.push(scene);
        return storyBeat(scene, b.from_word, b.claims || [], text);
      });
    }
  }
  // Neighbouring scenes must differ; the pass mutates the scene objects in place.
  varyScenes(ordered, seed);
  return result;
}

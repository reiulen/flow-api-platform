// Data contracts between pipeline stages. Mirrors studio/bibles/_common/08_PIPELINE_CONTRACTS.md.
// When this file and the bible disagree, this file is right and the bible must be updated.
import { z } from 'zod';

export const VISUAL_TYPES = ['REAL', 'ARCHIVAL', 'NEWS', 'FLOW', 'TECH', 'MAP', 'TYPE'];
export const MODES = ['CINEMATIC', 'INFORMATION'];
export const PURPOSES = ['E', 'I', 'C', 'T', 'R'];
export const DENSITIES = ['low', 'medium', 'high'];
export const TONES = ['quiet', 'normal', 'firm'];
export const CONFIDENCE = ['confirmed', 'reported', 'estimated', 'disputed'];
export const TRANSITIONS = [
  'cut', 'dissolve_short', 'dissolve', 'dissolve_slow', 'fade_black', 'match_cut',
  'page_turn', 'page_turn_reverse', 'slide_left', 'slide_right', 'parchment_reveal', 'focus_blur', 'wipe_left'
];
export const LICENSES = ['public_domain', 'open_commercial', 'stock_licensed', 'share_alike', 'non_commercial', 'editorial_only', 'fair_use_candidate', 'unknown'];
export const MOTION_TEMPLATES = ['map', 'process', 'compare', 'trend', 'ranking', 'stat', 'chapter', 'title', 'label'];

const id = z.string().min(1);

export const Brief = z.object({
  project_id: id,
  genre: z.string(),
  title_working: z.string(),
  central_question: z.string(),
  angle: z.string().default(''),
  target_duration_min: z.number().min(3).max(60).default(25),
  language: z.string().default('en'),
  audience_notes: z.string().default('General audience, no prior knowledge assumed'),
  topic_id: z.string().optional(),
  overrides: z.array(z.object({ param: z.string(), value: z.any(), reason: z.string() })).default([]),
  flow_budget: z.object({ planned_shots: z.number().int().default(16), max_generations: z.number().int().default(100) }).default({ planned_shots: 16, max_generations: 100 }),
  created_at: z.string(),
});

export const TopicCandidate = z.object({
  topic_id: id,
  title: z.string(),
  central_question: z.string(),
  angle: z.string(),
  scores: z.object({
    contradiction: z.number(), mechanism: z.number(), footage: z.number(), sources: z.number(),
    relevance: z.number(), visualization: z.number(), risk: z.number(), hype: z.number().default(3),
  }),
  footage_evidence: z.array(z.string()).default([]),
  key_sources: z.array(z.string()).default([]),
  risks: z.array(z.string()).default([]),
  total: z.number().optional(),
});
export const Topics = z.object({ generated_at: z.string(), genre: z.string(), candidates: z.array(TopicCandidate) });

export const Source = z.object({
  source_id: id, tier: z.number().int().min(1).max(4), title: z.string(), publisher: z.string(),
  url: z.string(), date: z.string().default(''), accessed: z.string().default(''), notes: z.string().default(''),
});
export const Claim = z.object({
  claim_id: id, text: z.string(), sources: z.array(z.string()).min(1),
  confidence: z.enum(CONFIDENCE), context: z.string().default(''), conflicts: z.array(z.string()).default([]),
});
export const Research = z.object({
  sources: z.array(Source).min(1),
  claims: z.array(Claim).min(1),
  chronology: z.array(z.object({ date: z.string(), event: z.string(), sources: z.array(z.string()).default([]) })).default([]),
  open_questions: z.array(z.string()).default([]),
  visual_leads: z.array(z.string()).default([]),
});

export const Beat = z.object({
  beat_id: id, summary: z.string(), claims: z.array(z.string()).default([]), mode: z.enum(MODES),
});
export const Outline = z.object({
  central_question: z.string(),
  answer: z.string(),
  title: z.string(),
  acts: z.array(z.object({
    act: z.number().int().min(1).max(10), name: z.string(), target_s: z.number(), goal: z.string(),
    beats: z.array(Beat).min(1), exit_tension: z.string(),
  })).min(1).max(10),
});

export const Segment = z.object({
  seg_id: id,
  act: z.number().int().min(1).max(10),
  beat_id: z.string(),
  text: z.string().min(1),
  claims: z.array(z.string()).default([]),
  tone: z.enum(TONES).default('normal'),
  purpose: z.enum(PURPOSES),
  density: z.enum(DENSITIES),
  mode: z.enum(MODES),
  pron: z.array(z.object({ word: z.string(), say: z.string() })).default([]),
  stats: z.array(z.object({ value: z.string(), label: z.string(), claim_id: z.string() })).default([]),
});
export const Script = z.object({
  version: z.number().int(),
  title: z.string(),
  words: z.number().int(),
  est_duration_s: z.number(),
  segments: z.array(Segment).min(1),
});

export const VoTiming = z.object({
  voice: z.object({ provider: z.string(), id: z.string() }),
  segments: z.array(z.object({
    seg_id: id, file: z.string(), duration_s: z.number(),
    words: z.array(z.object({ w: z.string(), s: z.number(), e: z.number() })),
  })),
});

export const VisualNeed = z.object({
  subject: z.string(),
  platform: z.string().default(''),
  action: z.string().default(''),
  mood: z.array(z.string()).default([]),
  era: z.string().default(''),
  query_terms: z.array(z.string()).default([]),
});

export const MotionSpec = z.object({
  template: z.enum(MOTION_TEMPLATES),
  data: z.record(z.string(), z.any()),
});

export const Shot = z.object({
  shot_id: id,
  seq_id: z.string(),
  act: z.number().int(),
  seg_refs: z.array(z.string()),
  start_s: z.number(),
  duration_s: z.number().positive(),
  mode: z.enum(MODES),
  purpose: z.enum(PURPOSES),
  density: z.enum(DENSITIES),
  visual_type: z.enum(VISUAL_TYPES),
  shot_class: z.enum(['fast', 'footage', 'hold', 'hero', 'explainer', 'black']),
  need: VisualNeed.optional(),
  motion: MotionSpec.optional(),
  flow: z.object({ reconstruction: z.boolean(), spec: z.record(z.string(), z.any()) }).optional(),
  asset_id: z.string().nullable().default(null),
  asset_range: z.object({ in: z.number(), out: z.number(), speed: z.number().min(0.5).max(1).default(1) }).nullable().default(null),
  flow_file: z.string().nullable().default(null),
  motion_file: z.string().nullable().default(null),
  transition_in: z.enum(TRANSITIONS),
  label: z.string().nullable().default(null),
  fallback_chain: z.array(z.enum(VISUAL_TYPES)).default([]),
});

export const Overlay = z.object({
  overlay_id: id, kind: z.enum(['stat', 'label', 'subscribe']), shot_id: z.string(), start_s: z.number(), duration_s: z.number(),
  data: z.record(z.string(), z.any()), motion_file: z.string().nullable().default(null),
});

export const ShotList = z.object({
  duration_s: z.number(),
  vo_placements: z.array(z.object({ seg_id: z.string(), start_s: z.number(), duration_s: z.number() })),
  breaths: z.array(z.object({ start_s: z.number(), duration_s: z.number(), kind: z.enum(['cold_open', 'act_break', 'breathing', 'black_beat']) })),
  shots: z.array(Shot).min(1),
  overlays: z.array(Overlay).default([]),
});

export const Asset = z.object({
  asset_id: id, kind: z.enum(['video', 'image']), source: z.string(), source_url: z.string(), source_id: z.string(),
  license: z.enum(LICENSES), credit: z.string(), title: z.string(), description: z.string().default(''),
  visual_type: z.enum(VISUAL_TYPES), platform: z.string().default(''), country: z.string().default(''),
  year: z.number().int().nullable().default(null), tags: z.array(z.string()).default([]),
  file: z.string().nullable().default(null), width: z.number().default(0), height: z.number().default(0),
  duration_s: z.number().default(0), segments: z.array(z.object({ in: z.number(), out: z.number() })).default([]),
  quality: z.enum(['A', 'B', 'C', 'X']).default('B'), factual_confidence: z.enum(['confirmed', 'likely', 'unverified']).default('likely'),
});

export const FlowResult = z.object({
  shot_id: id, attempt: z.number().int(), job_id: z.string().nullable(), prompt: z.string(),
  outputs: z.array(z.object({ file: z.string(), qc: z.enum(['approved', 'approved_with_trim', 'rejected', 'pending']), range: z.object({ in: z.number(), out: z.number() }).nullable().default(null), issues: z.array(z.string()).default([]) })),
  selected: z.string().nullable(),
});

export const EdlClip = z.object({
  clip_id: id, shot_id: z.string(), kind: z.enum(['video', 'image', 'motion', 'black']),
  src: z.string().nullable(), src_in: z.number().default(0), speed: z.number().default(1), start_s: z.number(), duration_s: z.number(),
  transition_in: z.object({ type: z.enum(TRANSITIONS), dur_s: z.number() }),
  look: z.boolean().default(true), nat: z.boolean().default(false), overlays: z.array(z.object({ src: z.string(), at_s: z.number(), duration_s: z.number() })).default([]),
});
export const Edl = z.object({ fps: z.number(), width: z.number(), height: z.number(), duration_s: z.number(), clips: z.array(EdlClip).min(1) });

export const AudioPlan = z.object({
  duration_s: z.number(),
  vo: z.array(z.object({ file: z.string(), start_s: z.number() })),
  music: z.array(z.object({ file: z.string(), start_s: z.number(), end_s: z.number(), function: z.string(), src_in: z.number().default(0) })),
  ambience: z.array(z.object({ file: z.string(), start_s: z.number(), end_s: z.number(), gain_db: z.number() })),
  sfx: z.array(z.object({ file: z.string(), at_s: z.number(), gain_db: z.number() })).default([]),
  vo_regions: z.array(z.object({ s: z.number(), e: z.number() })),
});

export const QcFinding = z.object({
  pass: z.number().int().min(1).max(8), level: z.enum(['blocker', 'major', 'minor']), at_s: z.number().nullable().default(null),
  rule: z.string(), detail: z.string(), fix_stage: z.string().nullable().default(null),
});
export const QcReport = z.object({
  render: z.string(), metrics: z.record(z.string(), z.any()), findings: z.array(QcFinding),
  passed: z.boolean(), human_required: z.array(z.number()).default([6, 8]),
});

export function parse(schema, value, label) {
  const result = schema.safeParse(value);
  if (!result.success) {
    const issues = result.error.issues.slice(0, 12).map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`).join('; ');
    throw new Error(`${label || 'contract'} invalid: ${issues}`);
  }
  return result.data;
}

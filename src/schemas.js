import { z } from 'zod';

export const AccountInput = z.object({
  label: z.string().min(1).max(80), email: z.string().email().optional(),
  profileName: z.string().regex(/^[a-zA-Z0-9_-]{1,64}$/), projectId: z.string().uuid().optional(),
  maxConcurrency: z.literal(1).default(1),
  priority: z.number().int().min(1).max(1000).default(100),
  cookies: z.union([z.string(), z.array(z.any()), z.record(z.string(), z.any())]).optional(),
}).strict();

export const AccountUpdate = z.object({
  label: z.string().min(1).max(80).optional(), priority: z.number().int().min(1).max(1000).optional(),
  projectId: z.string().uuid().optional(), status: z.enum(['ready','paused','action_required']).optional(),
}).strict().refine((value) => Object.keys(value).length > 0, 'Minimal satu field diperlukan');

const BaseGeneration = z.object({
  prompt: z.string().min(1).max(20_000), accountId: z.string().optional(), projectId: z.string().uuid().optional(),
  model: z.string().max(100).optional(),
  aspectRatio: z.enum(['16:9','9:16','1:1','4:3','3:4','landscape','portrait']).optional(),
  count: z.coerce.number().int().min(1).max(4).default(1), replyUrl: z.string().url().optional(),
  projectKey: z.string().regex(/^[a-zA-Z0-9_.:-]{1,128}$/).optional(),
});

export const ImageInput = BaseGeneration.extend({
  seed: z.coerce.number().int().nonnegative().optional(), references: z.array(z.string()).max(10).optional(),
}).strict();

export const VideoInput = BaseGeneration.extend({
  mode: z.enum(['frames', 'ingredients', 'frame', 'bahan']).default('frames').optional(),
  resolution: z.enum(['1080p', '720p', '360p']).default('720p').optional(),
  duration: z.coerce.number().int().min(4).max(30).default(8).optional(),
  startImage: z.string().optional(),
  endImage: z.string().optional(),
  references: z.array(z.string()).max(7).optional(),
}).strict().superRefine((value, ctx) => {
  if (value.endImage && !value.startImage) ctx.addIssue({ code: 'custom', message: 'endImage memerlukan startImage' });
});

export const VideoChainInput = z.object({
  prompt: z.string().min(1).max(20_000).optional(),
  prompts: z.array(z.string().min(1).max(20_000)).min(1).max(20).optional(),
  targetDuration: z.coerce.number().int().min(8).max(120).default(20),
  segmentDuration: z.coerce.number().int().min(4).max(10).default(10),
  aspectRatio: z.enum(['16:9','9:16','1:1','4:3','3:4','landscape','portrait']).default('16:9'),
  model: z.string().max(100).default('omni-1-1-flash'),
  resolution: z.enum(['1080p', '720p', '360p']).default('720p'),
  mode: z.enum(['frames', 'ingredients']).default('frames'),
  transition: z.enum(['cut', 'crossfade']).default('cut').optional(),
  accountId: z.string().optional(),
  projectId: z.string().uuid().optional(),
  projectKey: z.string().regex(/^[a-zA-Z0-9_.:-]{1,128}$/).optional(),
  replyUrl: z.string().url().optional(),
}).strict().superRefine((val, ctx) => {
  if (!val.prompt && (!val.prompts || val.prompts.length === 0)) {
    ctx.addIssue({ code: 'custom', message: 'Minimal salah satu dari prompt atau prompts diperlukan' });
  }
});

export const UpscaleInput = z.object({
  mediaId: z.string().optional(),
  jobId: z.string().optional(),
  targetResolution: z.enum(['1080p', '4k', '2k']).default('1080p').optional(),
  type: z.enum(['video', 'image']).default('video').optional(),
  accountId: z.string().optional(),
  projectId: z.string().uuid().optional(),
  replyUrl: z.string().url().optional(),
}).strict().refine((value) => Boolean(value.mediaId || value.jobId), 'Minimal salah satu dari mediaId atau jobId diperlukan');

export function parse(schema, value) {
  const result = schema.safeParse(value);
  return result.success ? { data: result.data } : { error: result.error.flatten() };
}

export const RoutingInput = z.object({
  strategy: z.enum(['balanced', 'round_robin', 'exhaust_first', 'project_sticky']),
  minCredits: z.number().int().min(0).max(1_000_000).default(1),
  autoFailover: z.boolean().default(true),
}).strict();

export const ProjectBindingInput = z.object({
  projectKey: z.string().regex(/^[a-zA-Z0-9_.:-]{1,128}$/), accountId: z.string().min(5),
  flowProjectId: z.string().uuid().optional(), allowFailover: z.boolean().default(true),
}).strict();

export const StoryboardInput = z.object({
  productName: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  duration: z.coerce.number().int().min(8).max(60).default(20).optional(),
  targetDuration: z.coerce.number().int().min(8).max(60).default(20).optional(),
  style: z.string().max(200).optional(),
  audience: z.string().max(200).optional(),
}).strict();

export const PromptEnhanceInput = z.object({
  prompt: z.string().min(1).max(10_000),
  style: z.string().max(200).optional(),
  camera: z.string().max(200).optional(),
  lighting: z.string().max(200).optional(),
}).strict();

export const UgcGenerateInput = z.object({
  productName: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  targetDuration: z.coerce.number().int().min(8).max(60).default(20).optional(),
  style: z.string().max(200).optional(),
  audience: z.string().max(200).optional(),
  transition: z.enum(['cut', 'crossfade']).default('crossfade').optional(),
  aspectRatio: z.enum(['16:9','9:16','1:1','4:3','3:4','landscape','portrait']).default('9:16').optional(),
  model: z.string().max(100).default('omni-1-1-flash').optional(),
  resolution: z.enum(['1080p', '720p', '360p']).default('720p').optional(),
  productImage: z.string().optional(),
  replyUrl: z.string().url().optional(),
}).strict();

export const HookGenerateInput = z.object({
  productName: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  count: z.coerce.number().int().min(1).max(10).default(5).optional(),
  autoQueueJobs: z.boolean().default(false).optional(),
  aspectRatio: z.enum(['16:9','9:16','1:1','4:3','3:4','landscape','portrait']).default('9:16').optional(),
  productImage: z.string().optional(),
  replyUrl: z.string().url().optional(),
}).strict();

export const FashionGenerateInput = z.object({
  outfitName: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  modelType: z.enum(['hijab', 'female_casual', 'male_streetwear']).default('hijab').optional(),
  setting: z.enum(['aesthetic_studio', 'outdoor_sunlit', 'minimalist_runway']).default('aesthetic_studio').optional(),
  targetDuration: z.coerce.number().int().min(8).max(30).default(20).optional(),
  clothingImage: z.string().optional(),
  replyUrl: z.string().url().optional(),
}).strict();

export const KineticGenerateInput = z.object({
  topic: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  targetDuration: z.coerce.number().int().min(10).max(60).default(30).optional(),
  startImage: z.string().optional(),
  replyUrl: z.string().url().optional(),
}).strict();

const AffiliateShotInput = z.object({
  shotIndex: z.coerce.number().int().min(0).max(7),
  role: z.string().min(1).max(300),
  title: z.string().min(1).max(300),
  duration: z.coerce.number().int().min(1).max(10),
  timeCode: z.string().min(1).max(40),
  visualPrompt: z.string().min(1).max(20_000),
  visualCue: z.string().min(1).max(2_000),
  scriptCue: z.string().max(2_000),
}).strict();

const AffiliateStoryboardInput = z.object({
  title: z.string().min(1).max(500),
  hook: z.string().min(1).max(2_000),
  targetDuration: z.coerce.number().int(),
  creativeDirection: z.object({
    styleName: z.string().min(1).max(500),
    rationale: z.string().min(1).max(2_000),
  }).strict(),
  continuityBible: z.record(z.string(), z.unknown()),
  audioContinuity: z.string().min(1).max(4_000),
  hookAlternatives: z.array(z.string().min(1).max(2_000)).min(2).max(6),
  shots: z.array(AffiliateShotInput).min(1).max(4),
  framePrompts: z.array(z.string().min(1).max(30_000)).min(1).max(4).optional(),
  copywriting: z.object({
    primaryHook: z.string().min(1).max(2_000),
    caption: z.string().min(1).max(10_000),
    hashtags: z.array(z.string().min(1).max(100)).min(3).max(8),
    usps: z.array(z.string().min(1).max(1_000)).min(1).max(5),
    pinnedComment: z.string().min(1).max(2_000),
  }).strict(),
}).passthrough();

export const AffiliateGenerateInput = z.object({
  productName: z.string().min(1).max(300),
  description: z.string().max(10000).optional(),
  productImages: z.array(z.string()).default([]).optional(),
  startFrame: z.string().nullable().optional(),
  referenceFrames: z.array(z.string()).max(4).default([]).optional(),
  audience: z.string().max(500).optional(),
  niche: z.string().max(100).default('auto').optional(),
  hook: z.string().max(100).default('auto').optional(),
  style: z.string().max(100).default('auto').optional(),
  variationNote: z.string().max(2_000).optional(),
  duration: z.union([z.literal(10), z.literal(14), z.literal(18), z.literal(20), z.literal(24), z.literal(26), z.literal(30)]).default(18).optional(),
  aspectRatio: z.enum(['16:9','9:16','1:1','4:5','4:3','3:4','landscape','portrait']).default('9:16').optional(),
  commerceFacts: z.object({
    platform: z.string().max(100).optional(),
    price: z.string().max(200).optional(),
    rating: z.string().max(100).optional(),
    soldCount: z.string().max(100).optional(),
    shopName: z.string().max(300).optional(),
    sourceUrl: z.string().url().optional(),
  }).strict().optional(),
  character: z.object({
    id: z.string().optional(),
    name: z.string().optional(),
    role: z.string().optional(),
    demographics: z.string().optional(),
    avatar: z.string().optional(),
    bodyReference: z.string().optional(),
    flowPrompt: z.string().optional(),
    isNone: z.boolean().optional(),
  }).optional(),
  voiceover: z.object({
    enabled: z.boolean().default(false).optional(),
    id: z.string().optional(),
    name: z.string().optional(),
    tone: z.string().optional(),
    cadence: z.string().optional(),
    flowPrompt: z.string().optional(),
  }).optional(),
  cta: z.object({
    enabled: z.boolean().default(false).optional(),
    id: z.string().optional(),
    label: z.string().optional(),
    platform: z.string().optional(),
    actionGesture: z.string().optional(),
    scriptCue: z.string().optional(),
  }).optional(),
  storyboard: AffiliateStoryboardInput.optional(),
  planningProvider: z.literal('9router').optional(),
  planningModel: z.string().max(200).optional(),
  replyUrl: z.string().url().optional(),
}).strict();

export const AffiliateRerollInput = z.object({
  clipNumber: z.coerce.number().int().min(1).max(4),
  productName: z.string().min(1).max(300),
  description: z.string().max(10000).optional(),
  niche: z.string().optional(),
  hook: z.string().optional(),
  style: z.string().optional(),
  duration: z.coerce.number().int().optional(),
  aspectRatio: z.string().optional(),
  character: z.object({
    id: z.string().optional(),
    name: z.string().optional(),
    flowPrompt: z.string().optional(),
    isNone: z.boolean().optional(),
  }).optional(),
  voiceover: z.object({
    enabled: z.boolean().optional(),
    name: z.string().optional(),
    cadence: z.string().optional(),
  }).optional(),
  cta: z.object({
    enabled: z.boolean().optional(),
    label: z.string().optional(),
    platform: z.string().optional(),
  }).optional(),
}).strict();

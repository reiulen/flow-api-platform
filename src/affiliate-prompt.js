import { AppError } from './errors.js';

export const AFFILIATE_TOTAL_DURATIONS = [10, 14, 18, 20, 24, 26, 30];
export const FLOW_CLIP_DURATIONS = [10, 8, 6, 4];

const CONTINUATION_PREFIX = 'Continuous seamless camera flow extending directly from the preceding frame, preserving every locked continuity detail and the exact ending motion...';
const DISALLOWED_PROMPT_TERMS = [
  'attractive', 'sexy', 'hot', 'bust', 'body size', 'sensual', 'curves', 'asmr', 'whisper', 'erotic',
];

function stringValue(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function assertString(value, field, { allowEmpty = false } = {}) {
  const result = stringValue(value);
  if (!result && !allowEmpty) throw new AppError(502, 'invalid_affiliate_storyboard', `Field ${field} kosong`);
  return result;
}

function assertSafeText(value, field) {
  const text = String(value || '').toLowerCase();
  const unsafe = DISALLOWED_PROMPT_TERMS.find((term) => {
    const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/ /g, '\\s+');
    return new RegExp(`(^|\\W)${escaped}(?=$|\\W)`, 'i').test(text);
  });
  if (unsafe) throw new AppError(502, 'unsafe_affiliate_prompt', `9router menghasilkan kosakata yang tidak aman pada ${field}`);
}

function normalizeStringArray(value, field, { min, max }) {
  if (!Array.isArray(value)) throw new AppError(502, 'invalid_affiliate_storyboard', `Field ${field} harus berupa array`);
  const result = value.map((item) => assertString(item, field)).slice(0, max);
  if (result.length < min) throw new AppError(502, 'invalid_affiliate_storyboard', `Field ${field} minimal ${min} item`);
  return result;
}

function formatTime(seconds) {
  const minutes = Math.floor(seconds / 60).toString().padStart(2, '0');
  const remainder = Math.floor(seconds % 60).toString().padStart(2, '0');
  return `${minutes}:${remainder}`;
}

export function resolveAffiliateTimeline(rawDuration) {
  const duration = Number(rawDuration);
  if (!AFFILIATE_TOTAL_DURATIONS.includes(duration)) {
    throw new AppError(400, 'invalid_affiliate_duration', `Durasi affiliate harus salah satu dari ${AFFILIATE_TOTAL_DURATIONS.join(', ')} detik`);
  }

  const solutions = [];
  const visit = (remaining, clips = []) => {
    if (remaining === 0) {
      solutions.push(clips);
      return;
    }
    for (const clipDuration of FLOW_CLIP_DURATIONS) {
      if (clipDuration <= remaining) visit(remaining - clipDuration, [...clips, clipDuration]);
    }
  };
  visit(duration);
  solutions.sort((a, b) => a.length - b.length || a.reduce((sum, value) => sum + value ** 2, 0) - b.reduce((sum, value) => sum + value ** 2, 0));
  const segmentDurations = solutions[0];
  if (!segmentDurations) throw new AppError(400, 'unsupported_affiliate_duration', 'Durasi tidak dapat dibagi ke klip Flow yang didukung');
  return { duration, segmentDurations, shotCount: segmentDurations.length };
}

function buildTimeCodes(segmentDurations) {
  let cursor = 0;
  return segmentDurations.map((duration) => {
    const start = cursor;
    cursor += duration;
    return `${formatTime(start)} - ${formatTime(cursor)}`;
  });
}

function buildFramePrompt({ shot, storyboard, productName, aspectRatio, isObjectOnly, index }) {
  const boundaryRole = index === 0
    ? 'This is the approved first frame of the complete video and the opening physical moment of shot 1.'
    : 'This is the approved ending target frame for this shot. It must be reachable naturally from the preceding clip last frame without a cut.';
  return `Create storyboard reference frame ${index + 1} for the approved affiliate concept. This is a newly generated realistic still, not existing footage. ${boundaryRole} Product: ${productName}. Preserve product identity and every verified visible detail from supplied references. ${isObjectOnly ? 'No visible face; use only handling that suits the product.' : 'Preserve the selected creator identity exactly.'} Locked continuity: ${JSON.stringify(storyboard.continuityBible)}. Intended action: ${shot.visualCue}. Shot specification: ${shot.visualPrompt}. Remove dialogue instructions, audio instructions, motion over time, captions, watermarks, interface elements, invented labels, and unsupported claims. Compose for ${aspectRatio} with realistic scale and anatomy. ${index > 0 ? 'Match the preceding storyboard frame exactly in creator, wardrobe, product, room geometry, props, lighting, lens, color, and visual style; only advance the intended action.' : ''}`;
}

export function normalizeAffiliateStoryboard(raw, productName, options = {}) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new AppError(502, 'invalid_affiliate_storyboard', 'Respons storyboard 9router bukan object JSON');
  }
  const timeline = resolveAffiliateTimeline(options.duration ?? raw.targetDuration ?? 18);
  if (!Array.isArray(raw.shots) || raw.shots.length !== timeline.shotCount) {
    throw new AppError(502, 'invalid_affiliate_storyboard', `Storyboard 9router harus berisi ${timeline.shotCount} shot`);
  }

  const timeCodes = buildTimeCodes(timeline.segmentDurations);
  const audioContinuity = assertString(raw.audioContinuity, 'audioContinuity');
  const shots = raw.shots.map((shot, index) => {
    let visualPrompt = assertString(shot?.visualPrompt, `shots[${index}].visualPrompt`);
    if (index > 0 && !visualPrompt.startsWith(CONTINUATION_PREFIX)) visualPrompt = `${CONTINUATION_PREFIX} ${visualPrompt}`;
    if (!visualPrompt.includes('[Audio Continuity]')) visualPrompt = `${visualPrompt} [Audio Continuity]: ${audioContinuity}`;
    const normalized = {
      shotIndex: index,
      role: assertString(shot?.role, `shots[${index}].role`),
      title: assertString(shot?.title, `shots[${index}].title`),
      duration: timeline.segmentDurations[index],
      timeCode: timeCodes[index],
      visualPrompt,
      visualCue: assertString(shot?.visualCue, `shots[${index}].visualCue`),
      scriptCue: options.voiceoverEnabled === false ? '' : assertString(shot?.scriptCue, `shots[${index}].scriptCue`),
    };
    assertSafeText(JSON.stringify(normalized), `shots[${index}]`);
    return normalized;
  });

  const copywriting = raw.copywriting;
  if (!copywriting || typeof copywriting !== 'object' || Array.isArray(copywriting)) {
    throw new AppError(502, 'invalid_affiliate_storyboard', 'Field copywriting tidak valid');
  }
  const normalized = {
    title: assertString(raw.title, 'title'),
    hook: assertString(raw.hook, 'hook'),
    targetDuration: timeline.duration,
    creativeDirection: {
      styleName: assertString(raw.creativeDirection?.styleName, 'creativeDirection.styleName'),
      rationale: assertString(raw.creativeDirection?.rationale, 'creativeDirection.rationale'),
    },
    continuityBible: raw.continuityBible,
    audioContinuity,
    hookAlternatives: normalizeStringArray(raw.hookAlternatives, 'hookAlternatives', { min: 2, max: 6 }),
    shots,
    copywriting: {
      primaryHook: assertString(copywriting.primaryHook, 'copywriting.primaryHook'),
      caption: assertString(copywriting.caption, 'copywriting.caption'),
      hashtags: normalizeStringArray(copywriting.hashtags, 'copywriting.hashtags', { min: 3, max: 8 }),
      usps: normalizeStringArray(copywriting.usps, 'copywriting.usps', { min: 1, max: 5 }),
      pinnedComment: assertString(copywriting.pinnedComment, 'copywriting.pinnedComment'),
    },
  };
  if (!normalized.continuityBible || typeof normalized.continuityBible !== 'object') {
    throw new AppError(502, 'invalid_affiliate_storyboard', 'continuityBible harus berupa object');
  }
  normalized.framePrompts = shots.map((shot, index) => buildFramePrompt({
    shot,
    storyboard: normalized,
    productName,
    aspectRatio: options.aspectRatio || '9:16',
    isObjectOnly: options.isObjectOnly,
    index,
  }));
  assertSafeText(JSON.stringify(normalized), 'storyboard');
  return normalized;
}

export function buildAffiliateSystemPrompt(input = {}) {
  const timeline = resolveAffiliateTimeline(input.duration ?? 18);
  const voiceoverEnabled = input.voiceover?.enabled !== false;
  const ctaEnabled = input.cta?.enabled !== false;
  return `You are the executive creative director for evidence-based TikTok Shop, Shopee, and social affiliate videos. Plan for Google Flow Gemini Omni 1.1 Flash. Return one raw JSON object only.

INPUT-DRIVEN DIRECTION:
- First analyze the product facts, reference images, audience, creator mode, chosen controls, and platform. Then select a specific creative style that fits this product. Do not default to one UGC look.
- Treat every uploaded image as identity/product evidence, never as footage. Do not invent product attributes, claims, prices, promotions, scarcity, ratings, locations, wardrobes, props, or benefits.
- Style, creator behavior, setting, palette, lighting, camera language, demonstration, foley, music, and pacing must be justified by the supplied evidence and user choices.
- A user-selected style is a direction, not a template. Adapt it to the exact product.

CONTINUITY:
- Deliver one continuous ${timeline.duration}-second narrative divided into exactly ${timeline.shotCount} Flow clips with durations ${timeline.segmentDurations.join(', ')} seconds.
- Create a detailed continuityBible object locking creator/object identity, exact product appearance, wardrobe, environment geometry, props, lighting, lens/camera state, color treatment, spatial positions, and movement handoff.
- Each shot after the first must begin with exactly: "${CONTINUATION_PREFIX}"
- End each shot in a deliberate handoff pose and motion that the next shot can continue. No reset, jump, montage, teleport, duplicate subject, location change, wardrobe change, relighting, or product mutation.
- Every visualPrompt must say "single continuous shot, no scene cuts" and include the exact same [Audio Continuity] block.

CONTENT:
- Distribute hook, product understanding, proof/demo, and closing naturally across the available shot count. A one-shot plan combines them; multi-shot plans progress without repeating beats.
- Voiceover is ${voiceoverEnabled ? 'enabled: write concise natural Indonesian dialogue that fits each shot duration' : 'disabled: scriptCue must be an empty string and prompts must state no spoken dialogue'}.
- CTA is ${ctaEnabled ? 'enabled: use the supplied CTA only in the final beat without unsupported urgency' : 'disabled: end with a natural product payoff and no cart/link/comment gesture'}.
- Use physically correct product interactions. Omit unknown facts. Preserve visible labels instead of inventing text.
- visualPrompt is English. visualCue and scriptCue are Indonesian. Avoid on-screen captions, UI overlays, and added logos.
- Never use these words: ${DISALLOWED_PROMPT_TERMS.join(', ')}.

JSON shape:
{
  "title":"string",
  "hook":"string",
  "targetDuration":${timeline.duration},
  "creativeDirection":{"styleName":"specific chosen direction","rationale":"why it fits this product and audience"},
  "continuityBible":{"subject":"string","product":"string","wardrobe":"string","environment":"string","props":"string","lighting":"string","camera":"string","color":"string","handoffRule":"string"},
  "audioContinuity":"one product-appropriate continuous audio bed; do not default to a fixed genre",
  "hookAlternatives":["evidence-based alternative 1","evidence-based alternative 2"],
  "shots":[${timeline.segmentDurations.map((duration, index) => `{"shotIndex":${index},"role":"narrative purpose","title":"specific title","duration":${duration},"timeCode":"assigned by server","visualPrompt":"English production prompt","visualCue":"Indonesian direction","scriptCue":"Indonesian dialogue or empty"}`).join(',')}],
  "copywriting":{"primaryHook":"string","caption":"string","hashtags":["#relevant1","#relevant2","#relevant3"],"usps":["verified fact"],"pinnedComment":"string"}
}`;
}

export function buildAffiliateUserPrompt(input) {
  const timeline = resolveAffiliateTimeline(input.duration ?? 18);
  const facts = {
    productName: stringValue(input.productName),
    description: stringValue(input.description),
    requestedNiche: stringValue(input.niche) || 'auto-detect from evidence',
    hookDirection: stringValue(input.hook) || 'choose dynamically',
    visualStyleDirection: stringValue(input.style) || 'choose dynamically for the product',
    audience: stringValue(input.audience),
    aspectRatio: input.aspectRatio || '9:16',
    duration: timeline,
    verifiedCommerceFacts: input.commerceFacts || {},
    character: input.character?.isNone || input.character?.id === 'none'
      ? { mode: 'object-only', visibleCreator: false }
      : { mode: 'creator', name: stringValue(input.character?.name), role: stringValue(input.character?.role), demographics: stringValue(input.character?.demographics), direction: stringValue(input.character?.flowPrompt) },
    voiceover: { enabled: input.voiceover?.enabled !== false, tone: stringValue(input.voiceover?.tone), cadence: stringValue(input.voiceover?.cadence), direction: stringValue(input.voiceover?.flowPrompt) },
    cta: { enabled: input.cta?.enabled !== false, platform: stringValue(input.cta?.platform), label: stringValue(input.cta?.label), gesture: stringValue(input.cta?.actionGesture), preferredLine: stringValue(input.cta?.scriptCue) },
    variationNote: stringValue(input.variationNote),
  };
  return `Create a review-ready production plan from these facts. The server will generate one still reference frame per shot before video rendering. Images attached after this text are evidence references.\n\n${JSON.stringify(facts, null, 2)}`;
}

export const AFFILIATE_CONTINUITY = { continuationPrefix: CONTINUATION_PREFIX };

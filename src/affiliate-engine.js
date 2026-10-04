import { AppError } from './errors.js';
import { normalizeAffiliateStoryboard, resolveAffiliateTimeline } from './affiliate-prompt.js';

export class AffiliateEngine {
  constructor(config, store, agent, adapter) {
    this.config = config;
    this.store = store;
    this.agent = agent;
    this.adapter = adapter;
  }

  async plan(input, onEvent = null) {
    const productName = input.productName?.trim();
    if (!productName) {
      throw new AppError(400, 'invalid_product_name', 'Nama produk (productName) wajib diisi');
    }
    const timeline = resolveAffiliateTimeline(input.duration ?? 18);
    onEvent?.({ type: 'status', message: `Menyiapkan timeline ${timeline.duration} detik (${timeline.shotCount} shot)...` });
    const storyboard = await this.agent.generateAffiliateStoryboard(
      { ...input, duration: timeline.duration },
      onEvent
    );
    onEvent?.({ type: 'status', message: 'Menyusun frame prompt untuk tahap visual review...' });
    return {
      storyboard,
      framePrompts: storyboard.framePrompts,
      timeline,
      planningProvider: storyboard.planningProvider,
      planningModel: storyboard.planningModel,
    };
  }

  async planAndGenerate(input, idempotencyKey = null) {
    const productName = input.productName?.trim();
    if (!productName) {
      throw new AppError(400, 'invalid_product_name', 'Nama produk (productName) wajib diisi');
    }

    const timeline = resolveAffiliateTimeline(input.duration ?? 18);
    const duration = timeline.duration;
    const aspectRatio = input.aspectRatio || '9:16';
    const productImages = Array.isArray(input.productImages) ? input.productImages.filter(Boolean) : [];
    const storyboard = input.storyboard
      ? normalizeAffiliateStoryboard(input.storyboard, productName, {
          duration,
          aspectRatio,
          isObjectOnly: input.character?.isNone || input.character?.id === 'none',
          voiceoverEnabled: input.voiceover?.enabled !== false,
        })
      : (await this.plan(input)).storyboard;

    const shots = storyboard.shots.map((shot, index) => ({
      shotIndex: index,
      title: shot.title,
      duration: shot.duration,
      timeCode: shot.timeCode,
      visualPrompt: shot.visualPrompt,
      scriptCue: shot.scriptCue,
      visualCue: shot.visualCue,
      thumbnail: input.referenceFrames?.[index] || (index === 0 ? input.startFrame : null),
    }));

    const chainJobInput = {
      type: 'video_chain',
      request: {
        prompts: shots.map((shot) => shot.visualPrompt),
        targetDuration: duration,
        segmentDuration: Math.max(...timeline.segmentDurations),
        segmentDurations: timeline.segmentDurations,
        aspectRatio,
        model: 'omni-1-1-flash',
        resolution: '720p',
        mode: 'frames',
        transition: 'cut',
        startFrame: input.startFrame || null,
        referenceFrames: input.referenceFrames || [],
        productImages,
        metadata: {
          productName,
          niche: input.niche || 'auto',
          hookId: input.hook || 'auto',
          styleId: input.style || 'auto',
          duration,
          aspectRatio,
          characterId: input.character?.id || 'none',
          characterName: input.character?.isNone ? 'Object Only' : (input.character?.name || 'Dynamic Creator'),
          useVoiceover: input.voiceover?.enabled !== false,
          useCta: input.cta?.enabled !== false,
          storyboardTitle: storyboard.title,
          planningProvider: storyboard.planningProvider || input.planningProvider || '9router',
          planningModel: storyboard.planningModel || input.planningModel || null,
          usesGeneratedConceptFrame: Boolean(input.startFrame),
          approvedReferenceFrames: input.referenceFrames || [],
        },
      },
      replyUrl: input.replyUrl || null,
      idempotencyKey: idempotencyKey || null,
      maxAttempts: this.config?.maxAttempts ?? 4,
    };

    const created = this.store.createJob(chainJobInput);
    const job = created.job;
    return {
      status: 'accepted',
      jobId: job.id,
      reused: created.reused,
      targetDuration: duration,
      aspectRatio,
      videoUrl: `/v1/jobs/${job.id}/stream`,
      masterUrl: `/v1/media/chains/${job.id}/master.mp4`,
      clipFrames: shots.map((shot, index) => ({
        clipNumber: index + 1,
        timeCode: shot.timeCode,
        title: shot.title,
        durationSeconds: shot.duration,
        prompt: shot.visualPrompt,
        scriptCue: shot.scriptCue,
        visualCue: shot.visualCue,
        thumbnailUrl: shot.thumbnail,
      })),
      copywriting: storyboard.copywriting,
      hookAlternatives: storyboard.hookAlternatives,
      planningProvider: storyboard.planningProvider || input.planningProvider || '9router',
      planningModel: storyboard.planningModel || input.planningModel || null,
      job,
    };
  }

  async rerollClip(input) {
    return this.agent.rerollAffiliateShot(input);
  }
}

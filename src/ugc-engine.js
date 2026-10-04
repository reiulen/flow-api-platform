import { AppError } from './errors.js';

export class UgcEngine {
  constructor(config, store, agent, adapter) {
    this.config = config;
    this.store = store;
    this.agent = agent;
    this.adapter = adapter;
  }

  /**
   * Plans a complete UGC video storyboard, generates voiceover audio, and registers a continuous video_chain job.
   */
  async planAndGenerate(input, idempotencyKey = null) {
    const productName = input.productName || input.product;
    if (!productName || typeof productName !== 'string') {
      throw new AppError(400, 'invalid_product_name', 'Nama produk (productName) wajib diisi');
    }

    const description = input.description || 'Produk unggulan berkualitas tinggi';
    const targetDuration = Math.min(Math.max(Number(input.targetDuration || input.duration || 20), 8), 60);
    const style = input.style || 'cinematic tiktok commercial UGC aesthetic';
    const transition = input.transition || 'crossfade';
    const aspectRatio = input.aspectRatio || '9:16'; // UGC is usually vertical by default, but customizable
    const model = input.model || 'omni-1-1-flash';
    const resolution = input.resolution || '720p';

    // 1. Generate Storyboard using Google Agent (Gemini session or cinematic fallback)
    const storyboard = await this.agent.generateStoryboard({
      productName,
      description,
      targetDuration,
      style,
      audience: input.audience,
    });

    const prompts = storyboard.shots.map((s) => s.visualPrompt);

    // 2. Register Video Chain Job
    const chainJobInput = {
      type: 'video_chain',
      request: {
        prompts,
        targetDuration,
        segmentDuration: storyboard.segmentDuration || 10,
        aspectRatio,
        model,
        resolution,
        mode: 'frames',
        transition,
        startFrame: input.productImage || input.startFrame || null,
        metadata: {
          productName,
          storyboardTitle: storyboard.title,
          hook: storyboard.hook,
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
      storyboard,
      job,
    };
  }
}


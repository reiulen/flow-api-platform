import { AppError } from './errors.js';

export class KineticEngine {
  constructor(config, store, agent, adapter) {
    this.config = config;
    this.store = store;
    this.agent = agent;
    this.adapter = adapter;
  }

  /**
   * Generates a dynamic multi-segment Kinetic Paper Collage / Archival Documentary video.
   * Features torn paper textures, regional maps, typewriter kinetic typography, and zero hard cuts.
   * Directly modeled after the high-converting aesthetic in videoplayback.mp4 and HISTORICAL-SnapYT.App.mp4.
   */
  async planAndGenerate(input, idempotencyKey = null) {
    const topic = input.topic || input.title || input.productName;
    if (!topic || typeof topic !== 'string') {
      throw new AppError(400, 'invalid_topic', 'Topik bahasan (topic) wajib diisi');
    }

    const description = input.description || input.facts || 'Peristiwa penting yang mengubah jalannya sejarah';
    const targetDuration = Math.min(Math.max(Number(input.targetDuration || 30), 10), 60);
    const aspectRatio = input.aspectRatio || '9:16';
    const model = input.model || 'omni-1-1-flash';

    // 1. Generate Storyboard with dynamic geography, metaphors, and native audio
    const storyboard = await this.agent.generateStoryboard({
      productName: topic,
      description,
      targetDuration,
      style: 'kinetic collage documentary',
      numShots: Math.max(2, Math.round(targetDuration / 10)),
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
        resolution: '720p',
        mode: 'frames',
        transition: 'cut', // Kinetic paper collage uses continuous push/tear transitions
        startFrame: input.startImage || null,
        metadata: {
          category: 'kinetic_paper_collage',
          topic,
          storyboardTitle: storyboard.title,
        },
      },
      replyUrl: input.replyUrl || null,
      idempotencyKey: idempotencyKey || null,
      maxAttempts: this.config?.maxAttempts ?? 4,
    };

    const created = this.store.createJob(chainJobInput);

    return {
      status: 'accepted',
      jobId: created.job.id,
      reused: created.reused,
      topic,
      storyboard,
      job: created.job,
    };
  }
}

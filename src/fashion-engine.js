import { AppError } from './errors.js';

export class FashionEngine {
  constructor(config, store, agent, adapter) {
    this.config = config;
    this.store = store;
    this.agent = agent;
    this.adapter = adapter;
  }

  /**
   * Generates a 3-shot continuous fashion runway showcase (360-turnaround, drape, fabric macro).
   * Perfect for Indonesian fashion brands, modest hijabwear, gamis, and streetwear.
   */
  async planAndGenerate(input, idempotencyKey = null) {
    const outfitName = input.outfitName || input.productName || input.title;
    if (!outfitName || typeof outfitName !== 'string') {
      throw new AppError(400, 'invalid_outfit_name', 'Nama pakaian/outfit (outfitName) wajib diisi');
    }

    const description = input.description || 'Pakaian busana berkualitas tinggi dengan potongan elegan';
    const modelType = input.modelType || 'hijab'; // 'hijab', 'female_casual', 'male_streetwear'
    const setting = input.setting || 'aesthetic_studio'; // 'aesthetic_studio', 'outdoor_sunlit', 'minimalist_runway'
    const targetDuration = Math.min(Math.max(Number(input.targetDuration || 20), 8), 30);
    const aspectRatio = input.aspectRatio || '9:16';
    const model = input.model || 'omni-1-1-flash';

    // Model anchor styling
    let modelAnchor = 'graceful Indonesian female model wearing an elegant neutral-tone hijab with modern modest styling';
    if (modelType === 'female_casual') {
      modelAnchor = 'stylish young Indonesian female model with natural radiant look and neat hairstyle';
    } else if (modelType === 'male_streetwear') {
      modelAnchor = 'confident young Indonesian male model with contemporary streetwear styling and clean grooming';
    }

    // Setting anchor styling
    let envAnchor = 'minimalist high-end architectural fashion studio, soft neutral microcement walls, warm natural sunlight beam, photorealistic 8k';
    if (setting === 'outdoor_sunlit') {
      envAnchor = 'scenic sunlit Mediterranean terrace courtyard, warm golden hour daylight, gentle breeze rustling lush olive trees';
    } else if (setting === 'minimalist_runway') {
      envAnchor = 'sleek dark runway catwalk with soft overhead rim spotlighting, clean architectural lines, luxury editorial aesthetic';
    }

    const shots = [
      {
        shotIndex: 0,
        title: 'Full-Body Runway Walk & Silhouette',
        duration: Math.round(targetDuration / 3),
        visualPrompt: `Full-length fashion editorial shot, 9:16 vertical framing. A ${modelAnchor} wearing ${outfitName} (${description}), walking gracefully forward in ${envAnchor}. The fabric drapes fluidly with each step. Steady smooth tracking camera, cinematic shallow depth of field, 24fps filmic motion. Audio: Clean atmospheric modern fashion lounge ambient music with subtle rhythmic beat and airy room presence.`,
      },
      {
        shotIndex: 1,
        title: 'Continuous 360 Graceful Turnaround',
        duration: Math.round(targetDuration / 3),
        visualPrompt: `Continuous seamless camera motion maintaining exact same ${modelAnchor} in identical ${envAnchor} wearing the exact same ${outfitName}. The model executes a slow, graceful 360-degree turnaround, displaying the back cut, hemline silhouette, and relaxed fit. Smooth continuous motion, identical lighting and fabric drape. Audio: Ambient runway fashion lounge music continues smoothly.`,
      },
      {
        shotIndex: 2,
        title: 'Macro Fabric Detail & Finish',
        duration: Math.round(targetDuration / 3),
        visualPrompt: `Continuous fluid push-in macro camera glide maintaining identical model and ${outfitName} in ${envAnchor}. Close-up camera highlights the premium texture weave, detailed stitching, and luxurious flow of the fabric as the model gently touches the garment. Cinematic soft flare, pristine commercial finish. Audio: Ambient fashion music reaches a smooth graceful resolution with subtle fabric rustle foley.`,
      },
    ];

    const prompts = shots.map((s) => s.visualPrompt);

    const chainJobInput = {
      type: 'video_chain',
      request: {
        prompts,
        targetDuration,
        segmentDuration: Math.round(targetDuration / shots.length),
        aspectRatio,
        model,
        resolution: '720p',
        mode: 'frames',
        transition: 'crossfade',
        startFrame: input.clothingImage || input.startFrame || null,
        metadata: {
          category: 'fashion_virtual_studio',
          outfitName,
          modelType,
          setting,
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
      outfitName,
      modelType,
      shots,
      job: created.job,
    };
  }
}

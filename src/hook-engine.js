import { AppError } from './errors.js';

export class HookEngine {
  constructor(config, store, agent, adapter) {
    this.config = config;
    this.store = store;
    this.agent = agent;
    this.adapter = adapter;
  }

  /**
   * Generates multiple high-converting 3-second opening hook variations for A/B testing.
   * Psychology archetypes: FOMO, Controversial, Relatable POV, Problem/Agitate, Secret Hack.
   */
  async generateHooks(input, idempotencyKey = null) {
    const productName = input.productName || input.product;
    if (!productName || typeof productName !== 'string') {
      throw new AppError(400, 'invalid_product_name', 'Nama produk (productName) wajib diisi');
    }

    const description = input.description || 'Produk unggulan berkualitas tinggi';
    const count = Math.min(Math.max(Number(input.count || 5), 1), 10);
    const audience = input.audience || 'Target pembeli TikTok / Shopee';
    const aspectRatio = input.aspectRatio || '9:16';
    const model = input.model || 'omni-1-1-flash';

    const hookArchetypes = [
      {
        archetype: 'FOMO / Viral Hype',
        badge: 'JANGAN SAMPAI KETINGGALAN 😱',
        script: `Sumpah gue nyesel banget baru tau ${productName} sekarang, pantesan di TikTok rame parah!`,
        action: 'Creator holds phone with wide surprised eyes, gasping slightly while revealing the product',
      },
      {
        archetype: 'Controversial / Mythbuster',
        badge: 'BENERAN BAGUS GAK SIH? 🤔',
        script: `Banyak yang bilang ${productName} ini cuma gimmick dan overhype. Mari kita buktikan sendiri.`,
        action: 'Creator looks skeptically at camera with eyebrow raised, holding product close for inspection',
      },
      {
        archetype: 'Relatable POV',
        badge: 'POV: RACUN TIKTOK TERBAIK ✨',
        script: `POV: Lu nemu racun belanjaan yang kualitasnya kayak jutaan tapi harganya masuk akal banget.`,
        action: 'Creator smiles warmly with satisfied nod, presenting product directly to lens in soft natural light',
      },
      {
        archetype: 'Problem & Agitate',
        badge: 'STOP LAKUIN KESALAHAN INI 🛑',
        script: `Kalo lu masih punya masalah sama ${description.slice(0, 40)}, lu wajib tonton ini sampai habis!`,
        action: 'Creator points hand earnestly toward camera with urgent helpful expression, holding product ready',
      },
      {
        archetype: 'Secret Discovery',
        badge: 'TEMUAN RAHASIA TAHUN INI 🤫',
        script: `Ini rahasia yang orang lain belum banyak tahu, dan ini game changer banget buat gue.`,
        action: 'Creator leans in closer to camera in a confidential, secret-sharing gesture, smiling mysteriously',
      },
    ];

    const selectedHooks = [];
    const jobs = [];

    for (let i = 0; i < count; i++) {
      const arch = hookArchetypes[i % hookArchetypes.length];
      const hookItem = {
        hookIndex: i + 1,
        archetype: arch.archetype,
        badge: arch.badge,
        spokenLine: arch.script,
        duration: 4,
        visualPrompt: `Handheld smartphone POV 9:16 vertical shot, friendly and relatable young Indonesian creator sitting in bright cozy modern room with soft window daylight. ${arch.action} (${productName}). Creator speaks naturally to camera in Indonesian saying: "${arch.script}". Audio: Clear synchronized spoken Indonesian voice, natural room acoustics. Authentic TikTok UGC creator aesthetic, photorealistic 4k.`,
      };
      selectedHooks.push(hookItem);

      // If user requested to immediately create video generation jobs for the hooks
      if (input.autoQueueJobs) {
        const jobInput = {
          type: 'video',
          request: {
            prompt: hookItem.visualPrompt,
            duration: 4,
            aspectRatio,
            model,
            resolution: '720p',
            mode: 'frames',
            startImage: input.productImage || null,
            metadata: {
              productName,
              hookIndex: i + 1,
              archetype: arch.archetype,
            },
          },
          replyUrl: input.replyUrl || null,
        };
        const created = this.store.createJob(jobInput);
        jobs.push({ hookIndex: i + 1, jobId: created.job.id, status: created.job.status });
      }
    }

    return {
      productName,
      totalHooks: selectedHooks.length,
      hooks: selectedHooks,
      queuedJobs: jobs,
    };
  }
}

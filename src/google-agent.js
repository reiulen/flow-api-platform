import { AppError } from './errors.js';
import { NineRouterClient } from './nine-router-client.js';
import {
  buildAffiliateSystemPrompt,
  buildAffiliateUserPrompt,
  normalizeAffiliateStoryboard,
} from './affiliate-prompt.js';

export class GoogleAgent {
  constructor(config, store, browsers, nineRouter = null) {
    this.config = config;
    this.store = store;
    this.browsers = browsers;
    this.nineRouter = nineRouter || new NineRouterClient(config);
  }

  /**
   * Generates a multi-shot UGC / Narrative storyboard for video generation.
   * Can use active Google Chrome Gemini session or fallback heuristic engine.
   */
  async generateStoryboard(input) {
    const productName = input.productName || input.product || 'Produk Unggulan';
    const description = input.description || input.summary || 'Solusi terbaik untuk kebutuhan harian';
    const targetDuration = Math.min(Math.max(Number(input.duration || input.targetDuration || 20), 8), 60);
    const style = input.style || 'modern cinematic UGC aesthetic';
    const audience = input.audience || 'Indonesia digital consumers';
    const numShots = targetDuration <= 10 ? 1 : (targetDuration <= 20 ? 2 : Math.min(6, Math.ceil(targetDuration / 10)));

    // Attempt browser-based Gemini session if available
    if (this.browsers) {
      try {
        const webResult = await this.queryGeminiWeb({
          task: 'storyboard',
          productName,
          description,
          targetDuration,
          style,
          audience,
          numShots,
        });
        if (webResult && Array.isArray(webResult.shots) && webResult.shots.length > 0) {
          return webResult;
        }
      } catch (err) {
        console.warn('[GoogleAgent] Gemini web session query note:', err.message, '- Using structured engine fallback');
      }
    }

    // Direct Gemini API if GEMINI_API_KEY is configured in env
    if (process.env.GEMINI_API_KEY) {
      try {
        const apiResult = await this.queryGeminiApi({
          productName,
          description,
          targetDuration,
          style,
          audience,
          numShots,
        });
        if (apiResult && Array.isArray(apiResult.shots) && apiResult.shots.length > 0) {
          return apiResult;
        }
      } catch (err) {
        console.warn('[GoogleAgent] Gemini API error:', err.message, '- Using structured engine fallback');
      }
    }

    // High quality deterministic cinematic UGC storyboard fallback
    return this.generateCinematicFallbackStoryboard({
      productName,
      description,
      targetDuration,
      style,
      audience,
      numShots,
    });
  }

  /**
   * Enhances a single user prompt for optimal Veo / Google Flow video generation.
   */
  async enhancePrompt(prompt, options = {}) {
    const raw = String(prompt || '').trim();
    if (!raw) throw new AppError(400, 'invalid_prompt', 'Prompt tidak boleh kosong');

    const style = options.style || 'cinematic photorealistic 8k';
    const camera = options.camera || 'smooth cinematic slow glide, shallow depth of field';
    const lighting = options.lighting || 'natural soft ambient lighting, volumetric rays';

    // If prompt is already detailed (>100 chars), return with subtle touch
    if (raw.length > 120 && /cinematic|camera|lighting|shot/i.test(raw)) {
      return `${raw}, ${style}`;
    }

    return `${raw}, ${camera}, ${lighting}, ${style}, highly detailed, professional color grading`;
  }

  /**
   * Browser-based query to https://gemini.google.com/app using active Google session.
   */
  async queryGeminiWeb(params) {
    const accounts = this.store.listAccounts().filter((a) => a.status === 'ready');
    if (accounts.length === 0) return null;

    const account = accounts[0];
    let page = null;
    try {
      page = await this.browsers.auxiliaryPage(account, 'https://gemini.google.com/app');
      await page.waitForTimeout(3000);

      // Check if signed in
      const isLogin = page.url().includes('accounts.google.com') ||
        await page.getByText(/sign in|masuk/i).first().isVisible().catch(() => false);
      if (isLogin) {
        throw new Error('Google Account session needs sign-in');
      }

      // Dismiss any greeting or overlay modal
      const dismissBtn = page.locator('button:has-text("Got it"), button:has-text("Dismiss"), button:has-text("Agree"), button:has-text("Setuju")').first();
      if (await dismissBtn.isVisible().catch(() => false)) {
        await dismissBtn.click().catch(() => { });
        await page.waitForTimeout(500);
      }

      const promptBox = page.locator('rich-textarea [contenteditable="true"], [contenteditable="true"], textarea').first();
      await promptBox.waitFor({ state: 'visible', timeout: 10000 });

      const promptMessage = `Bertindaklah sebagai Creative UGC Director AI. Buat storyboard video komersil ${params.numShots} segmen bersambung (total ${params.targetDuration} detik) untuk produk: "${params.productName}". Deskripsi produk: "${params.description}". Gaya: ${params.style}. Audiens: ${params.audience}.
KEMBALIKAN HANYA JSON MURNI TANPA MARKDOWN BACKTICKS format:
{"title":"string","hook":"string","targetDuration":${params.targetDuration},"shots":[{"shotIndex":0,"title":"string","duration":10,"visualPrompt":"deskripsi visual bahasa inggris untuk video ai veo flow","voiceover":"naskah bahasa indonesia","textOverlay":"teks singkat"}]}`;

      await promptBox.click();
      await promptBox.fill(promptMessage);
      await page.waitForTimeout(500);

      const sendBtn = page.locator('button[aria-label*="Send message" i], button.send-button, mat-icon:has-text("send")').first();
      if (await sendBtn.isVisible().catch(() => false)) {
        await sendBtn.click();
      } else {
        await promptBox.press('Enter');
      }

      // Wait for response to finish streaming (stop button disappears or text settles)
      await page.waitForTimeout(4000);
      for (let attempt = 0; attempt < 25; attempt++) {
        const isStreaming = await page.locator('button[aria-label*="Stop" i]').isVisible().catch(() => false);
        if (!isStreaming) break;
        await page.waitForTimeout(1000);
      }

      const responseEl = page.locator('message-content, .model-response-text').last();
      const rawText = await responseEl.innerText({ timeout: 10000 }).catch(() => '');
      if (!rawText) return null;

      const jsonMatch = rawText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
    } catch (e) {
      console.warn('[GoogleAgent] Web automation error:', e.message);
      return null;
    } finally {
      if (page) await page.close().catch(() => { });
    }
    return null;
  }

  /**
   * Direct Gemini API call if GEMINI_API_KEY is configured.
   */
  async queryGeminiApi(params) {
    const key = process.env.GEMINI_API_KEY;
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${key}`;
    const isKineticCollage = /kinetic|collage|paper|sejarah|history|documentary|scrapbook|vintage|arsip|merdeka|kolase/i.test(`${params.style} ${params.description} ${params.productName}`);
    const systemPrompt = isKineticCollage
      ? `You are an elite Documentary & Motion Graphic Director specializing in Kinetic Paper Collage, Archival Mixed-Media, and Geopolitical Historical Explainers for Google Flow (Veo). Given a topic/event/subject and description, output a JSON structure with ${params.numShots} seamless, continuous video segments totaling ${params.targetDuration} seconds. Each visualPrompt must describe high-energy kinetic camera motion, layered torn vintage paper textures, contextual antique maps matching the geography, die-cut cutout figures, typewriter typography, and synchronized orchestral foley audio. If the input is in English, output voiceover in natural English; if in Indonesian, output in natural Indonesian. Return JSON only without markdown.`
      : `You are an elite UGC & Commercial Video Creative Director. Given a product name and description, output a JSON structure with ${params.numShots} seamless, continuous video segments totaling ${params.targetDuration} seconds. Include spoken dialogue in visualPrompt for lipsync and native audio synthesis. Return JSON only without markdown formatting.`;
    const userPrompt = `Topic/Product: ${params.productName}
Description: ${params.description}
Style: ${params.style || (isKineticCollage ? 'Kinetic Paper Collage Documentary' : 'UGC')}
Target Duration: ${params.targetDuration}s
Segments: ${params.numShots}
Format:
{
  "title": "string",
  "hook": "string",
  "targetDuration": ${params.targetDuration},
  "shots": [
    {
      "shotIndex": 0,
      "title": "string",
      "duration": 10,
      "visualPrompt": "English prompt for Veo 2 / Google Flow video generation",
      "voiceover": "Indonesian voiceover script",
      "textOverlay": "Short punchy text banner"
    }
  ]
}`;

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [
          { role: 'user', parts: [{ text: `${systemPrompt}\n\n${userPrompt}` }] }
        ],
        generationConfig: { responseMimeType: 'application/json' }
      })
    });

    if (!res.ok) throw new Error(`Gemini API error ${res.status}`);
    const data = await res.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    return JSON.parse(text);
  }

  /**
   * Deterministic Cinematic UGC Storyboard Generator.
   * Produces authentic, high-converting scene prompts specifically tailored for Veo & Flow continuity.
   */
  /**
   * Deterministic Cinematic UGC Storyboard Generator with Strict Continuity Anchors.
   * Locks Environment, Character, and Lighting so multi-segment generations remain 100% consistent.
   */
  generateCinematicFallbackStoryboard(params) {
    const { productName, description, targetDuration, style = '', numShots } = params;
    const segDuration = Math.round(targetDuration / numShots);

    const isKineticCollage = /kinetic|collage|paper|sejarah|history|documentary|scrapbook|vintage|arsip|merdeka|kolase/i.test(`${style} ${description} ${productName}`);
    const isCreatorUgc = !isKineticCollage && /creator|ugc|affiliate|review|orang|cewek|wanita|pria|tiktok|shopee|person|human|vlog/i.test(`${style} ${description}`);

    let shots = [];

    if (isKineticCollage) {
      // Dynamic Kinetic Paper Collage / Archival Documentary Pipeline
      // Dynamically adapts to ANY topic (Geopolitics, World History, Science, Tech, Local Lore)
      const topic = productName.trim();
      const desc = description.trim();
      const isEnglish = /\b(the|and|in|of|to|is|was|conflict|war|history|crisis|global)\b/i.test(`${topic} ${desc}`) &&
        !/\b(yang|dan|di|dari|ini|itu|adalah|untuk|pada|sejarah)\b/i.test(`${topic} ${desc}`);

      // 1. Dynamic Map & Geographic Anchor Detection
      let mapAnchor = 'antique sepia cartographic map with ornate compass roses and vintage coordinate grids';
      if (/iran|middle east|persian gulf|hormuz|iraq|israel|arab|yemen/i.test(`${topic} ${desc}`)) {
        mapAnchor = 'antique geopolitical nautical map of the Persian Gulf, Strait of Hormuz, and Middle East region with naval routes';
      } else if (/indonesia|nusantara|jawa|sumatera|bali|papua|malaka|batavia/i.test(`${topic} ${desc}`)) {
        mapAnchor = 'antique sepia map of the Indonesian archipelago and Southeast Asian maritime trade routes';
      } else if (/europe|germany|france|britain|russia|ukraine|rome|ww1|ww2/i.test(`${topic} ${desc}`)) {
        mapAnchor = 'vintage distressed historical map of the European continent with topographic contours and borders';
      } else if (/america|usa|united states|washington|new york/i.test(`${topic} ${desc}`)) {
        mapAnchor = 'vintage parchment map of North America with archival territorial boundary lines';
      } else if (/asia|china|japan|korea|taiwan/i.test(`${topic} ${desc}`)) {
        mapAnchor = 'antique hand-drawn oriental atlas map of East Asia with vintage calligraphy and maritime channels';
      }

      // 2. Dynamic Subject & Metaphor Cutout Detection
      let subjectMetaphors = `archival black-and-white cutout illustrations and manuscripts related to ${topic}`;
      let climaxMetaphors = `vintage typewriter manuscript document with official rubber stamps, signatures, and layered newspaper clippings of ${topic}`;

      if (/oil|economy|price|sanction|dollar|money|market|trade|inflasi|ekonomi/i.test(`${topic} ${desc}`)) {
        subjectMetaphors = `dramatic split-screen torn paper showing opposing national emblems and flags of ${topic}, accompanied by cutout newspaper headlines`;
        climaxMetaphors = `industrial oil pressure gauge standing firmly over US dollar bills and financial charts, framed by torn paper borders and barbed wire`;
      } else if (/war|conflict|attack|military|strike|missile|ceasefire|perang|serangan/i.test(`${topic} ${desc}`)) {
        subjectMetaphors = `torn paper calendar badge slamming onto screen with blood-red ink splatters, with silhouette cutouts of military fighter jets and warships in background`;
        climaxMetaphors = `ripped newspaper document with headline stamped 'CEASEFIRE: COLLAPSED', revealing tactical map markers, red battle lines, and official ink seals`;
      } else if (/pejuang|merdeka|independence|revolution|tokoh|president|king|soekarno/i.test(`${topic} ${desc}`)) {
        subjectMetaphors = `dramatic black-and-white stylized propaganda illustration of a passionate leader and historical figures with crisp white die-cut silhouette borders, raising a clenched fist`;
        climaxMetaphors = `historic proclamation manuscript framed with official wax seals, cursive signatures, and layered torn vintage newspaper clippings`;
      }

      // 3. Dynamic Titles & Narration
      const vo1 = isEnglish
        ? `${topic} is currently at the center of an unfolding historical event.`
        : `${topic} kini berada di pusaran peristiwa besar yang menentukan arah sejarah.`;
      const vo2 = isEnglish
        ? `Tensions and pivotal decisions in ${topic} continue to escalate dramatically.`
        : `Ketegangan dan keputusan penting seputar ${topic} kian memuncak tanpa henti.`;
      const vo3 = isEnglish
        ? `The long-term geopolitical and global impact will change the course of history forever.`
        : `Dampak besar dari peristiwa ini dipastikan mengubah peta sejarah untuk selamanya.`;

      const text1 = isEnglish ? `${topic.toUpperCase()}: THE BEGINNING 📜` : `${topic.toUpperCase()}: AWAL MULA 📜`;
      const text2 = isEnglish ? `CRITICAL ESCALATION 🔥` : `DETIK-DETIK GENTING 🔥`;
      const text3 = isEnglish ? `HISTORY ALTERED FOREVER 🌐` : `SEJARAH BERUBAH SELAMANYA 🌐`;

      const collageTemplates = [
        {
          title: `Hook / Geographic Reveal: ${topic}`,
          cue: 'Torn paper & unfolding contextual map',
          visual: `Kinetic mixed-media paper-cut collage animation, archival documentary style. An ${mapAnchor} unfolds with tactile torn paper textures and fibrous edges. Dynamic continuous punch-in camera zoom pushes through layered vintage paper strips. Antique brass clockwork gears rotate smoothly in background. A folded archival document sealed with masking tape appears, stamped with bold black typewriter letters: "${topic}". High-energy kinetic motion, 24fps filmic motion with subtle stop-motion paper flutter`,
          vo: vo1,
          text: text1,
          audio: `Dramatic cinematic historical orchestral strings with deep resonant percussion, synchronized foley of paper unfolding, typewriter key clatter, and ticking mechanical clockwork`,
        },
        {
          title: `Conflict & Archival Metaphors: ${topic}`,
          cue: 'Center tear transition revealing core event',
          visual: `Continuous kinetic paper collage animation advancing directly from previous shot. The vintage paper center rips open with a dynamic paper-tear transition, revealing ${subjectMetaphors}. Bold typewriter text stamps into the torn paper. The camera executes a rapid forward snap-zoom with kinetic parallax. Red official stamp ink bleeds onto parchment`,
          vo: vo2,
          text: text2,
          audio: `Driving cinematic orchestral percussion intensifies, sharp paper-tearing foley, deep cinematic bass hits`,
        },
        {
          title: `Climax & Global Impact: ${topic}`,
          cue: 'Parchment climax and geopolitical artifacts',
          visual: `Continuous kinetic paper collage flow extending seamlessly. The camera glides swiftly across ${climaxMetaphors}. A bold typewriter stamped headline slams onto the center card. Dynamic continuous camera drift and subtle stop-motion paper jitter`,
          vo: vo3,
          text: text3,
          audio: `Grand triumphant cinematic brass crescendo with resonant orchestral conclusion and tactile foley`,
        },
      ];

      for (let i = 0; i < numShots; i++) {
        const t = collageTemplates[i % collageTemplates.length];
        const visualPrompt = i === 0
          ? `${t.visual}. Audio: ${t.audio}.`
          : `Continuous seamless camera motion extending directly from preceding shot, maintaining exact same vintage sepia parchment tones and torn paper collage aesthetic, ${t.visual}. Audio: ${t.audio}.`;

        shots.push({
          shotIndex: i,
          title: t.title,
          duration: segDuration,
          visualPrompt,
          continuityCue: t.cue,
          voiceover: t.vo,
          textOverlay: t.text,
        });
      }
    } else if (isCreatorUgc) {
      // Creator UGC Pipeline: Strict Character & Environment Lock with Native Speech
      const envAnchor = 'bright cozy modern minimalist room, soft natural morning daylight from window, warm neutral interior, realistic environment';
      const charAnchor = 'charismatic and friendly young Indonesian creator, casual stylish outfit, natural skin texture, candid authentic expression';
      const camAnchor = 'handheld smartphone POV, steady natural framing, authentic TikTok UGC aesthetic, photorealistic 4k';

      const creatorTemplates = [
        {
          title: 'Hook / Candid First Impression',
          cue: 'Casual authentic introduction',
          visual: `Handheld smartphone POV, ${charAnchor}, sitting in ${envAnchor}, casually holding ${productName} (${description}) toward camera, candid friendly smile, natural lighting, ${camAnchor}`,
          vo: `Jujur awalnya gue ragu sama ${productName}, tapi pas udah coba sendiri ternyata beda banget.`,
          text: `Review Jujur: ${productName} ✨`,
        },
        {
          title: 'Action & Product Demonstration',
          cue: 'Continuous demo in the exact same room',
          visual: `Continuous seamless camera motion maintaining exact same ${charAnchor} in identical ${envAnchor}, creator demonstrates ${productName} in hand, showing detail with natural relaxed movements, identical window daylight, steady handheld framing, ${camAnchor}`,
          vo: `Gampang banget dipakenya dan efeknya langsung berasa. Ini yang bikin gue suka.`,
          text: 'Super Praktis & Hasil Cepat 🔥',
        },
        {
          title: 'Lifestyle Result & Recommendation',
          cue: 'Satisfied recommendation with product',
          visual: `Continuous fluid continuation with identical ${charAnchor} and identical ${envAnchor}, creator happily holds up ${productName} with confident satisfied nod, warm genuine gaze at camera, natural window lighting, ${camAnchor}`,
          vo: `Worth it banget buat dicoba sendiri. Cek keranjang sekarang sebelum promo berakhir!`,
          text: 'Rekomendasi Terbaik 10/10 ⭐⭐⭐⭐⭐',
        },
        {
          title: 'Urgency & Final CTA',
          cue: 'Final wrap-up gesture',
          visual: `Continuous steady motion with identical ${charAnchor} in identical ${envAnchor}, creator gives casual thumbs up holding ${productName}, friendly smile, ${camAnchor}`,
          vo: `Jangan sampai kehabisan ya, langsung checkout sekarang!`,
          text: 'Beli Sekarang Diskon Spesial 🛒',
        },
      ];

      for (let i = 0; i < numShots; i++) {
        const t = creatorTemplates[i % creatorTemplates.length];
        const visualPrompt = i === 0
          ? `${t.visual}. Creator speaks naturally to camera in Indonesian saying: "${t.vo}". Audio: Clear synchronized spoken Indonesian voice, natural room acoustics.`
          : `Continuous seamless camera flow extending directly from preceding shot, keeping exact same creator, outfit, room, and window lighting. ${t.visual}. Creator continues speaking directly to camera in Indonesian saying: "${t.vo}". Audio: Clear synchronized spoken Indonesian female voice, synchronized lips, natural room acoustics.`;

        shots.push({
          shotIndex: i,
          title: t.title,
          duration: segDuration,
          visualPrompt,
          continuityCue: t.cue,
          voiceover: t.vo,
          textOverlay: t.text,
        });
      }
    } else {
      // Product Cinematic Showcase Pipeline: Strict Pedestal & Lighting Lock
      const studioAnchor = 'minimalist luxury marble pedestal, soft warm ambient studio lighting, neutral aesthetic backdrop, volumetric glow, photorealistic 8k';

      const productTemplates = [
        {
          title: 'Hero Reveal',
          cue: 'Macro hero introduction',
          visual: `Cinematic macro hero push-in shot of ${productName} (${description}), rotating slowly on ${studioAnchor}, crisp textures, shallow depth of field`,
          vo: `Memperkenalkan ${productName}, solusi elegan untuk Anda.`,
          text: `Eksklusif: ${productName} ✨`,
        },
        {
          title: 'Feature Detail & Texture',
          cue: 'Continuous orbit around the exact same pedestal',
          visual: `Continuous fluid camera orbit maintaining identical ${studioAnchor}, gliding close past ${productName} highlighting premium build and materials, identical lighting and reflection`,
          vo: `Dibuat dengan standar kualitas terbaik untuk performa maksimal.`,
          text: 'Kualitas & Presisi Tinggi 💎',
        },
        {
          title: 'Grand Finale Showcase',
          cue: 'Graceful pull back on the same pedestal',
          visual: `Continuous seamless camera pull-back showcasing ${productName} on identical ${studioAnchor}, elegant lighting flare, pristine commercial finish`,
          vo: `Tingkatkan pengalaman Anda bersama ${productName} hari ini.`,
          text: 'Pesan Sekarang Juga 🛒',
        },
      ];

      for (let i = 0; i < numShots; i++) {
        const t = productTemplates[i % productTemplates.length];
        shots.push({
          shotIndex: i,
          title: t.title,
          duration: segDuration,
          visualPrompt: i === 0
            ? t.visual
            : `Continuous smooth camera motion extending directly from preceding shot, maintaining exact same studio pedestal and lighting, ${t.visual}`,
          continuityCue: t.cue,
          voiceover: t.vo,
          textOverlay: t.text,
        });
      }
    }

    return {
      title: `UGC Storyboard: ${productName}`,
      hook: `Rahasia ${productName} yang bikin semua orang beralih!`,
      targetDuration,
      segmentDuration: segDuration,
      style: isCreatorUgc ? 'Indonesian Creator TikTok UGC' : style,
      shots,
    };
  }

  /**
   * Produces the affiliate production JSON through 9router. This path has no
   * heuristic product fallback because a generic template can fabricate facts.
   */
  async generateAffiliateStoryboard(input, onEvent = null) {
    const productName = input.productName?.trim();
    if (!productName) {
      throw new AppError(400, 'invalid_product_name', 'Nama produk wajib diisi untuk membuat storyboard affiliate');
    }
    const referenceImages = [
      ...(Array.isArray(input.productImages) ? input.productImages : []),
      input.character?.avatar,
      input.character?.bodyReference,
    ].filter(Boolean);

    let lastError = null;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const result = await this.nineRouter.generateJson({
          system: buildAffiliateSystemPrompt(input),
          user: buildAffiliateUserPrompt(input),
          images: referenceImages,
          temperature: attempt === 0 ? 0.2 : 0,
          maxTokens: 7000,
          onStatus: (msg) => onEvent?.({ type: 'status', message: msg }),
          onToken: (chunk) => onEvent?.({ type: 'token', chunk }),
          onReasoning: (chunk) => onEvent?.({ type: 'reasoning', chunk }),
        });
        return {
          ...normalizeAffiliateStoryboard(result.data, productName, {
            duration: input.duration,
            aspectRatio: input.aspectRatio,
            isObjectOnly: input.character?.isNone || input.character?.id === 'none',
            voiceoverEnabled: input.voiceover?.enabled !== false,
          }),
          planningModel: result.model,
          planningProvider: '9router',
        };
      } catch (error) {
        lastError = error;
        if (String(error?.code || '').startsWith('nine_router_')) throw error;
      }
    }
    throw lastError || new AppError(502, 'invalid_affiliate_storyboard', '9router tidak menghasilkan storyboard yang valid');
  }

  /**
   * Produces a fresh evidence-based variation through the same 9router path.
   */
  async rerollAffiliateShot(input) {
    const clipNumber = Number(input.clipNumber);
    const storyboard = await this.generateAffiliateStoryboard({
      ...input,
      variationNote: `Create a fresh evidence-based variation. Shot ${clipNumber} is the requested alternative, but every shot must preserve one locked continuity bible. Do not introduce new product claims.`,
    });
    const shot = storyboard.shots[clipNumber - 1];
    if (!shot) throw new AppError(400, 'invalid_clip_number', 'Nomor klip affiliate tidak valid');
    return {
      clipNumber,
      title: shot.title,
      scriptCue: shot.scriptCue,
      visualCue: shot.visualCue,
      prompt: shot.visualPrompt,
      planningModel: storyboard.planningModel,
      planningProvider: storyboard.planningProvider,
    };
  }

}

/**
 * Sanitizes raw marketplace product titles into clean, concise brand/product names
 * suitable for both natural spoken narration and AI video generation prompts.
 */
export function cleanProductName(rawName) {
  if (!rawName || typeof rawName !== 'string') return 'Produk Unggulan';
  let clean = rawName
    // Split on pipe, slash, bullet, or newline
    .split(/\s*[\/|•\n]\s*/)[0]
    // Strip trailing category noise after hyphens
    .replace(/\s*-\s*(Pakaian|Baju|Atasan|Celana|Dress|Kaos|Serum|Skincare|Kemeja|Sepatu|Tas|Elektronik|Case|Aksesoris|Original|Termurah|Diskon|Promo|Ready|COD|Bisa).*$/i, '')
    // Remove brackets like [ORIGINAL], [BPOM], etc.
    .replace(/\[[^\]]*\]/g, '')
    // Remove parentheses containing marketing claims
    .replace(/\([^)]*(bpom|original|cod|promo|terlaris|diskon|resmi|wanita|pria)[^)]*\)/gi, '')
    // Remove individual buzzwords
    .replace(/\b(original|bpom|resmi|terlaris|promo|diskon|termurah|terbaru|terlengkap)\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim();

  // If cleaning stripped too much, fallback to first 4 words of original title
  if (clean.length < 3) {
    clean = rawName.split(/\s+/).slice(0, 4).join(' ');
  }
  return clean;
}

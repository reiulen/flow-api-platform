/**
 * Google Flow RPC Data Mappers
 * Transforms internal Google Boq/Angular protobuf-over-JSON arrays
 * into developer-friendly REST API JSON objects.
 */

export function urls(value, out = new Set()) {
  if (typeof value === 'string' && /^https?:\/\//.test(value)) {
    out.add(value);
  } else if (Array.isArray(value)) {
    for (const item of value) urls(item, out);
  } else if (value && typeof value === 'object') {
    for (const item of Object.values(value)) urls(item, out);
  }
  return [...out];
}

export function formatProtoTimestamp(ts) {
  if (!Array.isArray(ts) || typeof ts[0] !== 'number') return null;
  const seconds = ts[0];
  const nanos = typeof ts[1] === 'number' ? ts[1] : 0;
  const ms = seconds * 1000 + Math.floor(nanos / 1_000_000);
  return new Date(ms).toISOString();
}

function extractCredits(tierArray) {
  if (!Array.isArray(tierArray)) return null;
  for (const tier of tierArray) {
    if (Array.isArray(tier) && Array.isArray(tier[1])) {
      for (const item of tier[1]) {
        if (Array.isArray(item) && typeof item[1] === 'number') {
          return item[1];
        }
      }
    }
  }
  return null;
}

function mapAspectRatios(codeArray) {
  if (!Array.isArray(codeArray)) return ['16:9', '9:16'];
  const map = {
    1: '9:16',
    2: '16:9',
    3: '1:1',
    4: '4:3',
    5: '3:4',
    6: '21:9',
  };
  const flat = codeArray.flat(3).filter(Boolean);
  const mapped = [...new Set(flat.map((code) => map[code] || String(code)))];
  return mapped.length ? mapped : ['16:9', '9:16'];
}

function mapImageAspectRatios(codeArray) {
  if (!Array.isArray(codeArray)) return ['1:1', '16:9', '9:16', '4:3', '3:4'];
  const map = {
    1: '1:1',
    2: '16:9',
    3: '9:16',
    4: '4:3',
    5: '3:4',
  };
  const flat = codeArray.flat(3).filter(Boolean);
  const mapped = [...new Set(flat.map((code) => map[code] || String(code)))];
  return mapped.length ? mapped : ['1:1', '16:9', '9:16', '4:3', '3:4'];
}

function detectVideoMode(variantId = '') {
  const id = variantId.toLowerCase();
  if (id.includes('_t2v') || id.endsWith('t2v')) return 'text_to_video';
  if (id.includes('_i2v') || id.endsWith('i2v')) return 'image_to_video';
  if (id.includes('_r2v') || id.endsWith('r2v')) return 'reference_to_video';
  if (id.includes('_edit')) return 'edit_video';
  if (id.includes('_extend')) return 'extend_video';
  if (id.includes('_upsampler') || id.includes('upsample')) return 'upsample_video';
  if (id.includes('_interpolation')) return 'interpolation';
  return 'video_generation';
}

function detectResolution(variantId = '', resCode) {
  const id = variantId.toLowerCase();
  if (id.includes('360p')) return '360p';
  if (id.includes('1080p')) return '1080p';
  if (id.includes('4k')) return '4K';
  if (Array.isArray(resCode) && resCode.length) {
    const code = resCode.flat(3)[0];
    if (code === 1) return '720p';
    if (code === 2) return '1080p';
    if (code === 3) return '4K';
    if (code === 4) return '360p';
  }
  return '720p';
}

/**
 * Maps FlowService.GetModels (HTrJv) and FlowService.ListModelStatuses (yBhWQ)
 */
export function mapModels(rawModels, rawStatuses) {
  if (!rawModels) return { summary: {}, videoModels: [], imageModels: [], audioModels: [], quickList: {} };

  // 1. Status map
  const statusMap = new Map();
  if (Array.isArray(rawStatuses?.[0])) {
    for (const item of rawStatuses[0]) {
      if (Array.isArray(item) && item.length >= 2) {
        statusMap.set(item[0], item[1] === 1 ? 'online' : 'offline');
      }
    }
  }

  const root = Array.isArray(rawModels[0]) ? rawModels[0] : rawModels;

  // 2. Default preferences
  const defaults = {
    defaultImageModel: 'narwhal_display',
    defaultVideoModel: 'veo_3_1_lite',
  };
  const tiers = root?.[2];
  if (Array.isArray(tiers) && tiers.length > 0) {
    const firstTier = tiers[0]?.[1];
    if (Array.isArray(firstTier)) {
      if (typeof firstTier[2] === 'string') defaults.defaultImageModel = firstTier[2];
      if (typeof firstTier[3] === 'string') defaults.defaultVideoModel = firstTier[3];
    }
  }

  // 3. Video Models (root[4])
  const rawVideoModels = Array.isArray(root?.[4]) ? root[4] : [];
  const videoModels = rawVideoModels.map((item) => {
    const name = item?.[0] || 'Unknown Video Model';
    const rawVariants = Array.isArray(item?.[1]) ? item[1] : [];
    const isAvailable = item?.[2] === true;
    const modelKey = item?.[3] || '';
    const aliases = Array.isArray(item?.[4]) ? item[4].flat().filter(Boolean) : [];

    const variants = rawVariants.map((v) => {
      const vId = v?.[0] || '';
      const durationSec = typeof v?.[16] === 'number' ? v[16] : null;
      const credits = extractCredits(v?.[4]);
      const aspectRatios = mapAspectRatios(v?.[12]);
      const resolution = detectResolution(vId, v?.[23]);
      const mode = detectVideoMode(vId);

      return {
        id: vId,
        mode,
        durationSeconds: durationSec,
        resolution,
        aspectRatios,
        creditCost: credits,
        available: v?.[17] === true,
        features: {
          firstAndLastFrame: vId.includes('fl') || vId.includes('first_last'),
          referenceImages: mode === 'reference_to_video',
          isLowPriority: vId.includes('low_priority') || vId.includes('relaxed'),
          isUltra: vId.includes('ultra'),
        },
      };
    });

    const isUpscaler = modelKey.includes('upsampler') || modelKey.includes('upsample');

    return {
      id: modelKey,
      name,
      category: isUpscaler ? 'video_upscaler' : 'video',
      status: statusMap.get(modelKey) || (isAvailable ? 'online' : 'preview'),
      available: isAvailable,
      aliases,
      variantCount: variants.length,
      variants,
    };
  });

  // 4. Image Models (root[5])
  const rawImageModels = Array.isArray(root?.[5]) ? root[5] : [];
  const imageModels = rawImageModels.map((item) => {
    const name = item?.[0] || 'Unknown Image Model';
    const rawVariants = Array.isArray(item?.[1]) ? item[1] : [];
    const isAvailable = item?.[2] === true || item?.[2] == null;
    const modelKey = item?.[3] || '';

    const variants = rawVariants.map((v) => {
      const vId = v?.[0] || '';
      const credits = extractCredits(v?.[4]) ?? 0;
      const aspectRatios = mapImageAspectRatios(v?.[14]);
      const timeoutSec = typeof v?.[15] === 'number' ? v[15] : null;

      return {
        id: vId,
        creditCost: credits,
        aspectRatios,
        timeoutSeconds: timeoutSec,
        available: v?.[18] === true || v?.[18] == null,
      };
    });

    const isUpscaler = modelKey.includes('upsample');

    return {
      id: modelKey,
      name,
      category: isUpscaler ? 'image_upscaler' : 'image',
      status: isAvailable ? 'online' : 'preview',
      available: isAvailable,
      variantCount: variants.length,
      variants,
    };
  });

  // 5. Audio Models (root[7])
  const rawAudioModels = Array.isArray(root?.[7]) ? root[7] : [];
  const audioModels = rawAudioModels.map((item) => {
    const name = item?.[0] || 'Unknown Audio Model';
    const rawVariants = Array.isArray(item?.[1]) ? item[1] : [];
    const modelKey = item?.[3] || '';

    const variants = rawVariants.map((v) => {
      const vId = v?.[0] || '';
      const credits = extractCredits(v?.[4]) ?? 0;
      return {
        id: vId,
        creditCost: credits,
        available: true,
      };
    });

    return {
      id: modelKey,
      name,
      category: 'audio',
      status: 'online',
      available: true,
      variantCount: variants.length,
      variants,
    };
  });

  // 6. Quick List for easy developer lookup
  const quickList = {
    defaultImageModel: defaults.defaultImageModel,
    defaultVideoModel: defaults.defaultVideoModel,
    videoGenerationModels: videoModels
      .filter((m) => m.category === 'video')
      .map((m) => ({ id: m.id, name: m.name, status: m.status })),
    imageGenerationModels: imageModels
      .filter((m) => m.category === 'image')
      .map((m) => ({ id: m.id, name: m.name, status: m.status })),
    upscalers: [
      ...videoModels.filter((m) => m.category === 'video_upscaler').map((m) => ({ id: m.id, name: m.name, type: 'video' })),
      ...imageModels.filter((m) => m.category === 'image_upscaler').map((m) => ({ id: m.id, name: m.name, type: 'image' })),
    ],
  };

  return {
    summary: {
      ...defaults,
      totalVideoModels: videoModels.length,
      totalImageModels: imageModels.length,
      totalAudioModels: audioModels.length,
    },
    quickList,
    videoModels,
    imageModels,
    audioModels,
  };
}

/**
 * Maps FlowService.GetProjects (UpteDb)
 */
export function mapProjects(rawProjects) {
  if (!rawProjects || !Array.isArray(rawProjects)) {
    return { projects: [], total: 0, nextPageToken: null };
  }

  const rawList = Array.isArray(rawProjects[0]) ? rawProjects[0] : [];
  const nextPageToken = typeof rawProjects[1] === 'string' ? rawProjects[1] : null;

  const projects = rawList
    .filter((item) => Array.isArray(item) && typeof item[0] === 'string')
    .map((item) => {
      const id = item[0];
      const meta = Array.isArray(item[1]) ? item[1] : [];
      const title = meta[0] || 'Untitled Project';
      const updatedAt = formatProtoTimestamp(meta[2]);
      const authorId = typeof meta[4] === 'string' ? meta[4] : null;

      return {
        id,
        title,
        updatedAt,
        authorId,
      };
    });

  return {
    projects,
    total: projects.length,
    nextPageToken,
  };
}

/**
 * Maps FlowService.GetProjectContents (Zzl0ze)
 */
export function mapProjectContents(projectId, rawContents) {
  if (!rawContents || !Array.isArray(rawContents)) {
    return {
      projectId,
      found: false,
      message: 'Project tidak ditemukan pada akun ini atau belum memiliki konten',
      mediaCount: 0,
      media: [],
      voices: [],
    };
  }

  const seenMediaIds = new Set();
  const media = [];
  const voices = [];

  // 1. Process generated outputs from rawContents[2]
  const outputs = Array.isArray(rawContents[2]) ? rawContents[2] : [];
  for (const item of outputs) {
    if (!Array.isArray(item)) continue;
    const itemId = item[0];
    if (seenMediaIds.has(itemId)) continue;
    seenMediaIds.add(itemId);

    const flowProjectId = item[1] || projectId;
    const fileStats = Array.isArray(item[5]) ? item[5] : [];
    const createdAt = formatProtoTimestamp(fileStats[0]);
    const prompt = fileStats[6]?.[2]?.[0]?.[0] || null;
    const fileSizeBytes = typeof fileStats[13] === 'number' ? fileStats[13] : null;
    const dims = Array.isArray(item[6]) && Array.isArray(item[6][2]) ? item[6][2] : [];
    const width = typeof dims[0] === 'number' ? dims[0] : null;
    const height = typeof dims[1] === 'number' ? dims[1] : null;
    const mediaUrls = urls(item).filter((u) => /googleusercontent|flow\.google\.com\/asb|flow-content\.google|storage\.googleapis/i.test(u));

    media.push({
      id: itemId,
      type: 'image',
      projectId: flowProjectId,
      prompt,
      createdAt,
      fileSizeBytes,
      width,
      height,
      urls: [...new Set(mediaUrls)],
    });
  }

  // 2. Process items from rawContents[3] (backfills and voices)
  const items = Array.isArray(rawContents[3]) ? rawContents[3] : [];
  for (const item of items) {
    if (!Array.isArray(item)) continue;
    const itemId = item[0];
    const typeNum = item[1];

    if (typeNum === 1) {
      if (seenMediaIds.has(itemId)) continue;
      seenMediaIds.add(itemId);

      const meta = Array.isArray(item[3]) ? item[3] : [];
      const flowProjectId = meta[1] || projectId;
      const fileStats = Array.isArray(meta[5]) ? meta[5] : [];
      const createdAt = formatProtoTimestamp(fileStats[0]);
      const fileSizeBytes = typeof fileStats[13] === 'number' ? fileStats[13] : null;
      const dims = Array.isArray(meta[6]) && Array.isArray(meta[6][2]) ? meta[6][2] : [];
      const width = typeof dims[0] === 'number' ? dims[0] : null;
      const height = typeof dims[1] === 'number' ? dims[1] : null;
      const mediaUrls = urls(item).filter((u) => /googleusercontent|flow\.google\.com\/asb|flow-content\.google|storage\.googleapis/i.test(u));

      media.push({
        id: itemId,
        type: 'image',
        projectId: flowProjectId,
        createdAt,
        fileSizeBytes,
        width,
        height,
        urls: [...new Set(mediaUrls)],
      });
    } else if (typeNum === 3) {
      const voiceName = item[2] || itemId;
      const voiceMeta = Array.isArray(item[3]) && Array.isArray(item[3][10]) && Array.isArray(item[3][10][0])
        ? item[3][10][0]
        : [];
      const description = voiceMeta[1] || null;
      const sampleUrl = voiceMeta[3] || null;

      voices.push({
        id: itemId,
        name: voiceName,
        description,
        sampleUrl,
      });
    }
  }

  // Selected models for this project (rawContents[7][2])
  let selectedModels = null;
  const rawSettings = rawContents[7];
  if (Array.isArray(rawSettings) && Array.isArray(rawSettings[2])) {
    const list = rawSettings[2];
    let imageModel = null;
    let videoModel = null;
    for (const s of list) {
      if (Array.isArray(s)) {
        if (s[1] === 3 && typeof s[4] === 'string') imageModel = s[4];
        if (s[1] === 2 && typeof s[4] === 'string') videoModel = s[4];
      }
    }
    selectedModels = { imageModel, videoModel };
  }

  return {
    projectId,
    found: true,
    selectedModels,
    mediaCount: media.length,
    voiceCount: voices.length,
    media,
    voices,
  };
}

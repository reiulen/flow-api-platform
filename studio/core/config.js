import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
export const STUDIO_ROOT = path.resolve(here, '..');
export const REPO_ROOT = path.resolve(STUDIO_ROOT, '..');

const env = process.env;
const list = (value, fallback) => (value ? value.split(',').map((s) => s.trim()).filter(Boolean) : fallback);

export function loadConfig(overrides = {}) {
  const config = {
    root: STUDIO_ROOT,
    projectsDir: env.STUDIO_PROJECTS_DIR || path.join(STUDIO_ROOT, 'projects'),
    assetsDir: env.STUDIO_ASSETS_DIR || path.join(STUDIO_ROOT, 'assets'),
    libraryDir: env.STUDIO_LIBRARY_DIR || path.join(STUDIO_ROOT, 'library'),
    stylesDir: path.join(STUDIO_ROOT, 'styles'),
    motionDir: path.join(STUDIO_ROOT, 'motion'),

    llm: {
      provider: env.STUDIO_LLM_PROVIDER || 'anthropic',
      model: env.STUDIO_LLM_MODEL || 'claude-opus-5-5',
      // stage -> effort. Writing/reasoning stages get more effort than mechanical ones.
      effort: {
        topics: 'high', research: 'high', outline: 'high', script: 'xhigh',
        visual: 'high', flowqc: 'medium', footage: 'medium', review: 'high', rank: 'low',
      },
      researchMaxSearches: Number(env.STUDIO_RESEARCH_MAX_SEARCHES || 30),
    },

    // Web search used when the LLM sits behind a proxy (9router /v1/search). model = a search provider enabled in 9router.
    search: {
      url: env.NINE_ROUTER_BASE_URL?.replace(/\/v1\/?$/, '') || env.ANTHROPIC_BASE_URL?.replace(/\/v1\/?$/, '') || '',
      key: env.NINE_ROUTER_API_KEY || env.ANTHROPIC_API_KEY || env.ANTHROPIC_AUTH_TOKEN || '',
      model: env.STUDIO_SEARCH_MODEL || '',
    },

    voice: {
      provider: env.STUDIO_VOICE_PROVIDER || 'edge',
      voice: env.STUDIO_VOICE || 'en-US-AndrewMultilingualNeural',
      model: env.STUDIO_VOICE_MODEL || (env.STUDIO_VOICE_PROVIDER === 'inworld' ? 'inworld-tts-2' : ''),
      rate: env.STUDIO_VOICE_RATE || '-4%',
      // Rate-limited engines (9router/Gemini): seconds of narration per request, and requests per minute.
      chunkSeconds: Number(env.STUDIO_VOICE_CHUNK_S ?? 90),
      rpm: Number(env.STUDIO_VOICE_RPM || 0),
      // Word timings for engines that return none: 9router speech-to-text when a model is set,
      // otherwise alignment against the pauses measured in the audio.
      align: {
        model: env.STUDIO_ALIGN_MODEL || '',
        url: env.NINE_ROUTER_BASE_URL?.replace(/\/v1\/?$/, '') || env.ANTHROPIC_BASE_URL?.replace(/\/v1\/?$/, '') || '',
        key: env.NINE_ROUTER_API_KEY || env.ANTHROPIC_API_KEY || env.ANTHROPIC_AUTH_TOKEN || '',
        required: env.STUDIO_ALIGN_REQUIRED === '1',
      },
    },

    flow: {
      mode: env.STUDIO_FLOW_MODE || 'direct', // direct | queue | off
      baseUrl: env.STUDIO_FLOW_BASE_URL || `http://127.0.0.1:${env.PORT || 3000}`,
      apiKey: env.FLOW_API_KEY || '',
      pollMs: Number(env.STUDIO_FLOW_POLL_MS || 15000),
      timeoutMs: Number(env.STUDIO_FLOW_TIMEOUT_MS || 30 * 60 * 1000),
    },

    map: {
      provider: env.STUDIO_MAP_PROVIDER || (env.MAPTILER_KEY ? 'maptiler' : 'gibs'),
      maptilerKey: env.MAPTILER_KEY || '',
      localTiles: env.STUDIO_MAP_LOCAL_TILES || '',
      localMaxzoom: env.STUDIO_MAP_LOCAL_MAXZOOM || '',
      localCredit: env.STUDIO_MAP_LOCAL_CREDIT || '',
      standin: null,
    },

    sources: {
      dvids: env.DVIDS_API_KEY || '',
      nara: env.NARA_API_KEY || '',
      pexels: env.PEXELS_API_KEY || '',
      pixabay: env.PIXABAY_API_KEY || '',
    },

    assets: {
      maxDurationSeconds: Number(env.STUDIO_ASSET_MAX_DURATION_S || 900),
      maxDownloadBytes: Number(env.STUDIO_ASSET_MAX_DOWNLOAD_MB || 300) * 1024 * 1024,
      downloadTimeoutMs: Number(env.STUDIO_ASSET_DOWNLOAD_TIMEOUT_MS || 90000),
      sceneScanMaxSeconds: Number(env.STUDIO_ASSET_SCENE_SCAN_S || 300),
      preferredHeight: Number(env.STUDIO_ASSET_PREFERRED_HEIGHT || 1080),
      minHeight: Number(env.STUDIO_ASSET_MIN_HEIGHT || 720),
      // Planning: clips downloaded per video (0 = 1.5x the clips the footage shots need, at least 6), candidates the
      // planner reads per need, clips planned per need, and shots one clip is expected to give.
      maxDownloads: Number(env.STUDIO_ASSET_MAX_DOWNLOADS || 0),
      candidatesPerNeed: Number(env.STUDIO_ASSET_CANDIDATES || 10),
      clipsPerNeed: Number(env.STUDIO_ASSET_CLIPS_PER_NEED || 4),
      shotsPerClip: Number(env.STUDIO_ASSET_SHOTS_PER_CLIP || 3),
    },

    render: {
      hyperframes: env.STUDIO_HYPERFRAMES_BIN || path.join(REPO_ROOT, 'node_modules', '.bin', 'hyperframes'),
      motionQuality: env.STUDIO_MOTION_QUALITY || 'looks',
      motionStub: env.STUDIO_MOTION_STUB === '1',
      chrome: env.CHROME_EXECUTABLE_PATH || '',
      threads: Number(env.STUDIO_FFMPEG_THREADS || 0),
      preset: env.STUDIO_FFMPEG_PRESET || 'medium',
      crf: Number(env.STUDIO_FFMPEG_CRF || 18),
    },

    // auto: gate passes when its automated checks pass. manual: pipeline stops until `studio gate`.
    gates: {
      G1: env.STUDIO_GATE_G1 || 'auto',
      G2: env.STUDIO_GATE_G2 || 'auto',
      G3: env.STUDIO_GATE_G3 || 'auto',
      G4: env.STUDIO_GATE_G4 || 'manual',
    },

    stageRetries: Number(env.STUDIO_STAGE_RETRIES || 2),
    concurrency: Number(env.STUDIO_CONCURRENCY || 2),
    testMode: env.STUDIO_TEST_MODE === '1',
    disabledSources: list(env.STUDIO_DISABLED_SOURCES, []),
  };
  return deepMerge(config, overrides);
}

export function deepMerge(base, extra) {
  if (Array.isArray(extra) || typeof extra !== 'object' || extra === null) return extra === undefined ? base : extra;
  const out = { ...base };
  for (const [key, value] of Object.entries(extra)) {
    out[key] = base && typeof base[key] === 'object' && !Array.isArray(base[key]) && value && typeof value === 'object' && !Array.isArray(value)
      ? deepMerge(base[key], value)
      : value;
  }
  return out;
}

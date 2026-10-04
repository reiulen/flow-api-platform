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
        visual: 'high', flowqc: 'medium', review: 'high', rank: 'low',
      },
      researchMaxSearches: Number(env.STUDIO_RESEARCH_MAX_SEARCHES || 30),
    },

    voice: {
      provider: env.STUDIO_VOICE_PROVIDER || 'edge',
      voice: env.STUDIO_VOICE || 'en-US-AndrewMultilingualNeural',
      rate: env.STUDIO_VOICE_RATE || '-4%',
    },

    flow: {
      mode: env.STUDIO_FLOW_MODE || 'direct', // direct | queue | off
      baseUrl: env.STUDIO_FLOW_BASE_URL || `http://127.0.0.1:${env.PORT || 3000}`,
      apiKey: env.FLOW_API_KEY || '',
      pollMs: Number(env.STUDIO_FLOW_POLL_MS || 15000),
      timeoutMs: Number(env.STUDIO_FLOW_TIMEOUT_MS || 30 * 60 * 1000),
    },

    sources: {
      dvids: env.DVIDS_API_KEY || '',
      nara: env.NARA_API_KEY || '',
      pexels: env.PEXELS_API_KEY || '',
      pixabay: env.PIXABAY_API_KEY || '',
    },

    render: {
      hyperframes: env.STUDIO_HYPERFRAMES_BIN || path.join(REPO_ROOT, 'node_modules', '.bin', 'hyperframes'),
      motionQuality: env.STUDIO_MOTION_QUALITY || 'looks',
      motionStub: env.STUDIO_MOTION_STUB === '1',
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

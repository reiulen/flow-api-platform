import path from 'node:path';

const bool = (name, fallback) => process.env[name] == null
  ? fallback
  : ['1', 'true', 'yes', 'on'].includes(process.env[name].toLowerCase());
const int = (name, fallback) => {
  const value = Number.parseInt(process.env[name] ?? '', 10);
  return Number.isFinite(value) ? value : fallback;
};

export function loadConfig(cwd = process.cwd()) {
  const apiKey = process.env.FLOW_API_KEY ?? '';
  if (apiKey.length < 32) throw new Error('FLOW_API_KEY minimal 32 karakter');
  const master = process.env.FLOW_MASTER_KEY ?? '';
  const masterKey = Buffer.from(master, 'base64');
  if (masterKey.length !== 32) throw new Error('FLOW_MASTER_KEY harus base64 dari tepat 32 byte');
  return {
    host: process.env.HOST ?? '127.0.0.1',
    port: int('PORT', 8787),
    apiKey,
    masterKey,
    dataDir: path.resolve(cwd, process.env.DATA_DIR ?? './data'),
    profileDir: path.resolve(cwd, process.env.PROFILE_DIR ?? './profiles'),
    chromePath: process.env.CHROME_EXECUTABLE_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: bool('FLOW_HEADLESS', false),
    concurrency: Math.max(1, int('FLOW_WORKER_CONCURRENCY', 2)),
    jobTimeoutMs: int('FLOW_JOB_TIMEOUT_MS', 900_000),
    pollIntervalMs: int('FLOW_POLL_INTERVAL_MS', 15_000),
    maxAttempts: int('FLOW_MAX_ATTEMPTS', 4),
    webhookAllowHttp: bool('FLOW_WEBHOOK_ALLOW_HTTP', false),
    embeddedWorker: bool('FLOW_EMBEDDED_WORKER', true),
    nineRouterBaseUrl: process.env.NINE_ROUTER_BASE_URL ?? 'http://127.0.0.1:20128/v1',
    nineRouterApiKey: process.env.NINE_ROUTER_API_KEY ?? '',
    nineRouterModel: process.env.NINE_ROUTER_MODEL ?? '',
    nineRouterTimeoutMs: int('NINE_ROUTER_TIMEOUT_MS', 90_000),
  };
}

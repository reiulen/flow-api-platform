import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import { loadConfig } from './config.js';
import { Store } from './db.js';
import { BrowserPool } from './browser-pool.js';
import { FlowAdapter } from './flow-adapter.js';
import { JobWorker } from './job-worker.js';
import { GoogleAgent } from './google-agent.js';
import { UgcEngine } from './ugc-engine.js';
import { HookEngine } from './hook-engine.js';
import { FashionEngine } from './fashion-engine.js';
import { KineticEngine } from './kinetic-engine.js';
import { generateVoiceover } from './ffmpeg.js';
import { scrapeAffiliateProduct } from './scraper-engine.js';
import { AffiliateEngine } from './affiliate-engine.js';
import { AppError, errorBody } from './errors.js';

import { encryptJson } from './crypto.js';
import {
  AccountInput,
  AccountUpdate,
  ImageInput,
  VideoInput,
  VideoChainInput,
  UpscaleInput,
  RoutingInput,
  ProjectBindingInput,
  StoryboardInput,
  PromptEnhanceInput,
  UgcGenerateInput,
  HookGenerateInput,
  FashionGenerateInput,
  KineticGenerateInput,
  AffiliateGenerateInput,
  AffiliateRerollInput,
  parse,
} from './schemas.js';
import { validateWebhookUrl } from './webhook.js';
import { createOpenApiSpec, renderScalarHtml } from './openapi.js';
import { mapModels, mapProjects, mapProjectContents } from './mappers.js';

const config = loadConfig();
const store = new Store(config.dataDir);
const browsers = new BrowserPool(config);
const adapter = new FlowAdapter(config, store, browsers);
const agent = new GoogleAgent(config, store, browsers);
const ugcEngine = new UgcEngine(config, store, agent, adapter);
const hookEngine = new HookEngine(config, store, agent, adapter);
const fashionEngine = new FashionEngine(config, store, agent, adapter);
const kineticEngine = new KineticEngine(config, store, agent, adapter);
const affiliateEngine = new AffiliateEngine(config, store, agent, adapter);
const worker = config.embeddedWorker ? new JobWorker(config, store, adapter) : null;
const openApiSpec = createOpenApiSpec(config);

const app = Fastify({ logger: { redact: ['req.headers.authorization', 'body.webhookSecret'] }, bodyLimit: 1_000_000 });
app.addContentTypeParser('application/x-www-form-urlencoded', { parseAs: 'string' }, (req, body, done) => {
  try {
    const params = new URLSearchParams(body);
    const parsed = {};
    for (const [key, val] of params.entries()) {
      if (val === '') continue;
      if (/^-?\d+$/.test(val)) {
        parsed[key] = parseInt(val, 10);
      } else if (val === 'true') {
        parsed[key] = true;
      } else if (val === 'false') {
        parsed[key] = false;
      } else {
        parsed[key] = val;
      }
    }
    done(null, parsed);
  } catch (err) {
    done(err);
  }
});
await app.register(cors, {
  origin: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Idempotency-Key'],
});
await app.register(rateLimit, { max: 120, timeWindow: '1 minute' });
await app.register(swagger, {
  mode: 'static',
  specification: {
    document: openApiSpec,
  },
});
await app.register(swaggerUi, {
  routePrefix: '/docs',
  uiConfig: {
    docExpansion: 'list',
    deepLinking: true,
    displayRequestDuration: true,
    persistAuthorization: true,
  },
  staticCSP: true,
  transformStaticCSP: (header) => header,
});

function authorized(header = '', query = {}) {
  let token = '';
  if (header && typeof header === 'string') {
    token = header.replace(/^Bearer\s+/i, '').trim();
  }
  if (!token && query && typeof query === 'object') {
    token = (query.token || query.api_key || query.apiKey || '').trim();
  }
  if (!token) return false;
  const actual = Buffer.from(token);
  const expected = Buffer.from(config.apiKey);
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}

app.addHook('onRequest', async (request) => {
  if (request.method === 'OPTIONS') return;
  const url = request.url.split('?')[0];
  if (
    url === '/' ||
    url === '/healthz' ||
    url === '/openapi.json' ||
    url === '/docs' ||
    url.startsWith('/docs/') ||
    url === '/reference' ||
    url === '/scalar' ||
    url === '/favicon.ico' ||
    url.startsWith('/v1/media/') ||
    url.startsWith('/data/chains/') ||
    url.includes('/stream') ||
    /^\/v1\/jobs\/[^/]+\/stream$/.test(url)
  ) return;
  if (!authorized(request.headers.authorization, request.query)) throw new AppError(401, 'unauthorized', 'API key tidak valid');
});

app.setErrorHandler((error, request, reply) => {
  if ((error.statusCode ?? 500) >= 500) request.log.error({ err: error }, 'request failed');
  reply.code(error.status ?? error.statusCode ?? 500).send(errorBody(error, request.id));
});

app.get('/', async (request, reply) => reply.redirect('/docs'));
app.get('/healthz', async () => ({ ok: true, service: 'flow-api-platform', version: '1.0.0-alpha.2' }));
app.get('/openapi.json', async () => openApiSpec);
app.get('/reference', async (request, reply) => {
  reply.type('text/html').send(renderScalarHtml('/openapi.json', 'Flow API Platform - Reference'));
});
app.get('/scalar', async (request, reply) => {
  reply.type('text/html').send(renderScalarHtml('/openapi.json', 'Flow API Platform - Reference'));
});

app.get('/v1/accounts', async () => ({ data: store.listAccounts() }));
app.post('/v1/accounts', async (request, reply) => {
  const input = parse(AccountInput, request.body);
  if (input.error) throw new AppError(400, 'validation_error', 'Input akun tidak valid', input.error);
  const account = store.createAccount(input.data);
  reply.code(201);
  return { data: account, next: `POST /v1/accounts/${account.id}/setup lalu login pada Chrome yang terbuka` };
});
app.patch('/v1/accounts/:id', async (request) => {
  const input = parse(AccountUpdate, request.body);
  if (input.error) throw new AppError(400, 'validation_error', 'Update akun tidak valid', input.error);
  return { data: store.updateAccount(request.params.id, input.data) };
});
app.post('/v1/accounts/:id/setup', async (request, reply) => {
  const account = store.getAccountInternal(request.params.id);
  if (!account) throw new AppError(404, 'account_not_found', 'Akun tidak ditemukan');
  const result = await adapter.beginSetup(account);
  if (result.state === 'ready') store.markAccount(account.id, 'ready', 100);
  reply.code(202);
  return { data: result, message: 'Selesaikan login langsung di jendela Chrome akun ini.' };
});
app.get('/v1/accounts/:id/setup/status', async (request) => {
  const account = store.getAccountInternal(request.params.id);
  if (!account) throw new AppError(404, 'account_not_found', 'Akun tidak ditemukan');
  const result = await adapter.setupStatus(account);
  if (result.state === 'ready') {
    store.markAccount(account.id, 'ready', 100);
    try { const credits = await adapter.creditSnapshot(account); store.updateCredits(account.id, credits.remaining, credits.raw); } catch {}
  }
  return { data: result, account: store.getAccount(account.id) };
});
app.post('/v1/accounts/:id/credits/refresh', async (request) => {
  const account = store.getAccountInternal(request.params.id);
  if (!account) throw new AppError(404, 'account_not_found', 'Akun tidak ditemukan');
  const credits = await adapter.creditSnapshot(account);
  store.updateCredits(account.id, credits.remaining, credits.raw);
  return { data: store.getAccount(account.id), credits };
});
app.post('/v1/accounts/:id/verify', async (request) => {
  const account = store.getAccountInternal(request.params.id);
  if (!account) throw new AppError(404, 'account_not_found', 'Akun tidak ditemukan');
  await adapter.authenticatedPage(account);
  store.markAccount(account.id, 'ready', 100);
  return { data: store.getAccount(account.id) };
});

app.get('/v1/routing', async () => ({ data: store.getRouting() }));
app.put('/v1/routing', async (request) => {
  const input = parse(RoutingInput, request.body);
  if (input.error) throw new AppError(400, 'validation_error', 'Routing policy tidak valid', input.error);
  return { data: store.setRouting(input.data) };
});
app.get('/v1/project-bindings', async () => ({ data: store.listProjectBindings() }));
app.put('/v1/project-bindings', async (request) => {
  const input = parse(ProjectBindingInput, request.body);
  if (input.error) throw new AppError(400, 'validation_error', 'Project binding tidak valid', input.error);
  const value = input.data;
  return { data: store.bindProject(value.projectKey, value.accountId, value.flowProjectId ?? null, value.allowFailover) };
});

async function createGeneration(request, reply, type, schema) {
  const input = parse(schema, request.body);
  if (input.error) throw new AppError(400, 'validation_error', 'Request generation tidak valid', input.error);
  const body = input.data;
  let replyUrl = null;
  let webhookSecret;
  let webhookSecretBlob = null;
  if (body.replyUrl) {
    replyUrl = await validateWebhookUrl(body.replyUrl, config.webhookAllowHttp);
    webhookSecret = crypto.randomBytes(32).toString('base64url');
    webhookSecretBlob = encryptJson({ secret: webhookSecret }, config.masterKey);
  }
  const idempotencyKey = request.headers['idempotency-key'];
  if (idempotencyKey && (typeof idempotencyKey !== 'string' || idempotencyKey.length > 200)) {
    throw new AppError(400, 'invalid_idempotency_key', 'Idempotency-Key tidak valid');
  }
  const result = store.createJob({ type, accountId: body.accountId, request: { ...body, replyUrl: undefined },
    replyUrl, webhookSecretBlob, idempotencyKey, maxAttempts: config.maxAttempts });
  const shouldWait = request.query?.wait === 'true' || request.query?.wait === '1' || request.headers['prefer'] === 'wait';
  if (shouldWait) {
    const timeoutMs = Math.min(Number(request.query?.timeoutMs ?? 90_000), 120_000);
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 1000));
      const current = store.getJob(result.job.id);
      if (current && (current.state === 'completed' || current.state === 'succeeded')) {
        reply.code(200);
        return { data: current, reused: result.reused, ...(webhookSecret && !result.reused ? { webhookSecret } : {}) };
      }
      if (current && (current.state === 'failed' || current.state === 'cancelled')) {
        reply.code(current.state === 'failed' ? 502 : 409);
        return { data: current, error: current.error };
      }
    }
  }

  reply.code(result.reused ? 200 : 202);
  return { data: result.job, reused: result.reused, ...(webhookSecret && !result.reused ? { webhookSecret } : {}) };
}

app.post('/v1/images', (request, reply) => createGeneration(request, reply, 'image', ImageInput));
app.post('/v1/videos', (request, reply) => createGeneration(request, reply, 'video', VideoInput));
app.post('/v1/videos/chain', (request, reply) => createGeneration(request, reply, 'video_chain', VideoChainInput));

app.post('/v1/agent/storyboard', async (request, reply) => {
  const parsed = parse(StoryboardInput, request.body ?? {});
  if (parsed.error) throw new AppError(400, 'validation_error', 'Input storyboard tidak valid', parsed.error);
  const result = await agent.generateStoryboard(parsed.data);
  return { data: result };
});

app.post('/v1/agent/prompt-enhance', async (request, reply) => {
  const parsed = parse(PromptEnhanceInput, request.body ?? {});
  if (parsed.error) throw new AppError(400, 'validation_error', 'Input prompt enhance tidak valid', parsed.error);
  const enhanced = await agent.enhancePrompt(parsed.data.prompt, parsed.data);
  return { data: { original: parsed.data.prompt, enhanced } };
});

app.post('/v1/ugc/generate', async (request, reply) => {
  const parsed = parse(UgcGenerateInput, request.body ?? {});
  if (parsed.error) throw new AppError(400, 'validation_error', 'Input UGC generate tidak valid', parsed.error);
  const idempotencyKey = request.headers['idempotency-key'] ?? null;
  const result = await ugcEngine.planAndGenerate(parsed.data, idempotencyKey);
  reply.code(202);
  return { data: result };
});

app.post('/v1/hooks/generate', async (request, reply) => {
  const parsed = parse(HookGenerateInput, request.body ?? {});
  if (parsed.error) throw new AppError(400, 'validation_error', 'Input Hook generate tidak valid', parsed.error);
  const idempotencyKey = request.headers['idempotency-key'] ?? null;
  const result = await hookEngine.generateHooks(parsed.data, idempotencyKey);
  reply.code(200);
  return { data: result };
});

app.post('/v1/fashion/generate', async (request, reply) => {
  const parsed = parse(FashionGenerateInput, request.body ?? {});
  if (parsed.error) throw new AppError(400, 'validation_error', 'Input Fashion generate tidak valid', parsed.error);
  const idempotencyKey = request.headers['idempotency-key'] ?? null;
  const result = await fashionEngine.planAndGenerate(parsed.data, idempotencyKey);
  reply.code(202);
  return { data: result };
});

app.post('/v1/kinetic/generate', async (request, reply) => {
  const parsed = parse(KineticGenerateInput, request.body ?? {});
  if (parsed.error) throw new AppError(400, 'validation_error', 'Input Kinetic generate tidak valid', parsed.error);
  const idempotencyKey = request.headers['idempotency-key'] ?? null;
  const result = await kineticEngine.planAndGenerate(parsed.data, idempotencyKey);
  reply.code(202);
  return { data: result };
});

app.post('/v1/agent/voiceover', async (request, reply) => {
  const text = request.body?.text || request.body?.prompt;
  const lang = request.body?.lang || 'id';
  if (!text || typeof text !== 'string') throw new AppError(400, 'invalid_text', 'Teks voiceover wajib diisi');

  const voFilename = `vo_${Date.now()}_${crypto.randomBytes(4).toString('hex')}.mp3`;
  const voDir = path.resolve(config.dataDir, 'voiceovers');
  fs.mkdirSync(voDir, { recursive: true });
  const voPath = path.join(voDir, voFilename);

  await generateVoiceover(text, voPath, lang);
  return {
    data: {
      text,
      lang,
      url: `/v1/media/voiceovers/${voFilename}`,
      downloadUrl: `/v1/media/voiceovers/${voFilename}?download=true`,
    },
  };
});

app.get('/v1/media/voiceovers/:filename', async (request, reply) => {
  const { filename } = request.params;
  if (!/^[a-zA-Z0-9_.-]+$/.test(filename) || filename.includes('..')) {
    throw new AppError(400, 'invalid_filename', 'Nama file voiceover tidak valid');
  }
  const filePath = path.resolve(config.dataDir, 'voiceovers', filename);
  if (!fs.existsSync(filePath)) {
    throw new AppError(404, 'file_not_found', 'File voiceover tidak ditemukan');
  }
  const stat = fs.statSync(filePath);
  if (request.query?.download === 'true' || request.query?.download === '1') {
    reply.header('Content-Disposition', `attachment; filename="${filename}"`);
  }
  reply.header('Content-Type', 'audio/mpeg');
  reply.header('Content-Length', stat.size);
  return reply.send(fs.createReadStream(filePath));
});



async function serveChainMedia(request, reply) {
  const { jobId, filename } = request.params;
  if (!/^job_[a-zA-Z0-9_-]+$/.test(jobId) && !/^[a-zA-Z0-9_-]{1,64}$/.test(jobId)) {
    throw new AppError(400, 'invalid_job_id', 'Job ID tidak valid');
  }
  if (!/^[a-zA-Z0-9_.-]+$/.test(filename) || filename.includes('..')) {
    throw new AppError(400, 'invalid_filename', 'Nama file tidak valid');
  }

  const filePath = path.resolve(config.dataDir, 'chains', jobId, filename);
  if (!fs.existsSync(filePath)) {
    throw new AppError(404, 'file_not_found', 'File media rantai video tidak ditemukan');
  }

  const stat = fs.statSync(filePath);
  const ext = path.extname(filename).toLowerCase();
  const contentType = ext === '.mp4' ? 'video/mp4' : (ext === '.png' ? 'image/png' : (ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' : 'application/octet-stream'));

  if (request.query?.download === 'true' || request.query?.download === '1') {
    reply.header('Content-Disposition', `attachment; filename="${filename}"`);
  }

  if (ext === '.mp4') {
    const range = request.headers.range;
    if (range) {
      const parts = range.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : stat.size - 1;
      const chunksize = (end - start) + 1;
      reply.raw.writeHead(206, {
        'Content-Range': `bytes ${start}-${end}/${stat.size}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': chunksize,
        'Content-Type': 'video/mp4',
      });
      fs.createReadStream(filePath, { start, end }).pipe(reply.raw);
      return reply;
    }
  }

  reply.header('Content-Type', contentType);
  reply.header('Content-Length', stat.size);
  reply.header('Accept-Ranges', 'bytes');
  return reply.send(fs.createReadStream(filePath));
}

app.get('/v1/media/chains/:jobId/:filename', serveChainMedia);
app.get('/data/chains/:jobId/:filename', serveChainMedia);

app.get('/v1/jobs/:jobId/stream', async (request, reply) => {
  const { jobId } = request.params;
  if (!/^job_[a-zA-Z0-9_-]+$/.test(jobId) && !/^[a-zA-Z0-9_-]{1,64}$/.test(jobId)) {
    throw new AppError(400, 'invalid_job_id', 'Job ID tidak valid');
  }

  const chainDir = path.resolve(config.dataDir, 'chains', jobId);
  const masterPath = path.resolve(chainDir, 'master.mp4');

  if (fs.existsSync(masterPath)) {
    request.params.filename = 'master.mp4';
    return serveChainMedia(request, reply);
  }

  const job = store.getJob(jobId);
  if (!job) {
    throw new AppError(404, 'job_not_found', 'Job tidak ditemukan');
  }

  if (job.state === 'failed') {
    throw new AppError(500, 'job_failed', `Job rendering gagal: ${job.error?.message || 'Terjadi kesalahan sistem'}`);
  }

  // Check if any segment is rendered for early preview (?segment=0, 1, 2)
  if (request.query?.segment !== undefined) {
    const segIdx = parseInt(request.query.segment, 10) || 0;
    const segPath = path.resolve(chainDir, `segment_${segIdx}.mp4`);
    if (fs.existsSync(segPath)) {
      request.params.filename = `segment_${segIdx}.mp4`;
      return serveChainMedia(request, reply);
    }
  }

  // Master is not yet finished rendering; return 202 with retry info
  reply.header('Retry-After', '3');
  return reply.code(202).send({
    status: job.state || 'running',
    progress: job.progress || 0,
    message: 'Video master masih dalam proses rendering rangkaian kontinuitas...',
    jobId: job.id,
  });
});

app.post('/v1/videos/upscale', async (request, reply) => {
  const parsed = parse(UpscaleInput, request.body ?? {});
  if (parsed.error) throw new AppError(400, 'validation_error', 'Input upscale tidak valid', parsed.error);
  const body = parsed.data;

  let targetMediaId = body.mediaId;
  let targetProjectId = body.projectId;
  let accountId = body.accountId;

  if (body.jobId && !targetMediaId) {
    const origJob = store.getJob(body.jobId);
    if (!origJob) throw new AppError(404, 'job_not_found', 'Job asal untuk upscale tidak ditemukan');
    if (origJob.result?.mediaIds?.length) {
      targetMediaId = origJob.result.mediaIds[0];
    }
    if (!targetProjectId) targetProjectId = origJob.checkpoint?.projectId || origJob.request?.projectId;
    if (!accountId) accountId = origJob.accountId;
  }

  let replyUrl = null;
  let webhookSecret;
  let webhookSecretBlob = null;
  if (body.replyUrl) {
    replyUrl = await validateWebhookUrl(body.replyUrl, config.webhookAllowHttp);
    webhookSecret = crypto.randomBytes(32).toString('base64url');
    webhookSecretBlob = encryptJson({ secret: webhookSecret }, config.masterKey);
  }

  const result = store.createJob({
    type: 'video_upscale',
    accountId,
    request: {
      mediaId: targetMediaId,
      projectId: targetProjectId,
      targetResolution: body.targetResolution || '1080p',
      type: body.type || 'video',
      accountId,
      replyUrl,
    },
    replyUrl,
    webhookSecretBlob,
    maxAttempts: config.maxAttempts,
  });

  const shouldWait = request.query?.wait === 'true' || request.query?.wait === '1' || request.headers['prefer'] === 'wait';
  if (shouldWait) {
    const timeoutMs = Math.min(Number(request.query?.timeoutMs ?? 90_000), 120_000);
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 1000));
      const current = store.getJob(result.job.id);
      if (current && (current.state === 'completed' || current.state === 'succeeded')) {
        reply.code(200);
        return { data: current, reused: result.reused, ...(webhookSecret && !result.reused ? { webhookSecret } : {}) };
      }
      if (current && (current.state === 'failed' || current.state === 'cancelled')) {
        reply.code(current.state === 'failed' ? 502 : 409);
        return { data: current, error: current.error };
      }
    }
  }

  reply.code(202);
  return { data: result.job, reused: result.reused, ...(webhookSecret && !result.reused ? { webhookSecret } : {}) };
});

app.get('/v1/jobs', async (request) => {
  const limit = Math.min(Math.max(Number(request.query?.limit ?? 50), 1), 200);
  return { data: store.listJobs(limit, request.query?.state ?? null) };
});
app.get('/v1/jobs/:id', async (request) => {
  const job = store.getJob(request.params.id);
  if (!job) throw new AppError(404, 'job_not_found', 'Job tidak ditemukan');
  return { data: job, events: store.events(job.id) };
});
app.post('/v1/jobs/:id/cancel', async (request) => {
  if (!store.getJob(request.params.id)) throw new AppError(404, 'job_not_found', 'Job tidak ditemukan');
  if (!store.cancelJob(request.params.id)) throw new AppError(409, 'job_not_cancellable', 'Job sedang berjalan atau sudah selesai');
  return { data: store.getJob(request.params.id) };
});

async function readWithAccount(preferredId, action) {
  const account = store.acquireAccount(preferredId);
  if (!account) throw new AppError(503, 'no_healthy_account', 'Tidak ada akun Flow siap');
  let success = false;
  try { const data = await action(account); success = true; return data; }
  finally { store.releaseAccount(account.id, success); }
}

function getCreditsSummaryFromDb() {
  const accounts = store.listAccounts();
  let totalRemaining = 0;
  const results = accounts.map((acc) => {
    const remaining = acc.creditsRemaining ?? null;
    if (remaining != null && !Number.isNaN(Number(remaining))) {
      totalRemaining += Number(remaining);
    }
    return {
      accountId: acc.id,
      label: acc.label,
      profileName: acc.profileName,
      status: acc.status,
      remaining,
      checkedAt: acc.creditsCheckedAt ?? null,
    };
  });

  return {
    data: results,
    totalCreditsRemaining: totalRemaining,
    accountCount: results.length,
    cached: true,
  };
}

async function checkCreditsAll() {
  const accounts = store.listAccounts().filter((a) => a.status !== 'paused');
  const results = [];
  let totalRemaining = 0;

  for (const acc of accounts) {
    const internal = store.getAccountInternal(acc.id);
    try {
      const snapshot = await adapter.creditSnapshot(internal);
      store.updateCredits(acc.id, snapshot.remaining, snapshot.raw);
      if (snapshot.remaining != null) totalRemaining += snapshot.remaining;
      const updated = store.getAccount(acc.id);
      results.push({
        accountId: acc.id,
        label: acc.label,
        profileName: acc.profileName,
        status: updated.status,
        remaining: snapshot.remaining,
        checkedAt: updated.creditsCheckedAt,
      });
    } catch (err) {
      results.push({
        accountId: acc.id,
        label: acc.label,
        profileName: acc.profileName,
        status: acc.status,
        remaining: acc.creditsRemaining ?? null,
        error: err.message || 'Gagal membaca kredit',
      });
    }
  }

  return {
    data: results,
    totalCreditsRemaining: totalRemaining,
    accountCount: results.length,
    cached: false,
  };
}

app.get('/v1/models', async (request) => {
  const isRaw = request.query?.raw === 'true' || request.query?.raw === '1';
  const result = await readWithAccount(request.query?.accountId, async (account) => {
    const rawModels = await adapter.read(account, 'models', []);
    const rawStatuses = await adapter.read(account, 'modelStatuses', []);
    if (isRaw) return { models: rawModels, statuses: rawStatuses };
    return mapModels(rawModels, rawStatuses);
  });
  return { data: result };
});

app.get('/v1/credits', async (request) => {
  const accountId = request.query?.accountId;
  const refresh = request.query?.refresh === 'true' || request.query?.refresh === '1';

  if (refresh) {
    if (accountId && accountId !== 'all') {
      const internal = store.getAccountInternal(accountId);
      if (!internal) throw new AppError(404, 'account_not_found', 'Akun tidak ditemukan');
      const snapshot = await adapter.creditSnapshot(internal);
      store.updateCredits(internal.id, snapshot.remaining, snapshot.raw);
      const updated = store.getAccount(internal.id);
      return {
        data: {
          accountId: updated.id,
          label: updated.label,
          profileName: updated.profileName,
          status: updated.status,
          remaining: snapshot.remaining,
          checkedAt: updated.creditsCheckedAt,
        },
        cached: false,
      };
    }
    return checkCreditsAll();
  }

  // DEFAULT: Read directly from DB (No hit to Flow!)
  if (accountId && accountId !== 'all') {
    const acc = store.getAccount(accountId);
    if (!acc) throw new AppError(404, 'account_not_found', 'Akun tidak ditemukan');
    return {
      data: {
        accountId: acc.id,
        label: acc.label,
        profileName: acc.profileName,
        status: acc.status,
        remaining: acc.creditsRemaining ?? null,
        checkedAt: acc.creditsCheckedAt ?? null,
      },
      cached: true,
    };
  }

  return getCreditsSummaryFromDb();
});

app.post('/v1/credits/refresh', async (request) => {
  const accountId = request.query?.accountId ?? request.body?.accountId;
  if (accountId && accountId !== 'all') {
    const internal = store.getAccountInternal(accountId);
    if (!internal) throw new AppError(404, 'account_not_found', 'Akun tidak ditemukan');
    const snapshot = await adapter.creditSnapshot(internal);
    store.updateCredits(internal.id, snapshot.remaining, snapshot.raw);
    const updated = store.getAccount(internal.id);
    return {
      data: {
        accountId: updated.id,
        label: updated.label,
        profileName: updated.profileName,
        status: updated.status,
        remaining: snapshot.remaining,
        checkedAt: updated.creditsCheckedAt,
      },
      cached: false,
    };
  }
  return checkCreditsAll();
});
app.get('/v1/projects', async (request) => {
  const isRaw = request.query?.raw === 'true' || request.query?.raw === '1';
  const pageSize = Math.min(Number(request.query?.pageSize ?? 21), 100);
  const pageToken = request.query?.pageToken ?? null;
  const result = await readWithAccount(request.query?.accountId, async (account) => {
    const raw = await adapter.read(account, 'projects', ['projects/*', pageSize, pageToken]);
    if (isRaw) return raw;
    return mapProjects(raw);
  });
  return { data: result };
});
app.get('/v1/projects/:id/contents', async (request) => {
  const isRaw = request.query?.raw === 'true' || request.query?.raw === '1';
  const result = await readWithAccount(request.query?.accountId, async (account) => {
    const raw = await adapter.read(account, 'contents', [`projects/${request.params.id}`, null, null, null, [1]], `/project/${request.params.id}`);
    if (isRaw) return raw;
    return mapProjectContents(request.params.id, raw);
  });
  return { data: result };
});

app.post('/v1/affiliate/scrape', async (request) => {
  const url = request.body?.url;
  if (!url || typeof url !== 'string') {
    throw new AppError(400, 'validation_error', 'Field url Shopee atau TikTok Shop wajib diisi');
  }
  const result = await scrapeAffiliateProduct(url, { chromePath: config.chromePath });
  return { data: result };
});

app.post('/v1/affiliate/generate', async (request, reply) => {
  const parsed = parse(AffiliateGenerateInput, request.body ?? {});
  if (parsed.error) throw new AppError(400, 'validation_error', 'Input Affiliate generate tidak valid', parsed.error);
  const idempotencyKey = request.headers['idempotency-key'] ?? null;
  const result = await affiliateEngine.planAndGenerate(parsed.data, idempotencyKey);
  reply.code(202);
  return { data: result };
});

app.post('/v1/affiliate/plan', async (request, reply) => {
  const parsed = parse(AffiliateGenerateInput, request.body ?? {});
  if (parsed.error) throw new AppError(400, 'validation_error', 'Input Affiliate plan tidak valid', parsed.error);

  const isSse =
    request.headers.accept?.includes('text/event-stream') ||
    request.query?.stream === 'true' ||
    request.query?.stream === '1';

  if (!isSse) {
    const result = await affiliateEngine.plan({ ...parsed.data, storyboard: undefined, startFrame: undefined });
    reply.code(200);
    return { data: result };
  }

  reply.hijack();
  reply.raw.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',
    'Access-Control-Allow-Origin': '*',
  });

  const sendEvent = (event, data) => {
    if (!reply.raw.writableEnded) {
      reply.raw.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    }
  };

  const heartbeat = setInterval(() => {
    if (!reply.raw.writableEnded) {
      reply.raw.write(': heartbeat\n\n');
    }
  }, 2500);

  request.raw.on('close', () => {
    clearInterval(heartbeat);
  });

  try {
    sendEvent('status', { message: 'Menghubungkan ke AI Planner (9router)...' });
    let tokenCount = 0;
    let lastTokenReport = Date.now();

    const result = await affiliateEngine.plan(
      { ...parsed.data, storyboard: undefined, startFrame: undefined },
      (event) => {
        if (event.type === 'status') {
          sendEvent('status', { message: event.message });
        } else if (event.type === 'token') {
          tokenCount++;
          const now = Date.now();
          if (now - lastTokenReport > 500) {
            lastTokenReport = now;
            sendEvent('progress', {
              stage: 'generating_storyboard',
              message: `Menyusun naskah & continuity shot (${tokenCount} tokens)...`,
              tokens: tokenCount,
            });
          }
        } else if (event.type === 'reasoning') {
          const now = Date.now();
          if (now - lastTokenReport > 1000) {
            lastTokenReport = now;
            sendEvent('status', { message: 'Menganalisis USP & formula visual produk...' });
          }
        }
      }
    );

    sendEvent('complete', { data: result });
  } catch (error) {
    const status = error.status || 500;
    const message = error.message || 'Gagal menyusun storyboard affiliate';
    sendEvent('error', {
      error: {
        code: error.code || 'affiliate_plan_failed',
        message,
        status,
      },
    });
  } finally {
    clearInterval(heartbeat);
    if (!reply.raw.writableEnded) {
      reply.raw.end();
    }
  }
});

app.post('/v1/affiliate/reroll-clip', async (request, reply) => {
  const parsed = parse(AffiliateRerollInput, request.body ?? {});
  if (parsed.error) throw new AppError(400, 'validation_error', 'Input Affiliate reroll tidak valid', parsed.error);
  const result = await affiliateEngine.rerollClip(parsed.data);
  reply.code(200);
  return { data: result };
});

worker?.start();
await app.listen({ host: config.host, port: config.port });

for (const signal of ['SIGINT','SIGTERM']) process.once(signal, async () => {
  await worker?.stop(); await browsers.close(); await app.close(); process.exit(0);
});

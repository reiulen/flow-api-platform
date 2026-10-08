import crypto from 'node:crypto';
import { decryptJson } from './crypto.js';
import { deliverWebhook } from './webhook.js';

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export class JobWorker {
  constructor(config, store, adapter) {
    this.config = config; this.store = store; this.adapter = adapter;
    this.id = `worker_${crypto.randomUUID()}`; this.running = false;
  }
  start() {
    if (this.running) return;
    this.running = true;
    this.loops = Array.from({ length: this.config.concurrency }, () => this.jobLoop());
    this.webhookLoopPromise = this.webhookLoop();
  }
  async stop() { this.running = false; await Promise.allSettled([...(this.loops ?? []), this.webhookLoopPromise]); }

  async jobLoop() {
    while (this.running) {
      const job = this.store.claimJob(this.id, this.config.jobTimeoutMs + 60_000);
      if (!job) { await delay(750); continue; }
      const account = this.store.acquireAccount({
        preferredId: job.request.accountId ?? null,
        strictPreferred: !!job.request.accountId,
        projectKey: job.request.projectKey ?? null,
      });
      if (!account) {
        this.store.unclaimJob(job.id);
        await delay(1500);
        continue;
      }
      this.store.assignJobAccount(job.id, account.id);
      let success = false;
      try {
        const result = await this.adapter.execute(job, account);
        this.store.finishJob(job.id, result); success = true;
        try {
          const credits = await this.adapter.creditSnapshot(account);
          this.store.updateCredits(account.id, credits.remaining, credits.raw);
        } catch {}
        const updated = this.store.getJob(job.id);
        if (updated.replyUrl) this.store.enqueueWebhook(job.id, updated.replyUrl);
      } catch (error) {
        if (error.code === 'action_required') this.store.markAccount(account.id, 'action_required', 0);
        if (error.code === 'account_credits_exhausted') { this.store.markExhausted(account.id); success = true; }
        const isRateLimit = error.code === 'rate_limit_exceeded' || /batas penggunaan|terlalu banyak|rate.*limit/i.test(error.message || '');
        const retryable = error.code !== 'action_required' && !String(error.code).startsWith('invalid_');
        const backoff = new Date(Date.now() + Math.min(300_000, 5000 * 2 ** job.attempts) + Math.floor(Math.random() * 1000)).toISOString();
        const nextAvailable = isRateLimit ? new Date().toISOString() : backoff;
        this.store.failJob(job.id, { code: error.code ?? 'worker_error', message: error.message }, retryable ? nextAvailable : null);
      } finally {
        const isRateLimit = !success && (/batas penggunaan|terlalu banyak|rate.*limit/i.test(job.error_json || ''));
        this.store.releaseAccount(account.id, success, isRateLimit ? 60 : 5);
      }
    }
  }

  async webhookLoop() {
    while (this.running) {
      const delivery = this.store.claimWebhook();
      if (!delivery) { await delay(1000); continue; }
      try {
        const internal = this.store.getJobInternal(delivery.job_id);
        const secret = decryptJson(internal.webhook_secret_blob, this.config.masterKey).secret;
        await deliverWebhook(delivery.url, this.store.getJob(delivery.job_id), secret);
        this.store.finishWebhook(delivery.id);
      } catch (error) { this.store.retryWebhook(delivery.id, delivery.attempts, error.message); }
    }
  }
}

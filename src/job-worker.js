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
      try { this.store.reconcileLeases(); } catch {}
      const job = this.store.claimJob(this.id, this.config.jobTimeoutMs + 60_000);
      if (!job) { await delay(750); continue; }
      const failedAccountIds = Array.isArray(job.checkpoint?.failedAccountIds)
        ? job.checkpoint.failedAccountIds
        : (job.account_id && job.attempts > 0 ? [job.account_id] : []);

      const account = this.store.acquireAccount({
        preferredId: job.request.accountId ?? null,
        strictPreferred: Boolean(job.request.accountId && !failedAccountIds.includes(job.request.accountId)),
        excludeIds: failedAccountIds,
        projectKey: job.request.projectKey ?? null,
      });
      if (!account) {
        this.store.unclaimJob(job.id);
        await delay(1500);
        continue;
      }
      this.store.assignJobAccount(job.id, account.id);
      let success = false;
      let errorOccurred = null;
      const originalModel = job.request?.model;

      // Fallback model hierarchy per job type
      const getFallbackModels = (type, currentModel) => {
        if (type === 'image') {
          const isPro = /pro/i.test(currentModel || '');
          return isPro ? ['nano-banana-2'] : ['nano-banana-pro'];
        }
        if (type === 'video') {
          const isVeo = /veo/i.test(currentModel || '');
          return isVeo ? ['omni-1-1-flash'] : ['veo-3.1-fast'];
        }
        return [];
      };

      const fallbackModels = getFallbackModels(job.type, job.request?.model);
      const triedModels = [job.request?.model].filter(Boolean);

      while (true) {
        try {
          const result = await this.adapter.execute(job, account);
          this.store.finishJob(job.id, result);
          success = true;
          try {
            const credits = await this.adapter.creditSnapshot(account);
            this.store.updateCredits(account.id, credits.remaining, credits.raw);
          } catch {}
          const updated = this.store.getJob(job.id);
          if (updated?.replyUrl) this.store.enqueueWebhook(job.id, updated.replyUrl);
          break; // Job completed successfully!
        } catch (error) {
          errorOccurred = error;
          console.error(`[JobWorker] ❌ Job ${job.id} (${job.type}) [model: ${job.request?.model || 'default'}] gagal di akun "${account.label || account.id}": [${error.code || 'worker_error'}] ${error.message}`);

          if (error.code === 'action_required') { this.store.markAccount(account.id, 'action_required', 0); break; }
          if (error.code === 'account_credits_exhausted') { this.store.markExhausted(account.id); success = true; break; }

          // Kalo timeout: langsung pindah ke akun lain sesuai instruksi user
          if (error.code === 'generation_timeout') {
            console.log(`[JobWorker] ⏱️ Timeout di akun "${account.label}". Langsung rotasi ke akun berikutnya!`);
            break;
          }

          // Coba fallback model di AKUN INI terlebih dahulu
          const nextModel = fallbackModels.find((m) => !triedModels.includes(m));
          if (nextModel) {
            console.log(`[JobWorker] 🔄 Model "${job.request?.model}" error di akun "${account.label}". Mencoba fallback model "${nextModel}" pada akun yang sama...`);
            triedModels.push(nextModel);
            job.request.model = nextModel;
            this.store.updateJobRequest(job.id, job.request);
            await delay(1000);
            continue;
          }

          // Semua model telah dicoba dan gagal di akun ini: baru pindah ke akun berikutnya!
          console.log(`[JobWorker] 🛑 Semua model telah dicoba dan gagal di akun "${account.label}". Pindah ke akun berikutnya!`);
          break;
        }
      }

      if (!success && originalModel && job.request?.model !== originalModel) {
        job.request.model = originalModel;
        this.store.updateJobRequest(job.id, job.request);
      }

      if (!success && errorOccurred) {
        // Catat akun yang gagal agar percobaan berikutnya PASTI pindah ke akun lain
        const currentFailed = Array.isArray(job.checkpoint?.failedAccountIds) ? [...job.checkpoint.failedAccountIds] : [];
        if (account?.id && !currentFailed.includes(account.id)) {
          currentFailed.push(account.id);
        }
        this.store.checkpoint(job.id, { ...(job.checkpoint || {}), phase: null, failedAccountIds: currentFailed });

        const isRateLimit = errorOccurred.code === 'rate_limit_exceeded' || /batas penggunaan|terlalu banyak|rate.*limit|unusual activity|aktivitas yang tidak biasa|too.*much.*traffic/i.test(errorOccurred.message || '');
        const isFatalContentError = errorOccurred.code === 'generation_failed_by_flow' && /violate|kebijakan|policy|safety/i.test(errorOccurred.message || '');
        const retryable = errorOccurred.code !== 'action_required' && !String(errorOccurred.code).startsWith('invalid_') && !isFatalContentError;

        // Jeda terukur: jika rate limit/unusual traffic, beri waktu jeda agar IP rate limit Google mereda
        const delaySeconds = isRateLimit ? 30 : 2;
        const nextAvailable = new Date(Date.now() + delaySeconds * 1000).toISOString();
        this.store.failJob(job.id, { code: errorOccurred.code ?? 'worker_error', message: errorOccurred.message, accountId: account.id, accountLabel: account.label }, retryable ? nextAvailable : null);
        if (retryable) {
          console.log(`[JobWorker] 🔄 Job ${job.id} dijadwalkan retry (attempt ${job.attempts + 1}/${job.maxAttempts}) ke akun berikutnya (${delaySeconds}s delay).`);
        } else {
          console.warn(`[JobWorker] 🛑 Job ${job.id} marked as failed without retry: ${errorOccurred.message}`);
          const updated = this.store.getJob(job.id);
          if (updated?.replyUrl) this.store.enqueueWebhook(job.id, updated.replyUrl);
        }
      }

      const isRateLimit = !success && errorOccurred && (errorOccurred.code === 'rate_limit_exceeded' || /batas penggunaan|terlalu banyak|rate.*limit|unusual activity|aktivitas yang tidak biasa|too.*much.*traffic/i.test(errorOccurred.message || ''));
      this.store.releaseAccount(account.id, success, isRateLimit ? 1.5 : 0);

      // Jeda nafas agar Google Flow tidak mendeteksi request burst dari IP lokal
      if (isRateLimit) {
        console.log('[JobWorker] ⏳ Rate limit terdeteksi, memberi jeda 15 detik sebelum memproses job berikutnya...');
        await delay(15000);
      } else if (success) {
        await delay(3000);
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

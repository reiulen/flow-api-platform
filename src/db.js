import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import crypto from 'node:crypto';
import { AppError } from './errors.js';

const now = () => new Date().toISOString();
const json = (value) => value == null ? null : JSON.stringify(value);
const parsed = (value) => value == null ? null : JSON.parse(value);

export class Store {
  constructor(dataDir) {
    fs.mkdirSync(dataDir, { recursive: true, mode: 0o700 });
    this.db = new DatabaseSync(path.join(dataDir, 'flow-api.sqlite'));
    this.db.exec('PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;');
    this.migrate();
    this.resetOrphanedJobsOnBoot();
    this.reconcileLeases();
  }

  migrate() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS accounts (
        id TEXT PRIMARY KEY, label TEXT NOT NULL, email TEXT, profile_name TEXT NOT NULL UNIQUE,
        project_id TEXT, status TEXT NOT NULL DEFAULT 'action_required', health_score INTEGER NOT NULL DEFAULT 100,
        consecutive_failures INTEGER NOT NULL DEFAULT 0, circuit_open_until TEXT,
        max_concurrency INTEGER NOT NULL DEFAULT 1, active_jobs INTEGER NOT NULL DEFAULT 0,
        secret_blob TEXT, priority INTEGER NOT NULL DEFAULT 100, credits_remaining INTEGER,
        credits_raw TEXT, credits_checked_at TEXT, exhausted_at TEXT, last_used_at TEXT,
        created_at TEXT NOT NULL, updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS jobs (
        id TEXT PRIMARY KEY, type TEXT NOT NULL, state TEXT NOT NULL, account_id TEXT,
        request_json TEXT NOT NULL, result_json TEXT, error_json TEXT, checkpoint_json TEXT, reply_url TEXT,
        webhook_secret_blob TEXT, idempotency_key TEXT, attempts INTEGER NOT NULL DEFAULT 0,
        max_attempts INTEGER NOT NULL, available_at TEXT NOT NULL, lease_until TEXT,
        worker_id TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, completed_at TEXT,
        FOREIGN KEY(account_id) REFERENCES accounts(id)
      );
      CREATE UNIQUE INDEX IF NOT EXISTS jobs_idempotency ON jobs(idempotency_key) WHERE idempotency_key IS NOT NULL;
      CREATE INDEX IF NOT EXISTS jobs_claim ON jobs(state, available_at, lease_until);
      CREATE TABLE IF NOT EXISTS job_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT, job_id TEXT NOT NULL, state TEXT NOT NULL,
        detail_json TEXT, created_at TEXT NOT NULL, FOREIGN KEY(job_id) REFERENCES jobs(id)
      );
      CREATE TABLE IF NOT EXISTS webhook_deliveries (
        id TEXT PRIMARY KEY, job_id TEXT NOT NULL, url TEXT NOT NULL, state TEXT NOT NULL,
        attempts INTEGER NOT NULL DEFAULT 0, available_at TEXT NOT NULL, last_error TEXT,
        created_at TEXT NOT NULL, updated_at TEXT NOT NULL, FOREIGN KEY(job_id) REFERENCES jobs(id)
      );
      CREATE TABLE IF NOT EXISTS routing_config (
        id INTEGER PRIMARY KEY CHECK(id=1), strategy TEXT NOT NULL, min_credits INTEGER NOT NULL,
        auto_failover INTEGER NOT NULL, updated_at TEXT NOT NULL
      );
      INSERT OR IGNORE INTO routing_config(id,strategy,min_credits,auto_failover,updated_at)
        VALUES(1,'balanced',1,1,datetime('now'));
      CREATE TABLE IF NOT EXISTS project_bindings (
        project_key TEXT PRIMARY KEY, account_id TEXT NOT NULL, flow_project_id TEXT,
        allow_failover INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
        FOREIGN KEY(account_id) REFERENCES accounts(id)
      );
    `);
    this.ensureColumn('accounts', 'priority', 'INTEGER NOT NULL DEFAULT 100');
    this.ensureColumn('accounts', 'credits_remaining', 'INTEGER');
    this.ensureColumn('accounts', 'credits_raw', 'TEXT');
    this.ensureColumn('accounts', 'credits_checked_at', 'TEXT');
    this.ensureColumn('accounts', 'exhausted_at', 'TEXT');
    this.ensureColumn('accounts', 'last_used_at', 'TEXT');
  }

  ensureColumn(table, column, definition) {
    const columns = this.db.prepare(`PRAGMA table_info(${table})`).all().map((row) => row.name);
    if (!columns.includes(column)) this.db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }

  resetOrphanedJobsOnBoot() {
    const ts = now();
    this.db.prepare(`UPDATE jobs SET state=CASE WHEN attempts >= max_attempts THEN 'failed' ELSE 'retrying' END,
      worker_id=NULL,lease_until=NULL,available_at=?,updated_at=?
      WHERE state='running'`).run(ts, ts);
    this.db.prepare(`UPDATE accounts SET active_jobs=0`).run();
  }

  reconcileLeases() {
    const ts = now();
    this.db.prepare(`UPDATE jobs SET state=CASE WHEN attempts >= max_attempts THEN 'failed' ELSE 'retrying' END,
      worker_id=NULL,lease_until=NULL,available_at=?,updated_at=?
      WHERE state='running' AND (lease_until IS NULL OR lease_until < ?)`).run(ts, ts, ts);
    this.db.prepare(`UPDATE jobs SET state='failed',completed_at=COALESCE(completed_at, ?) WHERE state='retrying' AND attempts >= max_attempts`).run(ts);
    this.db.prepare(`UPDATE accounts SET active_jobs=(SELECT COUNT(*) FROM jobs
      WHERE jobs.account_id=accounts.id AND jobs.state='running')`).run();
    this.db.prepare(`UPDATE webhook_deliveries SET state='retrying',available_at=?,updated_at=?
      WHERE state='delivering' AND updated_at<?`).run(ts, ts, new Date(Date.now() - 60_000).toISOString());
  }

  setAccountProject(id, projectId) {
    this.db.prepare('UPDATE accounts SET project_id=?,updated_at=? WHERE id=?').run(projectId, now(), id);
  }

  acquireAccount(options = {}) {
    if (typeof options === 'string' || options == null) options = { preferredId: options };
    const policy = this.getRouting();
    const binding = options.projectKey ? this.getProjectBinding(options.projectKey) : null;
    let preferredId = options.preferredId ?? binding?.accountId ?? null;
    const excludeIds = Array.isArray(options.excludeIds) ? options.excludeIds.filter(Boolean) : [];
    if (preferredId && excludeIds.includes(preferredId)) {
      preferredId = null;
    }
    const allowFailover = options.strictPreferred && preferredId ? false : (binding ? binding.allowFailover : policy.autoFailover);
    const strategy = options.strategy ?? policy.strategy;
    const minCredits = options.minCredits ?? policy.minCredits;
    const ts = now();
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const eligibleBase = `status='ready' AND active_jobs<max_concurrency
        AND (circuit_open_until IS NULL OR circuit_open_until<=?)
        AND (credits_remaining IS NULL OR credits_remaining>=?)`;
      let row = preferredId ? this.db.prepare(`SELECT * FROM accounts WHERE id=? AND ${eligibleBase}`).get(preferredId, ts, minCredits) : null;
      if (!row && preferredId && !allowFailover) { this.db.exec('COMMIT'); return null; }
      if (!row) {
        const order = strategy === 'exhaust_first'
          ? 'priority ASC, COALESCE(last_used_at, created_at) ASC'
          : strategy === 'round_robin'
            ? 'COALESCE(last_used_at, created_at) ASC'
            : '(active_jobs*100 + (100-health_score)) ASC, COALESCE(credits_remaining, 999999999) DESC, updated_at ASC';
        
        // Try accounts not in excludeIds first
        if (excludeIds.length > 0) {
          const placeholders = excludeIds.map(() => '?').join(',');
          row = this.db.prepare(`SELECT * FROM accounts WHERE ${eligibleBase} AND id NOT IN (${placeholders}) ORDER BY ${order} LIMIT 1`).get(ts, minCredits, ...excludeIds);
          // If no eligible account because of circuit cooldown, check other accounts not in excludeIds before falling back to excluded accounts
          if (!row) {
            row = this.db.prepare(`SELECT * FROM accounts WHERE status='ready' AND active_jobs<max_concurrency AND (credits_remaining IS NULL OR credits_remaining>=?) AND id NOT IN (${placeholders}) ORDER BY COALESCE(circuit_open_until, '') ASC, COALESCE(last_used_at, created_at) ASC LIMIT 1`).get(minCredits, ...excludeIds);
          }
        }
        // Fallback to any eligible account ONLY if all ready accounts were excluded
        if (!row) {
          row = this.db.prepare(`SELECT * FROM accounts WHERE ${eligibleBase} ORDER BY ${order} LIMIT 1`).get(ts, minCredits);
        }
        // Fallback to any ready account if all are temporarily under circuit cooldown
        if (!row) {
          row = this.db.prepare(`SELECT * FROM accounts WHERE status='ready' AND active_jobs<max_concurrency AND (credits_remaining IS NULL OR credits_remaining>=?) ORDER BY COALESCE(circuit_open_until, '') ASC, COALESCE(last_used_at, created_at) ASC LIMIT 1`).get(minCredits);
        }
      }
      if (!row) { this.db.exec('COMMIT'); return null; }
      this.db.prepare('UPDATE accounts SET active_jobs=active_jobs+1,last_used_at=?,updated_at=? WHERE id=?').run(ts, ts, row.id);
      this.db.exec('COMMIT');
      if (options.projectKey && !binding && strategy === 'project_sticky') this.bindProject(options.projectKey, row.id, null, policy.autoFailover);
      return this.getAccountInternal(row.id);
    } catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }

  releaseAccount(id, success, circuitMinutes = 0) {
    const ts = now();
    if (success) {
      this.db.prepare(`UPDATE accounts SET active_jobs=MAX(0,active_jobs-1),consecutive_failures=0,
        health_score=MIN(100,health_score+2),updated_at=? WHERE id=?`).run(ts, id);
    } else {
      const cooldownMins = Number(circuitMinutes) || 0;
      const circuitUntil = cooldownMins > 0 ? new Date(Date.now() + cooldownMins * 60_000).toISOString() : null;
      this.db.prepare(`UPDATE accounts SET active_jobs=MAX(0,active_jobs-1),consecutive_failures=consecutive_failures+1,
        health_score=MAX(0,health_score-5),
        circuit_open_until=?,
        updated_at=? WHERE id=?`).run(circuitUntil, ts, id);
    }
  }
  assignJobAccount(jobId, accountId) {
    this.db.prepare('UPDATE jobs SET account_id=?,updated_at=? WHERE id=?').run(accountId, now(), jobId);
  }

  updateCredits(id, remaining, raw) {
    const ts = now();
    this.db.prepare(`UPDATE accounts SET credits_remaining=?,credits_raw=?,credits_checked_at=?,
      exhausted_at=CASE WHEN ?<=0 THEN ? ELSE NULL END,
      status=CASE WHEN ?<=0 THEN 'exhausted' WHEN ?>0 AND status='exhausted' THEN 'ready' ELSE status END,
      updated_at=? WHERE id=?`).run(remaining, json(raw), ts, remaining, ts, remaining, remaining, ts, id);
  }
  markExhausted(id) {
    const ts = now();
    this.db.prepare(`UPDATE accounts SET status='exhausted',credits_remaining=0,exhausted_at=?,updated_at=? WHERE id=?`).run(ts, ts, id);
  }
  getRouting() {
    const row = this.db.prepare('SELECT * FROM routing_config WHERE id=1').get();
    return { strategy: row.strategy, minCredits: row.min_credits, autoFailover: !!row.auto_failover, updatedAt: row.updated_at };
  }
  setRouting(input) {
    this.db.prepare(`UPDATE routing_config SET strategy=?,min_credits=?,auto_failover=?,updated_at=? WHERE id=1`).run(
      input.strategy, input.minCredits, input.autoFailover ? 1 : 0, now());
    return this.getRouting();
  }
  bindProject(projectKey, accountId, flowProjectId = null, allowFailover = true) {
    if (!this.getAccountInternal(accountId)) throw new AppError(404, 'account_not_found', 'Akun tidak ditemukan');
    const ts = now();
    this.db.prepare(`INSERT INTO project_bindings(project_key,account_id,flow_project_id,allow_failover,created_at,updated_at)
      VALUES(?,?,?,?,?,?) ON CONFLICT(project_key) DO UPDATE SET account_id=excluded.account_id,
      flow_project_id=excluded.flow_project_id,allow_failover=excluded.allow_failover,updated_at=excluded.updated_at`).run(
      projectKey, accountId, flowProjectId, allowFailover ? 1 : 0, ts, ts);
    return this.getProjectBinding(projectKey);
  }
  getProjectBinding(projectKey) {
    const row = this.db.prepare('SELECT * FROM project_bindings WHERE project_key=?').get(projectKey);
    return row ? {
      projectKey: row.project_key, accountId: row.account_id, flowProjectId: row.flow_project_id,
      allowFailover: !!row.allow_failover, createdAt: row.created_at, updatedAt: row.updated_at
    } : null;
  }
  listProjectBindings() {
    return this.db.prepare('SELECT * FROM project_bindings ORDER BY created_at').all().map((row) => ({
      projectKey: row.project_key, accountId: row.account_id, flowProjectId: row.flow_project_id,
      allowFailover: !!row.allow_failover, createdAt: row.created_at, updatedAt: row.updated_at,
    }));
  }

  createAccount(input) {
    const existing = this.db.prepare('SELECT id FROM accounts WHERE profile_name=?').get(input.profileName);
    if (existing) {
      throw new AppError(409, 'profile_name_conflict', `Profile name '${input.profileName}' sudah digunakan oleh akun ${existing.id}`);
    }
    const id = `acc_${crypto.randomUUID()}`;
    const ts = now();
    this.db.prepare(`INSERT INTO accounts(id,label,email,profile_name,project_id,max_concurrency,secret_blob,priority,created_at,updated_at)
      VALUES(?,?,?,?,?,?,?,?,?,?)`).run(id, input.label, input.email ?? null, input.profileName, input.projectId ?? null,
      input.maxConcurrency ?? 1, input.secretBlob ?? null, input.priority ?? 100, ts, ts);
    return this.getAccount(id);
  }

  listAccounts() { return this.db.prepare('SELECT * FROM accounts ORDER BY created_at').all().map(accountView); }
  getAccount(id) { const row = this.db.prepare('SELECT * FROM accounts WHERE id=?').get(id); return row ? accountView(row) : null; }
  getAccountInternal(id) { return this.db.prepare('SELECT * FROM accounts WHERE id=?').get(id) ?? null; }
  markAccount(id, status, score = null) {
    this.db.prepare(`UPDATE accounts SET status=?, health_score=COALESCE(?,health_score), updated_at=? WHERE id=?`).run(status, score, now(), id);
  }
  updateAccount(id, input) {
    if (!this.getAccountInternal(id)) throw new AppError(404, 'account_not_found', 'Akun tidak ditemukan');
    this.db.prepare(`UPDATE accounts SET label=COALESCE(?,label),priority=COALESCE(?,priority),
      project_id=COALESCE(?,project_id),status=COALESCE(?,status),updated_at=? WHERE id=?`).run(
      input.label ?? null, input.priority ?? null, input.projectId ?? null, input.status ?? null, now(), id);
    return this.getAccount(id);
  }

  createJob(input) {
    if (input.idempotencyKey) {
      const existing = this.db.prepare('SELECT * FROM jobs WHERE idempotency_key=?').get(input.idempotencyKey);
      if (existing) {
        if (['failed', 'cancelled'].includes(existing.state)) {
          this.db.prepare('UPDATE jobs SET idempotency_key=NULL WHERE id=?').run(existing.id);
        } else if (existing.type !== input.type || existing.request_json !== json(input.request)) {
          throw new AppError(409, 'idempotency_conflict', 'Idempotency-Key telah digunakan dengan parameter berbeda');
        } else {
          return { job: jobView(existing), reused: true };
        }
      }
    }
    const id = `job_${crypto.randomUUID()}`;
    const ts = now();
    this.db.prepare(`INSERT INTO jobs(id,type,state,account_id,request_json,reply_url,webhook_secret_blob,idempotency_key,max_attempts,available_at,created_at,updated_at)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`).run(id, input.type, 'queued', input.accountId ?? null, json(input.request),
      input.replyUrl ?? null, input.webhookSecretBlob ?? null, input.idempotencyKey ?? null, input.maxAttempts ?? 4, ts, ts, ts);
    this.addEvent(id, 'queued', { type: input.type });
    return { job: this.getJob(id), reused: false };
  }

  getJob(id) { const row = this.db.prepare('SELECT * FROM jobs WHERE id=?').get(id); return row ? jobView(row) : null; }
  getJobInternal(id) { return this.db.prepare('SELECT * FROM jobs WHERE id=?').get(id) ?? null; }
  listJobs(limit = 50, state = null) {
    const rows = state
      ? this.db.prepare('SELECT * FROM jobs WHERE state=? ORDER BY created_at DESC LIMIT ?').all(state, limit)
      : this.db.prepare('SELECT * FROM jobs ORDER BY created_at DESC LIMIT ?').all(limit);
    return rows.map(jobView);
  }
  events(id) { return this.db.prepare('SELECT state,detail_json,created_at FROM job_events WHERE job_id=? ORDER BY id').all(id).map((e) => ({ ...e, detail: parsed(e.detail_json), detail_json: undefined })); }
  addEvent(id, state, detail) { this.db.prepare('INSERT INTO job_events(job_id,state,detail_json,created_at) VALUES(?,?,?,?)').run(id, state, json(detail), now()); }
  checkpoint(id, value) {
    this.db.prepare('UPDATE jobs SET checkpoint_json=?,updated_at=? WHERE id=?').run(json(value), now(), id);
    this.addEvent(id, 'checkpoint', { phase: value?.phase });
  }

  claimJob(workerId, leaseMs) {
    const ts = now();
    const lease = new Date(Date.now() + leaseMs).toISOString();
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const row = this.db.prepare(`SELECT * FROM jobs WHERE
        ((state IN ('queued','retrying') AND available_at<=? AND attempts < max_attempts) OR (state='running' AND lease_until<?))
        ORDER BY created_at LIMIT 1`).get(ts, ts);
      if (!row) { this.db.exec('COMMIT'); return null; }
      this.db.prepare(`UPDATE jobs SET state='running',worker_id=?,lease_until=?,attempts=attempts+1,updated_at=? WHERE id=?`).run(workerId, lease, ts, row.id);
      this.db.exec('COMMIT');
      this.addEvent(row.id, 'running', { workerId, attempt: row.attempts + 1 });
      return this.getJob(row.id);
    } catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }

  unclaimJob(id) {
    const ts = now();
    this.db.prepare(`UPDATE jobs SET state='queued',worker_id=NULL,lease_until=NULL,attempts=MAX(0, attempts-1),updated_at=? WHERE id=?`).run(ts, id);
  }

  finishJob(id, result) {
    const ts = now();
    this.db.prepare(`UPDATE jobs SET state='completed',result_json=?,error_json=NULL,lease_until=NULL,updated_at=?,completed_at=? WHERE id=?`).run(json(result), ts, ts, id);
    this.addEvent(id, 'completed', null);
  }
  updateJobRequest(id, request) {
    this.db.prepare('UPDATE jobs SET request_json=?, updated_at=? WHERE id=?').run(json(request), now(), id);
  }
  failJob(id, error, retryAt = null) {
    const job = this.getJob(id);
    if (!job) return;
    const retry = retryAt && job.attempts < job.maxAttempts;
    const state = retry ? 'retrying' : (error.code === 'action_required' ? 'action_required' : 'failed');
    const ts = now();
    this.db.prepare(`UPDATE jobs SET state=?,error_json=?,available_at=?,lease_until=NULL,updated_at=?,completed_at=? WHERE id=?`).run(
      state, json(error), retryAt ?? ts, ts, retry ? null : ts, id);
    this.addEvent(id, state, error);
  }
  cancelJob(id) {
    const ts = now();
    const result = this.db.prepare(`UPDATE jobs SET state='cancelled',updated_at=?,completed_at=? WHERE id=? AND state IN ('queued','running','retrying','action_required')`).run(ts, ts, id);
    if (result.changes) this.addEvent(id, 'cancelled', null);
    return result.changes > 0;
  }

  enqueueWebhook(jobId, url) {
    const id = `wh_${crypto.randomUUID()}`;
    const ts = now();
    this.db.prepare(`INSERT INTO webhook_deliveries(id,job_id,url,state,available_at,created_at,updated_at)
      VALUES(?,?,?,'queued',?,?,?)`).run(id, jobId, url, ts, ts, ts);
    return id;
  }
  claimWebhook() {
    const ts = now();
    const row = this.db.prepare(`SELECT * FROM webhook_deliveries WHERE state IN ('queued','retrying')
      AND available_at<=? ORDER BY created_at LIMIT 1`).get(ts);
    if (!row) return null;
    this.db.prepare(`UPDATE webhook_deliveries SET state='delivering',attempts=attempts+1,updated_at=? WHERE id=?`).run(ts, row.id);
    return { ...row, attempts: row.attempts + 1 };
  }
  finishWebhook(id) { this.db.prepare(`UPDATE webhook_deliveries SET state='delivered',updated_at=? WHERE id=?`).run(now(), id); }
  retryWebhook(id, attempts, error) {
    const terminal = attempts >= 8;
    const delay = Math.min(3600_000, 5000 * 2 ** Math.max(0, attempts - 1));
    this.db.prepare(`UPDATE webhook_deliveries SET state=?,available_at=?,last_error=?,updated_at=? WHERE id=?`).run(
      terminal ? 'dead' : 'retrying', new Date(Date.now() + delay).toISOString(), String(error).slice(0, 500), now(), id);
  }
}

function accountView(row) {
  const { secret_blob, ...safe } = row;
  return {
    id: safe.id, label: safe.label, email: safe.email, profileName: safe.profile_name,
    projectId: safe.project_id, status: safe.status, priority: safe.priority,
    consecutiveFailures: safe.consecutive_failures,
    maxConcurrency: safe.max_concurrency, activeJobs: safe.active_jobs, healthScore: safe.health_score,
    circuitOpenUntil: safe.circuit_open_until, createdAt: safe.created_at, updatedAt: safe.updated_at,
    creditsRemaining: safe.credits_remaining, creditsCheckedAt: safe.credits_checked_at,
    exhaustedAt: safe.exhausted_at, lastUsedAt: safe.last_used_at
  };
}
function jobView(row) {
  return {
    id: row.id, type: row.type, state: row.state, accountId: row.account_id,
    request: parsed(row.request_json), result: parsed(row.result_json), error: parsed(row.error_json), replyUrl: row.reply_url,
    checkpoint: parsed(row.checkpoint_json),
    attempts: row.attempts, maxAttempts: row.max_attempts, createdAt: row.created_at, updatedAt: row.updated_at,
    completedAt: row.completed_at
  };
}

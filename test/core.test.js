import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { encryptJson, decryptJson, signWebhook } from '../src/crypto.js';
import { parseBatch } from '../src/rpc.js';
import { Store } from '../src/db.js';

test('authenticated encryption roundtrip and webhook signature', () => {
  const key = crypto.randomBytes(32);
  const encrypted = encryptJson({ secret: 'value' }, key);
  assert.deepEqual(decryptJson(encrypted, key), { secret: 'value' });
  assert.equal(signWebhook('payload', Buffer.from('key')), crypto.createHmac('sha256', 'key').update('payload').digest('hex'));
});

test('batchexecute parser extracts matching RPC envelope', () => {
  const payload = ['projects/one', [null, ['Title']]];
  const envelope = [['wrb.fr', 'UpteDb', JSON.stringify(payload), null, null, null, 'generic']];
  const raw = `)]}'\n${JSON.stringify(envelope).length}\n${JSON.stringify(envelope)}\n`;
  assert.deepEqual(parseBatch(raw, 'UpteDb'), payload);
});

test('durable store provides idempotency, leasing and checkpoints', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'flow-platform-test-'));
  try {
    const store = new Store(dir);
    const account = store.createAccount({ label: 'A', profileName: 'a' });
    store.markAccount(account.id, 'ready', 100);
    const first = store.createJob({ type: 'image', request: { prompt: 'x' }, idempotencyKey: 'same', maxAttempts: 3 });
    const second = store.createJob({ type: 'image', request: { prompt: 'x' }, idempotencyKey: 'same', maxAttempts: 3 });
    assert.equal(second.reused, true);
    assert.equal(first.job.id, second.job.id);
    assert.throws(() => store.createJob({ type: 'video', request: { prompt: 'different' }, idempotencyKey: 'same', maxAttempts: 3 }),
      /Idempotency-Key/);
    const claimed = store.claimJob('worker-test', 60_000);
    assert.equal(claimed.state, 'running');
    store.checkpoint(claimed.id, { phase: 'submitted' });
    assert.equal(store.getJob(claimed.id).checkpoint.phase, 'submitted');
    const acquired = store.acquireAccount();
    assert.equal(acquired.id, account.id);
    store.releaseAccount(account.id, true);
    store.finishJob(claimed.id, { ok: true });
    assert.equal(store.getJob(claimed.id).state, 'completed');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('routing supports exhaust-first and sticky project bindings', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'flow-routing-test-'));
  try {
    const store = new Store(dir);
    const first = store.createAccount({ label: 'First', profileName: 'first', priority: 10 });
    const second = store.createAccount({ label: 'Second', profileName: 'second', priority: 20 });
    store.markAccount(first.id, 'ready', 100);
    store.markAccount(second.id, 'ready', 100);
    store.updateCredits(first.id, 50, [50]);
    store.updateCredits(second.id, 500, [500]);
    store.setRouting({ strategy: 'exhaust_first', minCredits: 1, autoFailover: true });
    const selected = store.acquireAccount();
    assert.equal(selected.id, first.id);
    store.releaseAccount(first.id, true);
    store.markExhausted(first.id);
    assert.equal(store.acquireAccount().id, second.id);
    store.releaseAccount(second.id, true);
    store.bindProject('campaign-a', second.id, null, false);
    assert.equal(store.acquireAccount({ projectKey: 'campaign-a' }).id, second.id);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('five-account pool drains in configured priority order', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'flow-five-accounts-'));
  try {
    const store = new Store(dir);
    const accounts = Array.from({ length: 5 }, (_, index) => {
      const account = store.createAccount({ label: `Account ${index + 1}`, profileName: `account-${index + 1}`, priority: (index + 1) * 10 });
      store.markAccount(account.id, 'ready', 100);
      store.updateCredits(account.id, 100, [100]);
      return account;
    });
    store.setRouting({ strategy: 'exhaust_first', minCredits: 1, autoFailover: true });
    for (const expected of accounts) {
      const selected = store.acquireAccount();
      assert.equal(selected.id, expected.id);
      store.releaseAccount(selected.id, true);
      store.markExhausted(selected.id);
    }
    assert.equal(store.acquireAccount(), null);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

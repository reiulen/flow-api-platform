import dns from 'node:dns/promises';
import net from 'node:net';
import { signWebhook } from './crypto.js';
import { AppError } from './errors.js';

function privateIp(ip) {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split('.').map(Number);
    return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
  }
  const normalized = ip.toLowerCase();
  return normalized === '::1' || normalized.startsWith('fe80:') || normalized.startsWith('fc') || normalized.startsWith('fd');
}

export async function validateWebhookUrl(raw, allowHttp = false) {
  let url;
  try { url = new URL(raw); } catch { throw new AppError(400, 'invalid_reply_url', 'replyUrl tidak valid'); }
  if (url.protocol !== 'https:' && !(allowHttp && url.protocol === 'http:')) {
    throw new AppError(400, 'invalid_reply_url', 'replyUrl wajib HTTPS');
  }
  if (url.username || url.password) throw new AppError(400, 'invalid_reply_url', 'Credential pada replyUrl dilarang');
  const addresses = await dns.lookup(url.hostname, { all: true });
  if (!addresses.length || addresses.some(({ address }) => privateIp(address))) {
    throw new AppError(400, 'unsafe_reply_url', 'replyUrl mengarah ke jaringan privat');
  }
  return url.toString();
}

export async function deliverWebhook(url, payload, secret) {
  const body = JSON.stringify(payload);
  const timestamp = String(Math.floor(Date.now() / 1000));
  const signature = signWebhook(`${timestamp}.${body}`, secret);
  const response = await fetch(url, {
    method: 'POST', redirect: 'error', signal: AbortSignal.timeout(15_000),
    headers: { 'content-type': 'application/json', 'user-agent': 'flow-api-platform/1.0',
      'x-flow-timestamp': timestamp, 'x-flow-signature': `v1=${signature}` },
    body,
  });
  if (!response.ok) throw new Error(`Webhook HTTP ${response.status}`);
}

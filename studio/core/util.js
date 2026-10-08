import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';

export function readJson(file, fallback) {
  if (!fs.existsSync(file)) {
    if (fallback !== undefined) return fallback;
    throw new Error(`File not found: ${file}`);
  }
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

export function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify(value, null, 2)}\n`);
  fs.renameSync(tmp, file);
  return file;
}

export function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

// Stable stringify so hashes don't change with key order.
export function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((k) => `${JSON.stringify(k)}:${stableStringify(value[k])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

export function hash(value, length = 16) {
  return crypto.createHash('sha256').update(typeof value === 'string' ? value : stableStringify(value)).digest('hex').slice(0, length);
}

export function hashFile(file) {
  if (!fs.existsSync(file)) return null;
  const stat = fs.statSync(file);
  if (stat.isDirectory()) return hash(fs.readdirSync(file).sort().map((f) => hashFile(path.join(file, f))));
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex').slice(0, 16);
}

// Deterministic PRNG (mulberry32) so every "random" choice is reproducible per project.
export function seededRandom(seed) {
  let t = parseInt(hash(seed, 8), 16) >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

export function run(cmd, args, { cwd, env, timeoutMs = 0, input } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { cwd, env: env ? { ...process.env, ...env } : process.env });
    let stdout = '';
    let stderr = '';
    let timer;
    if (timeoutMs) timer = setTimeout(() => child.kill('SIGKILL'), timeoutMs);
    child.stdout.on('data', (d) => { stdout += d; });
    child.stderr.on('data', (d) => { stderr += d; });
    child.on('error', reject);
    if (child.stdin) child.stdin.on('error', () => {});
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code === 0) resolve({ stdout, stderr });
      else reject(Object.assign(new Error(`${path.basename(cmd)} exited ${code}: ${stderr.slice(-2000)}`), { stdout, stderr, code }));
    });
    if (input) child.stdin.end(input);
  });
}

export async function ffprobe(file) {
  const { stdout } = await run('ffprobe', ['-v', 'error', '-show_format', '-show_streams', '-of', 'json', file]);
  const data = JSON.parse(stdout);
  const video = data.streams.find((s) => s.codec_type === 'video');
  const audio = data.streams.find((s) => s.codec_type === 'audio');
  const [num, den] = (video?.avg_frame_rate || '0/1').split('/').map(Number);
  return {
    duration: Number(data.format.duration || video?.duration || audio?.duration || 0),
    width: video?.width || 0,
    height: video?.height || 0,
    fps: den ? num / den : 0,
    hasVideo: Boolean(video),
    hasAudio: Boolean(audio),
    codec: video?.codec_name,
  };
}

export async function mapLimit(items, limit, fn) {
  const results = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await fn(items[index], index);
    }
  });
  await Promise.all(workers);
  return results;
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export const round = (n, d = 3) => Math.round(n * 10 ** d) / 10 ** d;
export const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
export const nowIso = () => new Date().toISOString();

export function slugify(text, max = 48) {
  return String(text).toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, max).replace(/-$/, '');
}

export function countWords(text) {
  return stripMarkup(text).split(/\s+/).filter(Boolean).length;
}

// Removes script markup ([PAUSE 0.8], [BEAT], [TONE: x], {PRON: ...}, *emphasis*) leaving spoken text.
export function stripMarkup(text) {
  return String(text)
    .replace(/\[(PAUSE|BEAT|TONE)[^\]]*\]/g, ' ')
    .replace(/\{PRON:[^}]*\}/g, ' ')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}

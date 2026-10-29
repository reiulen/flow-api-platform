import fs from 'node:fs';
import path from 'node:path';
import { MsEdgeTTS, OUTPUT_FORMAT } from 'msedge-tts';
import { VoTiming } from '../contracts.js';
import { alignSegment, detectSilences } from '../align.js';
import { ensureDir, ffprobe, hash, mapLimit, round, run, stripMarkup } from '../util.js';

// Converts script markup into timed pieces: text runs and pauses.
export function tokenize(text, style) {
  const pieces = [];
  const re = /\[PAUSE (\d+(?:\.\d+)?)\]|\[BEAT\]|\[TONE:[^\]]*\]|\{PRON:[^}]*\}/g;
  let last = 0;
  let m;
  while ((m = re.exec(text))) {
    if (m.index > last) pieces.push({ text: text.slice(last, m.index) });
    if (m[0].startsWith('[PAUSE')) pieces.push({ pause: Number(m[1]) });
    else if (m[0] === '[BEAT]') pieces.push({ pause: style.narration.beat_s });
    last = re.lastIndex;
  }
  if (last < text.length) pieces.push({ text: text.slice(last) });
  return pieces
    .map((p) => (p.text !== undefined ? { text: p.text.replace(/\[(?:LAUGHS?|CHUCKLES?|SIGHS?|GROANS?|COUGHS?|GASP|SNICKERS?)\]/gi, '').replace(/\*([^*]+)\*/g, '$1').replace(/\s+/g, ' ') } : p))
    .filter((p) => p.pause || p.text.trim());
}

export function spokenWords(text) {
  return stripMarkup(text).split(/\s+/).filter(Boolean);
}

function applyPron(text, pron) {
  let out = text;
  for (const p of pron || []) out = out.split(p.word).join(p.say);
  return out;
}

const escapeXml = (s) => s.replace(/[<>&'"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' }[c]));
const rateFor = (tone, base) => ({ quiet: '-10%', firm: '-2%' }[tone] || base);

// Word timings when the engine gives none: spread words across speech time by character length,
// keeping the explicit pauses where the script put them.
export function estimateWords(pieces, totalDuration) {
  const pauseTotal = pieces.reduce((n, p) => n + (p.pause || 0), 0);
  const words = pieces.flatMap((p) => (p.text ? p.text.trim().split(/\s+/).filter(Boolean) : []));
  const chars = words.reduce((n, w) => n + w.length + 1, 0) || 1;
  const speech = Math.max(0.1, totalDuration - pauseTotal);
  const out = [];
  let t = 0;
  for (const p of pieces) {
    if (p.pause) { t += p.pause; continue; }
    for (const w of p.text.trim().split(/\s+/).filter(Boolean)) {
      const d = ((w.length + 1) / chars) * speech;
      out.push({ w, s: round(t), e: round(t + d * 0.92) });
      t += d;
    }
  }
  return out;
}

function wavHeader(bytes, rate) {
  const h = Buffer.alloc(44);
  h.write('RIFF', 0); h.writeUInt32LE(36 + bytes, 4); h.write('WAVE', 8); h.write('fmt ', 12);
  h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22); h.writeUInt32LE(rate, 24);
  h.writeUInt32LE(rate * 2, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34); h.write('data', 36); h.writeUInt32LE(bytes, 40);
  return h;
}

async function toWav(input, output) {
  await run('ffmpeg', ['-y', '-v', 'error', '-i', input, '-ac', '1', '-ar', '48000', '-c:a', 'pcm_s16le', output]);
}

const providers = {
  async edge({ segment, pieces, outBase, voice }) {
    const tts = new MsEdgeTTS();
    await tts.setMetadata(voice.voice, OUTPUT_FORMAT.AUDIO_24KHZ_96KBITRATE_MONO_MP3, { wordBoundaryEnabled: true });
    const body = pieces.map((p) => (p.pause ? `<break time="${Math.round(p.pause * 1000)}ms"/>` : escapeXml(applyPron(p.text, segment.pron)))).join(' ');
    const ssml = `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="en-US"><voice name="${voice.voice}"><prosody rate="${rateFor(segment.tone, voice.rate)}">${body}</prosody></voice></speak>`;
    const dir = path.dirname(outBase);
    const { audioFilePath, metadataFilePath } = await tts.rawToFile(dir, ssml);
    const mp3 = `${outBase}.mp3`;
    fs.renameSync(audioFilePath, mp3);
    let words = null;
    if (metadataFilePath && fs.existsSync(metadataFilePath)) {
      try {
        words = parseEdgeMetadata(fs.readFileSync(metadataFilePath, 'utf8'));
      } catch {}
    }
    return { src: mp3, words };
  },

  async nine_router({ segment, pieces, outBase, voice }) {
    const baseUrl = process.env.NINE_ROUTER_BASE_URL
      ? process.env.NINE_ROUTER_BASE_URL.replace(/\/v1$/, '')
      : 'http://localhost:20128';
    const key = process.env.NINE_ROUTER_API_KEY;
    if (!key) throw new Error('voice: set NINE_ROUTER_API_KEY');
    const isVoiceInworld = honoursBreaks(voice);
    // Inworld honours SSML-style break tags (measured: a 1.5 s break gives ~2 s of silence); "..." only
    // gives ~0.7 s, so script pauses and [BEAT]s would collapse. Other engines get the text fallback.
    const pauseText = (p) => (isVoiceInworld ? `<break time="${p.pause.toFixed(1)}s" />` : p.boundary ? '\n\n' : '... ');
    const text = pieces.map((p) => (p.pause ? pauseText(p) : applyPron(p.text, segment.pron).trim())).join(' ').replace(/ {2,}/g, ' ').trim();
    const defaultVoice = isVoiceInworld ? 'Tristan' : 'Puck';
    let voiceName = voice.voice || defaultVoice;
    if (isVoiceInworld && (voiceName.toLowerCase() === 'aria' || voiceName.toLowerCase().endsWith('/aria'))) {
      voiceName = 'Victoria';
    }
    let model;
    if (isVoiceInworld) {
      const v = voiceName.replace(/^inworld\//, '');
      const ttsModel = voice.model || process.env.STUDIO_VOICE_MODEL || 'inworld-tts-2';
      model = v.includes('/') ? `inworld/${v}` : `inworld/${ttsModel}/${v}`;
    } else if (voiceName.includes('/')) {
      model = voiceName;
    } else {
      model = `gemini/${voiceName}`;
    }
    const res = await fetch(`${baseUrl}/v1/audio/speech`, {
      method: 'POST',
      signal: AbortSignal.timeout(240000),
      headers: {
        'Authorization': `Bearer ${key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        input: text,
        voice: voiceName.split('/').pop(),
        lang: process.env.STUDIO_VOICE_LANG || 'en-US',
      }),
    });
    if (!res.ok) throw new Error(`voice: 9router ${res.status} retry-after=${res.headers.get('retry-after') || ''} ${await res.text()}`);
    const buf = await res.arrayBuffer();
    const raw = `${outBase}.raw.wav`;
    fs.writeFileSync(raw, Buffer.from(buf));
    return { src: raw, words: null };
  },

  async inworld(args) {
    return providers.nine_router(args);
  },

  async gemini(args) {
    return providers.nine_router(args);
  },

  async elevenlabs({ segment, pieces, outBase }) {
    const key = process.env.ELEVENLABS_API_KEY;
    const voiceId = process.env.ELEVENLABS_VOICE_ID;
    if (!key || !voiceId) throw new Error('voice: ELEVENLABS_API_KEY and ELEVENLABS_VOICE_ID are required');
    const text = pieces.map((p) => (p.pause ? `<break time="${p.pause.toFixed(1)}s" />` : applyPron(p.text, segment.pron))).join(' ');
    const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}/with-timestamps?output_format=mp3_44100_128`, {
      signal: AbortSignal.timeout(180000),
      method: 'POST',
      headers: { 'xi-api-key': key, 'content-type': 'application/json' },
      body: JSON.stringify({
        text,
        model_id: process.env.ELEVENLABS_MODEL || 'eleven_multilingual_v2',
        voice_settings: { stability: segment.tone === 'firm' ? 0.55 : 0.65, similarity_boost: 0.8, style: 0.1 },
      }),
    });
    if (!res.ok) throw new Error(`voice: elevenlabs ${res.status} ${await res.text()}`);
    const data = await res.json();
    const mp3 = `${outBase}.mp3`;
    fs.writeFileSync(mp3, Buffer.from(data.audio_base64, 'base64'));
    return { src: mp3, words: wordsFromCharAlignment(data.alignment) };
  },

  // Human recording: drop vo/<seg_id>.wav (or .mp3) into the project. Timings are estimated.
  async file({ segment, outBase }) {
    for (const ext of ['.wav', '.mp3', '.m4a']) {
      const f = path.join(path.dirname(outBase), `${segment.seg_id}.source${ext}`);
      if (fs.existsSync(f)) return { src: f, words: null };
    }
    throw new Error(`voice: missing recording vo/${segment.seg_id}.source.wav`);
  },

  // Silent stand-in with realistic duration, for tests and dry runs.
  async synthetic({ pieces, outBase, style }) {
    const count = pieces.reduce((n, p) => n + (p.text ? p.text.trim().split(/\s+/).length : 0), 0);
    const duration = (count / style.narration.wpm) * 60 + pieces.reduce((n, p) => n + (p.pause || 0), 0);
    const src = `${outBase}.syn.wav`;
    const words = estimateWords(pieces, duration);
    // Tone only while words are spoken, so pauses are real silence (like a voice).
    const rate = 48000;
    const pcm = Buffer.alloc(Math.round(duration * rate) * 2);
    for (const w of words) {
      for (let i = Math.round(w.s * rate); i < Math.min(pcm.length / 2, Math.round(w.e * rate)); i++) {
        pcm.writeInt16LE(Math.round(6500 * Math.sin((2 * Math.PI * 220 * i) / rate)), i * 2);
      }
    }
    fs.writeFileSync(src, Buffer.concat([wavHeader(pcm.length, rate), pcm]));
    return { src, words };
  },
};

function parseEdgeMetadata(raw) {
  const words = [];
  for (const line of raw.split('\n')) {
    if (!line.trim()) continue;
    try {
      const obj = JSON.parse(line);
      for (const m of obj.Metadata || []) {
        if (m.Type !== 'WordBoundary') continue;
        const s = m.Data.Offset / 1e7;
        words.push({ w: m.Data.text?.Text || '', s: round(s), e: round(s + m.Data.Duration / 1e7) });
      }
    } catch { /* partial line */ }
  }
  return words.length ? words : null;
}

function wordsFromCharAlignment(al) {
  if (!al) return null;
  const words = [];
  let cur = null;
  al.characters.forEach((ch, i) => {
    if (/\s/.test(ch)) { if (cur) { words.push(cur); cur = null; } return; }
    if (!cur) cur = { w: '', s: al.character_start_times_seconds[i], e: 0 };
    cur.w += ch;
    cur.e = al.character_end_times_seconds[i];
  });
  if (cur) words.push(cur);
  return words.filter((w) => !w.w.startsWith('<')).map((w) => ({ w: w.w, s: round(w.s), e: round(w.e) }));
}

// Engines with tight rate limits get one request per ~90 s of narration instead of one per
// sentence: consecutive segments of an act are voiced together, then cut apart at the pauses.
const BATCHED = new Set(['nine_router', 'gemini', 'inworld']);

// Engines whose break tags produce real, predictable silence (Inworld, measured: a break of b s gives
// about b + 0.5 s; back-to-back breaks do not add up reliably).
const honoursBreaks = (voice) => voice.provider === 'inworld' || Boolean(voice.voice && voice.voice.startsWith('inworld/'));
// Between segments of a chunk: a break longer than any script pause ([BEAT] is 2 s, ~2.5 s of
// silence), so the cut points are found from the audio alone, whatever the words sound like.
const BOUNDARY_BREAK_S = 3.0;
const BOUNDARY_MIN_SILENCE_S = 2.75;

function makeLimiter(rpm) {
  let next = 0;
  return async (fn) => {
    if (rpm > 0) {
      const wait = next - Date.now();
      next = Math.max(Date.now(), next) + 60000 / rpm;
      if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    }
    return fn();
  };
}

// Retries with the wait the server asks for (Retry-After, "reset after 1m 5s"), else backoff.
async function withRetries(fn, label, attempts = 8) {
  for (let attempt = 1; ; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (attempt >= attempts) throw err;
      const after = err.message.match(/retry-after=(\d+)/i);
      const reset = err.message.match(/reset after (?:(\d+)m\s*)?(\d+)s/i);
      const waitSec = after ? Number(after[1]) + 1
        : reset ? (reset[1] ? Number(reset[1]) * 60 : 0) + Number(reset[2]) + 2
          : Math.min(60, 4 * 2 ** (attempt - 1));
      console.log(`[voice] ${label}: ${err.message.slice(0, 120)} — retry ${attempt + 1} in ${waitSec}s`);
      await new Promise((r) => setTimeout(r, waitSec * 1000));
    }
  }
}

const estSeconds = (segment, style) => (spokenWords(segment.text).length / style.narration.wpm) * 60 + tokenize(segment.text, style).reduce((n, p) => n + (p.pause || 0), 0);
const actOf = (segId) => segId.split('-')[1];

export async function runVoice({ project, script, voice, style, config, concurrency = 3 }) {
  const dir = project.subdir('vo');
  const provider = providers[voice.provider];
  if (!provider) throw new Error(`voice: unknown provider ${voice.provider}`);
  const batched = BATCHED.has(voice.provider) && config && config.voice.chunkSeconds > 0;
  const limit = makeLimiter(config?.voice.rpm ?? 0);
  const resolveVoice = (segment) => {
    const spk = (segment.speaker || segment.character || segment.voice || '').toLowerCase();
    if (spk && voice.cast?.[spk]) {
      const entry = voice.cast[spk];
      const castOverride = typeof entry === 'string' ? { voice: entry } : entry;
      return { ...voice, ...castOverride };
    }
    return voice;
  };
  const call = (args, label) => withRetries(() => limit(() => (providers[args.voice?.provider] || provider)(args)), label);

  // Audio is reused only while the text, pronunciations and voice are unchanged.
  const keyOf = (segment) => {
    const v = resolveVoice(segment);
    return hash({ v: 3, text: segment.text, pron: segment.pron || [], tone: segment.tone || '', provider: v.provider, voice: v.voice || '', rate: v.rate || '', model: v.model || process.env.STUDIO_VOICE_MODEL || '' });
  };
  const paths = (segment) => { const b = path.join(dir, segment.seg_id); return { base: b, wav: `${b}.wav`, meta: `${b}.json` }; };
  const cachedMeta = (segment) => {
    const { wav, meta } = paths(segment);
    if (!fs.existsSync(wav) || !fs.existsSync(meta)) return null;
    const m = JSON.parse(fs.readFileSync(meta, 'utf8'));
    return m.key === keyOf(segment) ? m : null;
  };

  if (batched) {
    const todo = script.segments.filter((s) => !cachedMeta(s));
    const chunks = [];
    for (const seg of todo) {
      const cur = chunks.at(-1);
      const prevIdx = cur ? script.segments.indexOf(cur.at(-1)) : -2;
      const fits = cur && actOf(cur[0].seg_id) === actOf(seg.seg_id) && script.segments.indexOf(seg) === prevIdx + 1
        && resolveVoice(cur[0]).voice === resolveVoice(seg).voice
        && cur.reduce((n, s) => n + estSeconds(s, style), 0) + estSeconds(seg, style) <= config.voice.chunkSeconds;
      if (fits) cur.push(seg); else chunks.push([seg]);
    }
    for (const chunk of chunks.filter((c) => c.length > 1)) {
      const ok = await voiceChunk({ chunk, dir, call, keyOf, paths, voice: resolveVoice(chunk[0]), style, config });
      if (!ok) console.log(`[voice] ${chunk[0].seg_id}..${chunk.at(-1).seg_id}: could not split cleanly, voicing those segments one by one`);
    }
  }

  const results = await mapLimit(script.segments, batched ? 1 : concurrency, async (segment) => {
    const { base, wav, meta } = paths(segment);
    const cached = cachedMeta(segment);
    if (cached) return { seg_id: segment.seg_id, file: path.relative(project.dir, wav), duration_s: round(cached.duration), words: cached.words };

    const pieces = tokenize(segment.text, style);
    const activeVoice = resolveVoice(segment);
    const res = await call({ segment, pieces, outBase: base, voice: activeVoice, style }, segment.seg_id);
    await toWav(res.src, wav);
    let words = res.words;
    let method = 'engine';
    // Trim trailing silence (leading silence is kept so engine word offsets stay valid), keep a short tail.
    const trimmed = `${base}.t.wav`;
    await run('ffmpeg', ['-y', '-v', 'error', '-i', wav, '-af', 'areverse,silenceremove=start_periods=1:start_threshold=-50dB,areverse,apad=pad_dur=0.15', trimmed]);
    const info = await ffprobe(trimmed);
    const duration = info.duration > 0.3 ? info.duration : (await ffprobe(wav)).duration;
    fs.renameSync(info.duration > 0.3 ? trimmed : wav, wav);
    fs.rmSync(trimmed, { force: true });
    // Engines without word timings (or with too few) are aligned against the audio itself.
    if (!words || words.length < spokenWords(segment.text).length * 0.8) {
      ({ words, method } = config ? await alignSegment({ config, wav, pieces, duration, lengths: honoursBreaks(voice) }) : { words: estimateWords(pieces, duration), method: 'estimate' });
    }
    fs.writeFileSync(meta, JSON.stringify({ key: keyOf(segment), duration, words, method }));
    return { seg_id: segment.seg_id, file: path.relative(project.dir, wav), duration_s: round(duration), words };
  });
  return VoTiming.parse({ voice: { provider: voice.provider, id: voice.voice || voice.provider }, segments: results });
}

// Voices several segments in one request and cuts them apart again. Returns false (nothing
// written) when the cut points cannot be found reliably; the caller then voices one by one.
async function voiceChunk({ chunk, dir, call, keyOf, paths, voice, style, config }) {
  const chunkDir = ensureDir(path.join(dir, 'chunks'));
  const breaks = honoursBreaks(voice);
  const pieces = [];
  const counts = [];
  const segPieces = [];
  const trailing = [];
  chunk.forEach((seg, i) => {
    const p = tokenize(seg.text, style);
    // A pause that ends a segment is folded into the boundary break and given back after the cut.
    trailing.push(breaks && i < chunk.length - 1 && p.at(-1)?.pause ? p.pop().pause : 0);
    segPieces.push(p);
    counts.push(p.reduce((n, x) => n + (x.text ? x.text.trim().split(/\s+/).filter(Boolean).length : 0), 0));
    pieces.push(...p);
    if (i < chunk.length - 1) pieces.push({ pause: breaks ? BOUNDARY_BREAK_S : 0.8, boundary: true });
  });
  const segment = { seg_id: `${chunk[0].seg_id}_${chunk.at(-1).seg_id}`, text: chunk.map((s) => s.text).join(' '), pron: chunk.flatMap((s) => s.pron || []), tone: chunk[0].tone };
  const base = path.join(chunkDir, hash({ chunk: chunk.map(keyOf), boundary: breaks ? BOUNDARY_BREAK_S : 0.8 }));
  const wav = `${base}.wav`;
  if (!fs.existsSync(wav)) {
    const res = await call({ segment, pieces, outBase: base, voice, style }, segment.seg_id);
    await toWav(res.src, wav);
  }
  const duration = (await ffprobe(wav)).duration;
  const spans = breaks
    ? await spansFromBoundaries({ wav, duration, chunk, trailing })
    : await spansFromAlignment({ wav, duration, chunk, pieces, counts, config });
  if (!spans) return false;

  for (const [i, sp] of spans.entries()) {
    const { wav: out, meta } = paths(sp.seg);
    const len = Math.max(0.2, sp.end - sp.start);
    await run('ffmpeg', ['-y', '-v', 'error', '-ss', sp.start.toFixed(3), '-t', len.toFixed(3), '-i', wav, '-af', 'apad=pad_dur=0.15', '-ac', '1', '-ar', '48000', '-c:a', 'pcm_s16le', out]);
    const d = (await ffprobe(out)).duration;
    // Word timings: per segment when the cut came from the audio (shorter stretches align better).
    const words = sp.words
      ? sp.words.map((x) => ({ w: x.w, s: round(Math.max(0, x.s - sp.start)), e: round(Math.min(d, Math.max(0, x.e - sp.start))) }))
      : (await alignSegment({ config, wav: out, pieces: segPieces[i], duration: d, lengths: true })).words;
    fs.writeFileSync(meta, JSON.stringify({ key: keyOf(sp.seg), duration: d, words, method: 'chunk' }));
  }
  return true;
}

// Cut points from the boundary breaks: exactly one silence of boundary length per boundary.
async function spansFromBoundaries({ wav, duration, chunk, trailing }) {
  const silences = await detectSilences(wav, { minS: 0.12 });
  const cuts = silences.filter((x) => x.e - x.s >= BOUNDARY_MIN_SILENCE_S && x.s > 0.3 && x.e < duration - 0.05);
  if (cuts.length !== chunk.length - 1) return null;
  const lead = silences[0] && silences[0].s <= 0.05 ? Math.max(0, silences[0].e - 0.08) : 0;
  const tail = silences.find((x) => x.e >= duration - 0.05 && x.s > (cuts.at(-1)?.e ?? 0));
  return chunk.map((seg, i) => {
    const start = i === 0 ? lead : Math.max(cuts[i - 1].s, cuts[i - 1].e - 0.08);
    // The segment keeps its own closing pause, then a short tail; never past the boundary silence.
    const end = i < chunk.length - 1 ? Math.min(cuts[i].e - 0.1, cuts[i].s + 0.15 + trailing[i]) : (tail ? Math.min(duration, tail.s + 0.15) : duration);
    return { seg, start, end };
  });
}

// Engines without dependable breaks: align the whole chunk and cut at the longest silence near
// each boundary.
async function spansFromAlignment({ wav, duration, chunk, pieces, counts, config }) {
  const { words } = await alignSegment({ config, wav, pieces, duration });
  const silences = await detectSilences(wav, { minS: 0.12 });
  if (words.length !== counts.reduce((a, b) => a + b, 0)) return null;
  const spans = [];
  let w = 0;
  let start = Math.max(0, (words[0]?.s ?? 0) - 0.08);
  for (let i = 0; i < chunk.length; i++) {
    const last = words[w + counts[i] - 1];
    const tail = silences.find((x) => x.e >= duration - 0.05 && x.s > last.s);
    let end = tail ? Math.min(duration, tail.s + 0.15) : duration;
    let nextStart = duration;
    if (i < chunk.length - 1) {
      const first = words[w + counts[i]];
      const gap = silences.filter((x) => x.e > last.e - 0.35 && x.s < first.s + 0.35).sort((a, b) => (b.e - b.s) - (a.e - a.s))[0];
      if (!gap) return null;
      end = Math.min(gap.e, gap.s + 0.15);
      nextStart = Math.max(gap.s, gap.e - 0.08);
    }
    spans.push({ seg: chunk[i], start, end, words: words.slice(w, w + counts[i]) });
    w += counts[i];
    start = nextStart;
  }
  return spans;
}

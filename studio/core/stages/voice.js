import fs from 'node:fs';
import path from 'node:path';
import { MsEdgeTTS, OUTPUT_FORMAT } from 'msedge-tts';
import { VoTiming } from '../contracts.js';
import { ffprobe, mapLimit, round, run, stripMarkup } from '../util.js';

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
    .map((p) => (p.text !== undefined ? { text: p.text.replace(/\*([^*]+)\*/g, '$1').replace(/\s+/g, ' ') } : p))
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
      words = parseEdgeMetadata(fs.readFileSync(metadataFilePath, 'utf8'));
      fs.rmSync(metadataFilePath, { force: true });
    }
    return { src: mp3, words };
  },

  async elevenlabs({ segment, pieces, outBase }) {
    const key = process.env.ELEVENLABS_API_KEY;
    const voiceId = process.env.ELEVENLABS_VOICE_ID;
    if (!key || !voiceId) throw new Error('voice: ELEVENLABS_API_KEY and ELEVENLABS_VOICE_ID are required');
    const text = pieces.map((p) => (p.pause ? `<break time="${p.pause.toFixed(1)}s" />` : applyPron(p.text, segment.pron))).join(' ');
    const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}/with-timestamps?output_format=mp3_44100_128`, {
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
    const words = pieces.reduce((n, p) => n + (p.text ? p.text.trim().split(/\s+/).length : 0), 0);
    const duration = (words / style.narration.wpm) * 60 + pieces.reduce((n, p) => n + (p.pause || 0), 0);
    const src = `${outBase}.syn.wav`;
    await run('ffmpeg', ['-y', '-v', 'error', '-f', 'lavfi', '-i', `sine=frequency=220:sample_rate=48000:duration=${duration.toFixed(3)}`, '-af', 'volume=0.05', '-ac', '1', src]);
    return { src, words: null };
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

export async function runVoice({ project, script, voice, style, concurrency = 3 }) {
  const dir = project.subdir('vo');
  const provider = providers[voice.provider];
  if (!provider) throw new Error(`voice: unknown provider ${voice.provider}`);
  const results = await mapLimit(script.segments, concurrency, async (segment) => {
    const outBase = path.join(dir, segment.seg_id);
    const wav = `${outBase}.wav`;
    const pieces = tokenize(segment.text, style);
    let words;
    for (let attempt = 1; ; attempt++) {
      try {
        const res = await provider({ segment, pieces, outBase, voice, style });
        await toWav(res.src, wav);
        words = res.words;
        break;
      } catch (err) {
        if (attempt >= 3) throw err;
      }
    }
    // Trim trailing silence (leading silence is kept so engine word offsets stay valid), keep a short tail.
    const trimmed = `${outBase}.t.wav`;
    await run('ffmpeg', ['-y', '-v', 'error', '-i', wav, '-af', 'areverse,silenceremove=start_periods=1:start_threshold=-50dB,areverse,apad=pad_dur=0.15', trimmed]);
    const info = await ffprobe(trimmed);
    const duration = info.duration > 0.3 ? info.duration : (await ffprobe(wav)).duration;
    fs.renameSync(info.duration > 0.3 ? trimmed : wav, wav);
    fs.rmSync(trimmed, { force: true });
    const expected = spokenWords(segment.text);
    if (!words || words.length < expected.length * 0.8) words = estimateWords(pieces, duration);
    return { seg_id: segment.seg_id, file: path.relative(project.dir, wav), duration_s: round(duration), words };
  });
  return VoTiming.parse({ voice: { provider: voice.provider, id: voice.voice || voice.provider }, segments: results });
}

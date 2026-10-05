import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { tokenize } from '../core/stages/voice.js';
import { detectSilences, mapTranscript, pauseAnchoredAlign, wordWeight } from '../core/align.js';

const style = { narration: { beat_s: 2 } };
const TEXT = 'In 1952 the first prototype flew over California. Seventy years later, the same airframe still carries the heaviest loads in the fleet. [PAUSE 1.0] Engineers call it a flying truck, and the name stuck. Nobody planned for this.';

// Fake narration with known word times: word lengths vary ±30%, gaps follow punctuation,
// plus one breath inside a phrase that the aligner must not mistake for a sentence end.
function synth(seed = 1) {
  let x = seed;
  const rnd = () => { x = (x * 16807) % 2147483647; return x / 2147483647; };
  const pieces = tokenize(TEXT, style);
  const truth = [];
  const sounds = [];
  let t = 0.12;
  let n = 0;
  for (const p of pieces) {
    if (p.pause) { t += p.pause; continue; }
    for (const w of p.text.trim().split(/\s+/)) {
      const d = wordWeight(w) * 0.13 * (0.7 + 0.6 * rnd());
      truth.push({ w, s: t, e: t + d });
      sounds.push([t, t + d]);
      t += d;
      n++;
      t += /[.!?]$/.test(w) ? 0.55 : /,$/.test(w) ? 0.3 : n === 14 ? 0.24 : 0.03 + 0.02 * rnd();
    }
  }
  return { pieces, truth, sounds, duration: t + 0.15 };
}

function silencesOf(sounds, duration, minGap = 0.18) {
  const out = [];
  let prev = 0;
  for (const [s, e] of sounds) { if (s - prev >= minGap) out.push({ s: prev, e: s }); prev = e; }
  if (duration - prev >= minGap) out.push({ s: prev, e: duration });
  return out;
}

const maxStartError = (words, truth) => Math.max(...words.map((w, i) => Math.abs(w.s - truth[i].s)));

test('pause-anchored alignment puts sentence starts on the real pauses', () => {
  for (const seed of [1, 7, 42]) {
    const { pieces, truth, sounds, duration } = synth(seed);
    const words = pauseAnchoredAlign(pieces, silencesOf(sounds, duration), duration);
    assert.equal(words.length, truth.length);
    // Words that start a sentence (where cuts usually land) are within 60 ms.
    for (const i of truth.map((_, k) => k).filter((k) => k > 0 && /[.!?]$/.test(truth[k - 1].w))) {
      assert.ok(Math.abs(words[i].s - truth[i].s) < 0.06, `seed ${seed} word ${truth[i].w}: ${words[i].s} vs ${truth[i].s}`);
    }
    // Every word is within 0.4 s, far tighter than spreading words evenly over the clip.
    assert.ok(maxStartError(words, truth) < 0.4, `seed ${seed} max error ${maxStartError(words, truth)}`);
  }
});

test('transcript timestamps map back onto script words, with gaps interpolated', () => {
  const { pieces, truth } = synth(3);
  // Whisper-style transcript: numbers spelled differently, one word missing.
  const transcript = truth.filter((_, i) => i !== 5).map((x) => ({ word: x.w === '1952' ? 'nineteen-fifty-two' : x.w, start: x.s, end: x.e }));
  const { words, matchRate } = mapTranscript(pieces, transcript);
  assert.ok(matchRate > 0.9);
  assert.equal(words.length, truth.length);
  assert.ok(maxStartError(words, truth) < 0.35);
  assert.equal(words[10].s, Math.round(truth[10].s * 1000) / 1000);
});

test('silences are measured from real audio', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'align-'));
  const wav = path.join(dir, 'a.wav');
  // 1 s tone, 0.5 s silence, 1 s tone.
  execFileSync('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'sine=f=300:d=1', '-f', 'lavfi', '-i', 'anullsrc=r=44100:cl=mono:d=0.5', '-f', 'lavfi', '-i', 'sine=f=300:d=1', '-filter_complex', '[0][1][2]concat=n=3:v=0:a=1', wav]);
  return detectSilences(wav).then((s) => {
    assert.equal(s.length, 1);
    assert.ok(Math.abs(s[0].s - 1) < 0.05 && Math.abs(s[0].e - 1.5) < 0.05);
    fs.rmSync(dir, { recursive: true, force: true });
  });
});

// Synthetic sound effects for story shots. Every effect is placed from the same Story.timeline the
// renderer animates from, so a glove is heard in the frame it lands. Each video detunes the whole set
// from its kit seed, so two films never share a thud or an alarm.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { STUDIO_ROOT } from './config.js';
import {
  TAU, mulberry, mono, stereo, whiteNoise, lowpass, highpass, bandpass, applyEnv, expDecay, fade, addInto, addStereo, softClip, dbToGain, writeWav,
} from './dsp.js';

const SR = 32000;

// ---- the shared timeline (browser file, evaluated once in a sandbox) ----
let runtime = null;
export function storyRuntime() {
  if (runtime) return runtime;
  const window = {};
  const ctx = vm.createContext({ window, document: {}, console, Math });
  for (const f of ['core', 'hero', 'timeline']) vm.runInContext(fs.readFileSync(path.join(STUDIO_ROOT, 'motion', 'story', `${f}.js`), 'utf8'), ctx, { filename: `${f}.js` });
  runtime = window.Story;
  return runtime;
}

// ---- synthesis: each returns a mono buffer at SR ----
const noiseOf = (rand, sec) => whiteNoise(mono(SR, sec), rand);
const sine = (buf, f0, f1, tau, amp = 1, rand = null) => {
  let ph = rand ? rand() * TAU : 0;
  for (let i = 0; i < buf.length; i++) {
    const t = i / SR; const f = f1 == null ? f0 : f1 + (f0 - f1) * Math.exp(-t / 0.05);
    ph += (TAU * f) / SR;
    buf[i] += Math.sin(ph) * amp * Math.exp(-t / tau);
  }
  return buf;
};

const SYN = {
  thud(r, { f = 72, dur = 0.4, amp = 1 } = {}) {
    const b = mono(SR, dur); sine(b, f * 2.1, f, dur * 0.28, amp);
    const n = lowpass(applyEnv(noiseOf(r, dur), expDecay(0.012), SR), SR, 900); for (let i = 0; i < b.length; i++) b[i] += n[i] * 0.5 * amp;
    return b;
  },
  punch(r, { amp = 1 } = {}) {
    const b = SYN.thud(r, { f: 96, dur: 0.38, amp });
    const slap = bandpass(applyEnv(noiseOf(r, 0.14), expDecay(0.02), SR), SR, 1500 + r() * 300, 1.2); for (let i = 0; i < slap.length; i++) b[i] += slap[i] * 0.9 * amp;
    const chain = mono(SR, 0.5); [4100, 5200, 6300].forEach((f, k) => sine(chain, f * (0.97 + r() * 0.06), null, 0.07 + k * 0.02, 0.05)); addInto(b, chain, Math.round(0.03 * SR), 1);
    return b;
  },
  whoosh(r, { dur = 0.3, from = 300, to = 2400, amp = 0.6 } = {}) {
    const b = noiseOf(r, dur);
    bandpass(b, SR, (t) => from + (to - from) * Math.sin((Math.min(1, t / dur) * Math.PI) / 2), 0.9);
    applyEnv(b, (t) => Math.sin(Math.PI * Math.min(1, t / dur)) ** 1.5 * amp, SR);
    return b;
  },
  step(r, { surface = 'hard', amp = 1 } = {}) {
    if (surface === 'soft') {
      const b = bandpass(applyEnv(noiseOf(r, 0.22), (t) => Math.exp(-t / 0.05) * (0.6 + 0.4 * Math.sin(t * 900 * (0.8 + r() * 0.4))), SR), SR, 1300, 0.8);
      return b.map((v) => v * 1.4 * amp);
    }
    if (surface === 'metal') {
      const b = mono(SR, 0.45); sine(b, 330 * (0.9 + r() * 0.2), null, 0.12, 0.35 * amp); sine(b, 870 * (0.9 + r() * 0.2), null, 0.09, 0.2 * amp);
      const t = highpass(applyEnv(noiseOf(r, 0.05), expDecay(0.008), SR), SR, 1500); for (let i = 0; i < t.length; i++) b[i] += t[i] * 0.7 * amp; return b;
    }
    const wood = surface === 'wood';
    const b = mono(SR, 0.2); sine(b, wood ? 170 : 105, wood ? 95 : 62, wood ? 0.07 : 0.05, 0.8 * amp);
    const t = (wood ? lowpass : highpass)(applyEnv(noiseOf(r, 0.05), expDecay(0.01), SR), SR, wood ? 900 : 2200); for (let i = 0; i < t.length; i++) b[i] += t[i] * 0.6 * amp;
    return b;
  },
  alarm(r, { dur = 1.4, f = 920, amp = 0.8 } = {}) {
    const b = mono(SR, dur); let t0 = 0;
    while (t0 < dur - 0.05) {
      for (let k = 0; k < 4 && t0 < dur; k++, t0 += 0.15) {
        const n = Math.round(0.09 * SR); const s0 = Math.round(t0 * SR);
        for (let i = 0; i < n && s0 + i < b.length; i++) { const t = i / SR; const ph = TAU * f * t; b[s0 + i] += (Math.sin(ph) + 0.33 * Math.sin(3 * ph) + 0.2 * Math.sin(5 * ph)) * (1 + 0.5 * Math.sin(TAU * 28 * t)) * 0.4 * amp * Math.min(1, t / 0.004) * Math.min(1, (0.09 - t) / 0.01); }
      }
      t0 += 0.3;
    }
    return b;
  },
  cloth(r, { dur = 0.5, amp = 1 } = {}) { const b = noiseOf(r, dur); bandpass(b, SR, (t) => 380 + 900 * Math.sin((Math.PI * Math.min(1, t / dur))), 0.7); applyEnv(b, (t) => Math.pow(Math.sin(Math.PI * Math.min(1, t / dur)), 1.4) * amp * 1.6, SR); return b; },
  slam(r) { const b = mono(SR, 0.3); sine(b, 240, 120, 0.05, 0.8); const n = highpass(applyEnv(noiseOf(r, 0.08), expDecay(0.012), SR), SR, 700); addInto(b, n, 0, 0.8); return b; },
  tick(r, { f = 3200, amp = 0.6 } = {}) { const b = mono(SR, 0.1); sine(b, f * (0.95 + r() * 0.1), null, 0.012, amp); const n = applyEnv(noiseOf(r, 0.01), expDecay(0.002), SR); addInto(b, n, 0, 0.5 * amp); return b; },
  heart(r, { amp = 1 } = {}) { const b = mono(SR, 0.6); sine(b, 58, 52, 0.09, amp); const d = mono(SR, 0.3); sine(d, 50, 46, 0.08, amp * 0.8); addInto(b, d, Math.round(0.23 * SR), 1); return lowpass(b, SR, 160); },
  boom(r, { dur = 1.6, amp = 1 } = {}) {
    const b = mono(SR, dur); sine(b, 120, 30, dur * 0.34, amp);
    const n = lowpass(applyEnv(noiseOf(r, dur), expDecay(0.25), SR), SR, 380); for (let i = 0; i < b.length; i++) b[i] += n[i] * 0.55 * amp;
    return b;
  },
  riser(r, { dur = 1.4, amp = 0.7 } = {}) {
    const b = noiseOf(r, dur); bandpass(b, SR, (t) => 180 + 4200 * (t / dur) ** 2, 1.6);
    applyEnv(b, (t) => (t / dur) ** 2.2 * amp, SR);
    const s = mono(SR, dur); let ph = 0; for (let i = 0; i < s.length; i++) { const t = i / SR; ph += (TAU * (110 + 330 * (t / dur) ** 2)) / SR; s[i] = Math.sin(ph) * (t / dur) ** 2 * 0.18 * amp; }
    for (let i = 0; i < b.length; i++) b[i] += s[i];
    return b;
  },
  scribble(r, { dur = 0.5, amp = 0.5 } = {}) {
    const b = noiseOf(r, dur); bandpass(b, SR, 3200, 0.7);
    let lvl = 0.5; applyEnv(b, (t) => { if (Math.floor(t * 40) !== Math.floor((t - 1 / SR) * 40)) lvl = 0.35 + r() * 0.65; return lvl * amp * Math.min(1, t / 0.03) * Math.min(1, (dur - t) / 0.06); }, SR);
    return b;
  },
  coin(r) { const b = mono(SR, 0.7); [0, 0.07, 0.15].forEach((d, k) => { const c = mono(SR, 0.5); sine(c, (2400 + k * 420) * (0.97 + r() * 0.06), null, 0.1, 0.3); sine(c, (3300 + k * 520) * (0.97 + r() * 0.06), null, 0.07, 0.2); addInto(b, c, Math.round(d * SR), 1); }); return b; },
  click(r) { return SYN.tick(r, { f: 1800, amp: 0.8 }); },
  blip(r, { f = 880, amp = 0.4 } = {}) { const b = mono(SR, 0.25); sine(b, f, null, 0.07, amp); return fade(b, SR, 0.002, 0.03); },
  creak(r, { dur = 1.1, amp = 0.3 } = {}) { const b = mono(SR, dur); let ph = 0; for (let i = 0; i < b.length; i++) { const t = i / SR; const f = 150 + 90 * (t / dur) + 14 * Math.sin(TAU * 7 * t); ph += (TAU * f) / SR; b[i] = ((ph % TAU) / TAU * 2 - 1) * amp * Math.sin((Math.PI * t) / dur); } return bandpass(b, SR, 520, 2.2).map((v) => v * 2.4); },
  breath(r, { dur = 1.4, amp = 0.3, out = true } = {}) { const b = noiseOf(r, dur); bandpass(b, SR, out ? 700 : 900, 0.8); applyEnv(b, (t) => Math.sin((Math.PI * t) / dur) ** 2 * amp, SR); return b; },
  key(r) { const b = mono(SR, 0.08); sine(b, 190 * (0.9 + r() * 0.2), null, 0.018, 0.45); const n = bandpass(applyEnv(noiseOf(r, 0.04), expDecay(0.006), SR), SR, 2800 + r() * 1400, 1.1); addInto(b, n, 0, 0.7); return b; },
  ping(r, { amp = 0.4 } = {}) { const b = mono(SR, 0.7); sine(b, 1318, null, 0.16, amp); const c = mono(SR, 0.7); sine(c, 1760, null, 0.18, amp * 0.8); addInto(b, c, Math.round(0.11 * SR), 1); return b; },
  crack(r) { const b = lowpass(applyEnv(noiseOf(r, 0.35), expDecay(0.07), SR), SR, 2400); const t = SYN.thud(r, { f: 64, dur: 0.4, amp: 0.8 }); addInto(b, t, 0, 1); return b; },
  clank(r) { const b = mono(SR, 0.7); [520, 1130, 1760].forEach((f, k) => sine(b, f * (0.97 + r() * 0.06), null, 0.2 - k * 0.04, 0.3 / (k + 1))); const n = highpass(applyEnv(noiseOf(r, 0.03), expDecay(0.005), SR), SR, 1800); addInto(b, n, 0, 0.6); return b; },
  sand(r, { dur = 3, amp = 0.2 } = {}) { const b = noiseOf(r, dur); highpass(b, SR, 3500); return fade(b.map((v) => v * amp), SR, 0.3, 0.3); },
  crackle(r, { dur = 3, amp = 0.3 } = {}) { const b = mono(SR, dur); let t = 0; while (t < dur) { const n = highpass(applyEnv(noiseOf(r, 0.03), expDecay(0.006), SR), SR, 1500); addInto(b, n, Math.round(t * SR), amp * (0.4 + r() * 0.6)); t += 0.03 + r() * 0.25; } return b; },
};

// Continuous place beds. Quiet on purpose: they tell the ear where the scene is without competing.
function bed(kind, dur, rand) {
  const b = noiseOf(rand, dur);
  const hum = (f, a) => { for (let i = 0; i < b.length; i++) b[i] += Math.sin((TAU * f * i) / SR) * a; };
  switch (kind) {
    case 'room': lowpass(b, SR, 160); for (let i = 0; i < b.length; i++) b[i] *= 0.5; break;
    case 'wind': lowpass(b, SR, (t) => 220 + 160 * Math.sin(TAU * 0.11 * t)); for (let i = 0; i < b.length; i++) b[i] *= 0.7 * (0.7 + 0.3 * Math.sin((TAU * 0.07 * i) / SR)); break;
    case 'rain': bandpass(b, SR, 3200, 0.5); for (let i = 0; i < b.length; i++) b[i] *= 0.55; break;
    case 'sea': lowpass(b, SR, 420); for (let i = 0; i < b.length; i++) b[i] *= 0.75 * (0.5 + 0.5 * Math.sin((TAU * 0.12 * i) / SR) ** 2); break;
    case 'city': lowpass(b, SR, 360); for (let i = 0; i < b.length; i++) b[i] *= 0.5; hum(52, 0.03); break;
    case 'buzz': lowpass(b, SR, 3000); for (let i = 0; i < b.length; i++) b[i] *= 0.07; hum(100, 0.04); hum(300, 0.015); break;
    case 'fridge': lowpass(b, SR, 200); for (let i = 0; i < b.length; i++) b[i] *= 0.2; hum(60, 0.05); hum(120, 0.02); break;
    case 'crowd': bandpass(b, SR, (t) => 420 + 180 * Math.sin(TAU * 0.4 * t), 0.6); for (let i = 0; i < b.length; i++) b[i] *= 0.6 * (0.6 + 0.4 * Math.sin((TAU * 0.3 * i) / SR)); break;
    case 'night': lowpass(b, SR, 200); for (let i = 0; i < b.length; i++) { const t = i / SR; b[i] = b[i] * 0.3 + (Math.sin((TAU * 4400 * t)) * (((t * 3.2) % 1) < 0.18 ? 1 : 0)) * 0.012; } break;
    case 'drone': lowpass(b, SR, 120); for (let i = 0; i < b.length; i++) b[i] *= 0.4; hum(55, 0.06); break;
    default: lowpass(b, SR, 140); for (let i = 0; i < b.length; i++) b[i] *= 0.3;
  }
  return fade(b, SR, 0.8, 0.8);
}
const ENV_BED = {
  room: 'room', living: 'room', kitchen: 'fridge', desk: 'room', office: 'buzz', classroom: 'buzz', library: 'room', server: 'buzz', bank: 'room', hospital: 'buzz', supermarket: 'buzz',
  street: 'city', subway: 'city', busstop: 'city', rooftop: 'wind', market: 'crowd', harbor: 'sea', ocean: 'sea', arena: 'crowd', summit: 'wind', cliff: 'wind', snow: 'wind', desert: 'wind',
  forest: 'night', gym: 'room', stairs: 'room', void: 'drone', road: 'wind', industrial: 'buzz', lab: 'buzz', ruins: 'wind', cave: 'drone',
};
const SURFACE = { street: 'hard', subway: 'hard', busstop: 'hard', rooftop: 'hard', office: 'hard', classroom: 'hard', hospital: 'hard', bank: 'hard', supermarket: 'hard', server: 'metal', industrial: 'metal', stairs: 'wood', room: 'wood', living: 'wood', kitchen: 'wood', library: 'wood', desk: 'wood', gym: 'wood', market: 'soft', arena: 'soft', desert: 'soft', snow: 'soft', forest: 'soft', summit: 'soft', cliff: 'hard', cave: 'hard', harbor: 'wood', road: 'hard', void: 'hard' };

// ---- events from a shot list ----
// Returns [{ t, kind, params, gain (dB), pan, soft }] with t in film seconds.
export function sfxEvents({ shotList, kit, style }) {
  const S = storyRuntime();
  const ev = [];
  const r = mulberry((kit.seed ^ 0x5f3759df) >>> 0);
  const tone = 0.88 + (kit.seed % 23) / 100;       // 0.88 .. 1.10: this film's pitch
  const alarmF = 780 + (kit.seed % 7) * 55;
  const push = (t, kind, gain, extra = {}) => ev.push({ t, kind, gain, pan: extra.pan ?? (r() - 0.5) * 0.5, soft: Boolean(extra.soft), params: extra.params || {} });
  let prevAct = null;
  shotList.shots.forEach((shot, idx) => {
    const spec = shot.motion?.template === 'story' ? shot.motion.data : null;
    if (!spec) return;
    const t0 = shot.start_s; const D = shot.duration_s;
    const tl = S.timeline(spec, D);
    const surface = SURFACE[spec.env] || 'hard';
    const within = (t) => t >= 0 && t < D - 0.04;
    // Few sounds, each one earned: the turn into the grind lands with one low hit, the title with a boom.
    if (prevAct !== null && shot.act !== prevAct && shot.act === (style.story?.resolve_act || 5)) push(t0, 'boom', -7, { pan: 0, params: { dur: 1.5 } });
    prevAct = shot.act;
    if (spec.title) { push(t0 + 0.35, 'boom', -6, { pan: 0, params: { dur: 2.2 } }); push(t0 + 0.9, 'scribble', -24, { params: { dur: 0.6 } }); }
    if (spec.say) { const at = spec.say_at != null ? spec.say_at * D : Math.max(0.7, D * 0.28); push(t0 + at, 'scribble', -26, { soft: true, params: { dur: 0.5 } }); }
    if (spec.flash != null && within(spec.flash * D)) push(t0 + spec.flash * D, 'boom', -9, { pan: 0, params: { dur: 1.2 } });
    // real activity
    tl.punch.forEach((t) => { if (within(t)) { push(t0 + t - 0.12, 'whoosh', -24, { soft: true, params: { dur: 0.14, from: 600, to: 3000 } }); push(t0 + t, 'punch', -4, { pan: 0.1 }); } });
    tl.steps.forEach((t) => { if (within(t)) push(t0 + t, 'step', tl.stepKind === 'run' ? -12 : -17, { soft: true, params: { surface, amp: 0.9 + r() * 0.2 } }); });
    tl.pushDown.forEach((t) => { if (within(t)) push(t0 + t, 'thud', -13, { params: { f: 80, dur: 0.35 } }); });
    tl.pushUp.forEach((t) => { if (within(t)) push(t0 + t - 0.5, 'breath', -23, { soft: true, params: { dur: 0.9 } }); });
    tl.press.forEach((t) => { if (t > 0 && within(t)) push(t0 + t, 'clank', -14, { soft: false }); });
    if (tl.alarmRing && tl.alarmHit != null) { push(t0 + tl.alarmRing[0], 'alarm', -7, { pan: 0.3, params: { dur: tl.alarmHit - tl.alarmRing[0], f: alarmF } }); push(t0 + tl.alarmHit, 'slam', -4, { pan: 0.3 }); if (spec.slam) push(t0 + tl.alarmHit, 'thud', -8, { pan: 0, params: { f: 64, dur: 0.6 } }); }
    if (tl.bedAct) push(t0 + tl.bedAct.hit + (spec.awake ? 0.15 : 0.5), 'cloth', -17, { soft: true, pan: -0.1, params: { dur: spec.awake ? 0.4 : 0.7 } });
    if (tl.typing) for (let t = tl.typing[0] + 0.2; t < Math.min(D - 0.05, tl.typing[1]); t += 0.24 + r() * 0.34) push(t0 + t, 'key', -28 + r() * 3, { soft: true, pan: -0.15 });
    if (spec.pose === 'lie_bed') for (let t = 0.4; t < D - 1; t += 3.8) push(t0 + t, 'breath', -26, { soft: true, params: { dur: 1.8, out: t % 7.6 > 3.8 } });
    if (spec.pose === 'phone' || spec.pose === 'sit_phone') { push(t0 + 0.5, 'ping', -17, { pan: 0.25 }); }
    // props
    (spec.props || []).forEach((raw, i) => {
      const [name, ...rest] = String(raw).split(':'); const arg = rest.join(':');
      const pt0 = name === 'bag' || name === 'alarm_clock' || name === 'laptop' ? 0 : 0.25 + i * 0.28;
      if (name === 'calendar') { const marks = Math.min(35, Number(arg) || 12); for (let k = 0; k < marks && 0.5 + k * (2.4 / marks) < D - 0.2; k++) push(t0 + 0.5 + k * (2.4 / marks), 'scribble', -21, { soft: true, params: { dur: 0.13 } }); }
      if (name === 'coins') push(t0 + pt0 + 0.25, 'coin', -15);
      if (name === 'lock') { push(t0 + pt0 + 0.3, 'click', -14); push(t0 + pt0 + 0.55, 'clank', -18); }
      if (name === 'battery') for (let k = 0; k < 3; k++) push(t0 + pt0 + 0.3 + k * 0.28, 'blip', -19, { params: { f: 880 - k * 190 } });
      if (name === 'chart_up') for (let k = 0; k < 6; k++) push(t0 + 0.3 + k * 0.16 + 0.2, 'blip', -21, { params: { f: arg === 'down' ? 880 - k * 95 : 440 + k * 95 } });
      if (name === 'door') push(t0 + pt0 + 0.2, 'creak', -16);
      if (name === 'dialog' && arg === 'cancel') push(t0 + 3.4, 'click', -10);
      if (name === 'notify') for (let k = 0; k < 6; k++) push(t0 + 0.2 + k * 0.42 + 0.15, 'ping', -20 - k * 0.5, { pan: (k % 2 ? 0.25 : -0.25) });
      if (name === 'views' && Number(arg) >= 1000) push(t0 + 0.3, 'ping', -18, { pan: 0 });
      if (name === 'hourglass') push(t0 + pt0, 'sand', -24, { soft: true, params: { dur: Math.max(1, D - pt0 - 0.3) } });
      if (name === 'flame') push(t0 + pt0, 'crackle', -22, { soft: true, params: { dur: Math.max(1, D - pt0) } });
      if (name === 'wall_clock' || (name === 'alarm_clock' && !tl.alarmRing)) for (let t = 0.3; t < D - 0.1; t += 1) push(t0 + t, 'tick', -24, { soft: true, params: { f: Math.round(t) % 2 ? 2500 : 3200 } });
      if (name === 'mirror') push(t0 + pt0 + 0.5, 'crack', -15);
      if (name === 'gears') for (let t = 0.2; t < D - 0.2; t += 0.45) push(t0 + t, 'tick', -26, { soft: true, params: { f: 1500 } });
    });
  });
  // The film is quiet: only sounds that belong to the story are kept, and everything sits low under the music.
  const KEEP = { boom: -3, alarm: 0, slam: -3, thud: -3, punch: -4, step: -4, cloth: 0, key: -3, ping: -3, click: 0, tick: 0, crack: 0, creak: 0, coin: 0 };
  const calm = ev.filter((e) => e.kind in KEEP).map((e) => ({ ...e, gain: e.gain + KEEP[e.kind] }));
  calm.sort((a, b) => a.t - b.t);
  return calm;
}

// Quiet place beds, one stretch per run of shots in the same place.
export function bedSegments({ shotList }) {
  // the film has no room tone; only rain is heard as a place
  const segs = [];
  for (const shot of shotList.shots) {
    const spec = shot.motion?.template === 'story' ? shot.motion.data : null;
    if (!spec || !(spec.fx || []).includes('rain')) continue;
    const last = segs.at(-1);
    if (last && shot.start_s - last.e < 0.6) last.e = shot.start_s + shot.duration_s;
    else segs.push({ kind: 'rain', s: shot.start_s, e: shot.start_s + shot.duration_s });
  }
  return segs;
}

// Renders events and beds into one stereo WAV. Non-critical effects are lowered under narration so
// they never mask a word; hits, alarms and booms stay full.
export function renderSfxBed({ events, beds, duration, regions = [], kit, file }) {
  const st = stereo(SR, duration);
  const rand = mulberry((kit.seed ^ 0xabcdef) >>> 0);
  const tone = 0.88 + (kit.seed % 23) / 100;
  const cache = new Map();
  const make = (e, variant) => {
    const key = `${e.kind}|${JSON.stringify(e.params)}|${variant}`;
    if (cache.has(key)) return cache.get(key);
    const r = mulberry((kit.seed + variant * 7919 + e.kind.length * 31) >>> 0);
    const p = { ...e.params };
    if (p.f) p.f *= tone; else if (['thud', 'boom'].includes(e.kind) && !p.f) p.f = (e.kind === 'thud' ? 72 : 60) * tone;
    const buf = SYN[e.kind](r, p);
    cache.set(key, buf);
    return buf;
  };
  const inVo = (t) => regions.some((g) => t >= g.s - 0.1 && t <= g.e + 0.1);
  let n = 0;
  for (const e of events) {
    if (e.t < 0 || e.t > duration - 0.05 || !SYN[e.kind]) continue;
    const buf = make(e, n % 4); n += 1;
    let g = dbToGain(e.gain);
    if (e.soft && inVo(e.t)) g *= 0.45;
    addStereo(st, buf, Math.round(e.t * SR), g, e.pan);
  }
  for (const b of beds) {
    const dur = Math.max(1, Math.min(b.e - b.s, 240));
    const buf = bed(b.kind, dur, rand);
    const gain = dbToGain(-24);
    addStereo(st, buf, Math.round(b.s * SR), gain, 0);
  }
  softClip(st.l, 1.1); softClip(st.r, 1.1);
  writeWav(file, st);
  return file;
}
export { SYN as __synth };

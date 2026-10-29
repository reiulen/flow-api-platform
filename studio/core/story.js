// Story scenes: the deterministic half of the storybook stickman genre.
// The LLM only picks words from a closed vocabulary; everything here validates, repairs, varies and
// seeds those picks, so a bad answer can never produce a broken or repeated frame.
import { hash, seededRandom } from './util.js';

export const VOCAB = {
  env: ['room', 'living', 'desk', 'office', 'street', 'gym', 'stairs', 'summit', 'void', 'desert', 'ocean', 'forest', 'snow', 'industrial', 'ruins', 'lab', 'road', 'rooftop', 'subway', 'kitchen', 'classroom', 'hospital', 'market', 'harbor', 'arena', 'cliff', 'cave', 'server', 'bank', 'supermarket', 'busstop', 'library', 'studio', 'underground', 'balcony'],
  time: ['night', 'dawn', 'dusk', 'day', 'void', 'warm'],
  pose: ['stand', 'slump', 'look_up', 'walk', 'run', 'climb', 'sit_edge', 'sit_slump', 'sit_hug', 'sit_bed', 'lie_bed', 'lie_floor', 'reach', 'pushup', 'punch', 'lift', 'victory', 'despair', 'point', 'kneel', 'cower', 'carry', 'type', 'slump_desk', 'phone', 'sit_phone', 'cheer', 'head_hands', 'none'],
  face: ['neutral', 'deadpan', 'tired', 'sad', 'anger', 'strain', 'shock', 'smile', 'smirk', 'asleep', 'empty', 'scared', 'proud'],
  prop: ['alarm_clock', 'clock_big', 'wall_clock', 'calendar', 'bag', 'phone', 'books', 'lamp', 'mirror', 'door', 'hourglass', 'chart_up', 'coins', 'gears', 'battery', 'lock', 'flame', 'trophy', 'pin', 'wall', 'scales', 'crate', 'barbell', 'flag', 'laptop', 'cup', 'chart_two', 'paper_pile', 'doc', 'pot', 'views', 'dialog', 'notify'],
  hold: ['phone', 'box', 'book', 'torch', 'cup'],
  fx: ['speed', 'impact', 'sweat', 'dust', 'rain', 'snow', 'embers', 'letters'],
  cam: ['push', 'pull', 'pan_left', 'pan_right', 'low', 'shake', 'static'],
  say_pos: ['top', 'upper', 'mid', 'low'],
  zoom: ['wide', 'mid', 'close'],
  critic: ['near', 'child', 'ally'],
  voice: ['demon', 'self'],
  at: ['left', 'center', 'right'],
};
// Props that take a ":argument" and the shape of that argument.
const PROP_ARG = { pot: /^(0|1|0?\.\d+)$/, views: /^\d{1,6}$/, dialog: /^(delete|cancel)$/, wall_clock: /^fast$/, doc: /^(blank|draft|done)$/, alarm_clock: /^\d{1,2}:\d{2}$/, clock_big: /^\d{1,2}:\d{2}$/, calendar: /^\d{1,2}$/, battery: /^\d{1,3}$/, chart_up: /^(up|down)$/ };

// Poses that only make sense on a particular env (a bed, a desk); the env decides whether they work.
const NEEDS = { lie_bed: ['room', 'living', 'void', 'desert', 'forest', 'snow', 'ruins', 'industrial', 'lab', 'road', 'street', 'gym', 'ocean', 'office', 'desk'], reach: ['room'], slump_desk: ['desk', 'office', 'lab', 'studio'], type: ['desk', 'office', 'lab', 'studio'] };

// A pose change may not move the body between the floor, a seat and a bed mid-shot.
const PLACE = { seat: ['sit_edge', 'sit_slump', 'sit_bed', 'reach', 'type', 'slump_desk', 'sit_phone', 'head_hands'], lie: ['lie_bed', 'lie_floor'] };
// Only the body's own moves may change place mid-shot: lying up to sitting glides, floor to chair does not.
const transitionOk = (a, b) => placeOf(a) === placeOf(b) || (a === 'lie_bed' && b === 'sit_bed');
export const placeOf = (pose) => (PLACE.seat.includes(pose) ? 'seat' : PLACE.lie.includes(pose) ? 'lie' : 'floor');

// Places that look like the film this channel learned from. Each video avoids three of them, so its world is its own.
const REFERENCE_LIKE = ['room', 'gym', 'stairs', 'summit', 'street'];
const ENV_GROUPS = {
  home: ['room', 'living', 'kitchen'], work: ['desk', 'office', 'classroom', 'library', 'server', 'bank'],
  city: ['street', 'subway', 'busstop', 'rooftop', 'supermarket', 'market'], body: ['gym', 'hospital'],
  nature: ['summit', 'desert', 'ocean', 'forest', 'snow', 'cliff', 'cave'], history: ['ruins', 'arena', 'market', 'harbor'],
  industry: ['industrial', 'lab', 'harbor', 'server'], abstract: ['void', 'road', 'stairs'],
};
function remapEnv(env, pose, avoid, rand) {
  if (!avoid || !avoid.includes(env)) return env;
  if (pose === 'reach' || pose === 'lie_bed') return env; // these need the bedroom
  const need = NEEDS[pose];
  const group = Object.values(ENV_GROUPS).find((g) => g.includes(env)) || VOCAB.env;
  let cands = group.filter((e) => !avoid.includes(e) && e !== 'void' && (!need || need.includes(e)));
  if (!cands.length) cands = VOCAB.env.filter((e) => !avoid.includes(e) && e !== 'void' && (!need || need.includes(e)));
  return cands.length ? cands[Math.floor(rand() * cands.length) % cands.length] : env;
}

// A meter is the film's one running number, e.g. "MOTIVATION:55": a labelled bar in the top centre that moves between scenes.
export function parseMeter(raw) {
  const m = String(raw || '').match(/^\s*([A-Za-z][A-Za-z ]{1,13}?)\s*[:=]\s*(\d{1,3})\s*%?\s*$/);
  return m ? `${m[1].trim().toUpperCase()}:${Math.min(100, Number(m[2]))}` : '';
}
// Walks the scenes in film order and tells each one where its bar starts, so it glides from the last value.
export function linkMeters(datas) {
  const last = {};
  for (const d of datas) {
    if (!d || !d.meter) continue;
    const [label, v] = d.meter.split(':'); const val = Number(v);
    d.meter_from = last[label] != null ? last[label] : val;
    last[label] = val;
  }
  return datas;
}

// The meter is run by the editor, not the model: it burns down while the failure repeats and a second one fills after the turn.
const METER_LABELS = [
  [/\b(motivat|inspir|hype|pump|goals?)\b/i, 'MOTIVATION'], [/\b(discipline|habit|routine|consisten)/i, 'MOTIVATION'],
  [/\b(sleep|tired|burnout|exhaust|fatigue|energy|insomnia)/i, 'ENERGY'], [/\b(money|saving|savings|debt|invest|budget|broke|wealth|salary)/i, 'SAVINGS'],
  [/\b(focus|attention|distract|scroll|phone|procrastinat|deep work)/i, 'FOCUS'], [/\b(confiden|fear|anxiety|shy|doubt|imposter)/i, 'CONFIDENCE'],
  [/\b(health|body|diet|weight|fitness|gym|muscle|heart|blood)/i, 'HEALTH'], [/\b(friend|lonel|relationship|trust|family|love)/i, 'TRUST'],
];
export function meterLabelFor(text) {
  const t = String(text || '');
  for (const [re, label] of METER_LABELS) if (re.test(t)) return label;
  return 'WILLPOWER';
}
// items: [{ start, end, act, data }] in film order. Fills data.meter for the whole film unless the scenes already carry one.
export function assignMeters(items, { label = 'WILLPOWER', after = 'HABIT', resolveAct = 5 } = {}) {
  const drawn = items.filter((x) => x.data && !x.data.title);
  if (!drawn.length || drawn.some((x) => x.data.meter)) return items;
  const acts = {};
  for (const x of drawn) { const a = acts[x.act] || (acts[x.act] = { s: x.start, e: x.end }); a.s = Math.min(a.s, x.start); a.e = Math.max(a.e, x.end); }
  const CURVE = { 2: [100, 72], 3: [72, 46], 4: [46, 3] };
  for (const x of drawn) {
    if (x.act < 2 || x.data.slam) continue;
    const a = acts[x.act]; const p = a.e > a.s ? Math.min(1, Math.max(0, ((x.start + x.end) / 2 - a.s) / (a.e - a.s))) : 0;
    let name = label; let c = CURVE[x.act];
    if (x.act >= resolveAct) { name = after; c = x.act === resolveAct ? [4, 52] : [52, 88]; }
    if (!c) c = [100, 100];
    x.data.meter = `${name}:${Math.round(c[0] + (c[1] - c[0]) * p)}`;
  }
  return items;
}

// The twist: the voice that accused him was the part of him that never quit. After the accuser appears in the film,
// the first three single scenes of the turn show it close, small, then in his own colour; after that it walks beside him.
export function assignTwist(items, { resolveAct = 5 } = {}) {
  const heroScene = (x) => x.data && !x.data.title && !x.data.slam && x.data.pose && x.data.pose !== 'none' && !x.data.montage_cut;
  const accused = items.some((x) => x.act < resolveAct && x.data && x.data.shadow);
  if (!accused || items.some((x) => x.data && x.data.critic_mode)) return items;
  const turn = items.filter((x) => x.act === resolveAct && heroScene(x) && ['floor'].includes(placeOf(x.data.pose)));
  if (turn.length < 3) return items;
  const modes = ['near', 'child', 'ally'];
  const used = turn.slice(0, 3);
  used.forEach((x, i) => { x.data.critic_mode = modes[i]; x.data.shadow = true; x.data.say = ''; });
  const after = used[2].start;
  for (const x of items) if (x.data && x.start > after && x.act >= resolveAct && !x.data.title && !x.data.slam && x.data.pose !== 'none') x.data.ally_follow = true;
  return items;
}

const pick = (rand, arr) => arr[Math.floor(rand() * arr.length) % arr.length];
const oneOf = (value, list, fallback) => (list.includes(value) ? value : fallback);
const words = (s) => String(s || '').trim().split(/\s+/).filter(Boolean);
const clean = (s, maxWords, maxChars) => {
  const t = String(s || '').replace(/\s*[—–]\s*/g, ', ').replace(/\s*,\s*,/g, ',').replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim();
  const w = words(t).slice(0, maxWords).join(' ');
  return w.length > maxChars ? w.slice(0, maxChars).replace(/\s+\S*$/, '') : w;
};

// Beat grid of the film's montages: every cut lasts two beats of this tempo (1.2 to 1.5 s).
export function montageCut(seed) { return [1.2, 1.25, 1.3333, 1.5][parseInt(hash(`cut:${seed}`, 4), 16) % 4]; }

// ---------- the kit: everything that makes one video look like its own film ----------
const hsl = (h, s, l) => {
  const a = (s / 100) * Math.min(l / 100, 1 - l / 100);
  const f = (n) => { const k = (n + h / 30) % 12; const c = l / 100 - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)); return Math.round(255 * c).toString(16).padStart(2, '0'); };
  return `#${f(0)}${f(8)}${f(4)}`;
};
const HEADGEAR = ['headband', 'beanie', 'cap', 'glasses', 'hair', 'scarf', 'none'];
const OUTFIT = ['bare', 'hoodie', 'tee', 'tank', 'jacket'];
const BODY = ['#ece7dc', '#e4ebe8', '#f0e2d2', '#dfe3ea', '#eadfca', '#e9e4ec'];
const VOICE_FONTS = ['"Gochi Hand", cursive', '"Caveat Brush", cursive', '"Kalam", cursive'];
const CAPTION_FONTS = ['"Patrick Hand", sans-serif', '"Kalam", sans-serif'];
const TAGS = ['DAY', 'DAY', 'DAY', 'YEAR', 'HOUR', 'STEP'];

// style.story.kit may pin any field (a channel that wants one fixed face) and restrict the pools.
export function buildKit(seed, style = {}) {
  const cfg = style.story?.kit || {};
  const r = seededRandom(`kit:${seed}`);
  // Hue from a golden-ratio walk of the seed, skipping the violet band that every default AI palette lives in.
  let h = Math.floor(((parseInt(hash(String(seed), 6), 16) * 0.61803398875) % 1) * 360);
  if (h >= 250 && h < 345) h = (h + 110) % 360;
  if (Number.isFinite(cfg.hue)) h = cfg.hue;
  const tint = (h + (r() < 0.5 ? 195 : 12)) % 360;
  const mood = cfg.mood || (() => { const x = r(); return x < 0.62 ? 'vivid' : x < 0.76 ? 'ink' : x < 0.9 ? 'dusk' : 'slate'; })();
  const M = {
    // the look the reference films share: a navy night with lit windows that goes grey when the feeling dies
    vivid: { bg0: [11, 2], bg1: [19, 3], ft: [23, 3], fb: [15, 2], sat: 44, edge: 'rgba(255,255,255,0.2)', text: '#f6f2ea', accentL: 60 },
    ink: { bg0: [3.8, 1.4], bg1: [7, 2], ft: [18, 3], fb: [11, 2], sat: 20, edge: 'rgba(255,255,255,0.14)', text: '#f3efe6', accentL: 58 },
    dusk: { bg0: [9, 2], bg1: [15, 2], ft: [26, 3], fb: [18, 2], sat: 26, edge: 'rgba(255,255,255,0.16)', text: '#f3efe6', accentL: 60 },
    slate: { bg0: [19, 2], bg1: [27, 2], ft: [38, 3], fb: [29, 2], sat: 15, edge: 'rgba(255,255,255,0.18)', text: '#f6f2ea', accentL: 62 },
    paper: { bg0: [68, 3], bg1: [79, 3], ft: [47, 3], fb: [36, 3], sat: 30, edge: 'rgba(0,0,0,0.3)', text: '#17161b', accentL: 46 },
  }[mood];
  const paperTint = Number.isFinite(cfg.paperTint) ? cfg.paperTint : (r() < 0.6 ? 36 + Math.floor(r() * 18) : 196 + Math.floor(r() * 16));
  const vividTint = r() < 0.75 ? 222 + Math.floor(r() * 18) : 188 + Math.floor(r() * 14);
  const tintH = mood === 'paper' ? paperTint : mood === 'vivid' ? (cfg.hue != null ? tint : vividTint) : tint;
  const light = (cfg.accent_light ?? M.accentL) + Math.floor(r() * 8) - 4;
  const palette = {
    bg0: hsl(tintH, M.sat + r() * 8, M.bg0[0] + r() * M.bg0[1]),
    bg1: hsl(tintH, M.sat - 2 + r() * 8, M.bg1[0] + r() * M.bg1[1]),
    furnTop: hsl(tintH, 16 + r() * 6, M.ft[0] + r() * M.ft[1]),
    furnBottom: hsl(tintH, 18 + r() * 6, M.fb[0] + r() * M.fb[1]),
    edge: M.edge,
    accent: hsl(h, 84, light),
    accent2: hsl((h + (r() < 0.5 ? 12 + Math.floor(r() * 16) : 332 + Math.floor(r() * 16))) % 360, 88, mood === 'paper' ? 52 : 62),
    glow: hsl((h + 16) % 360, 92, mood === 'paper' ? 62 : 74),
    body: cfg.body || (mood === 'paper' ? '#fffaf0' : pick(r, BODY)),
    text: M.text,
  };
  const outfit = cfg.outfit || pick(r, OUTFIT);
  const outfitHue = r() < 0.5 ? tint : h;
  const hero = {
    headgear: cfg.headgear || pick(r, HEADGEAR),
    outfit,
    outfitColor: hsl(outfitHue, outfit === 'bare' ? 0 : 22 + r() * 20, 20 + r() * 12),
    pants: r() < 0.55 ? 'bare' : hsl(tint, 20, 17 + r() * 8),
    shoes: hsl(tint, 12, 10 + r() * 6),
    belt: r() < 0.18 ? palette.accent : null,
    headW: 50 + Math.floor(r() * 9),
    headH: 47 + Math.floor(r() * 8),
    limb: 22 + Math.floor(r() * 5),
    height: 0.94 + r() * 0.12,
  };
  if (hero.outfit === 'hoodie' && hero.headgear !== 'none') hero.headgear = 'none'; // a hood is the headgear
  return {
    seed: parseInt(hash(String(seed), 8), 16) >>> 0,
    palette,
    hero,
    type: { voice: cfg.voice || pick(r, VOICE_FONTS), caption: cfg.caption || pick(r, CAPTION_FONTS) },
    tag: cfg.tag || pick(r, TAGS),
    motif: cfg.motif || pick(r, ['alarm_clock', 'hourglass', 'flame', 'gears', 'wall_clock', 'lock', 'scales', 'door']),
    mood,
    gearOnResolve: cfg.gearOnResolve !== false,
    voice: cfg.voice === 'demon' ? 'demon' : '',
    cut: montageCut(seed),
    frame: cfg.frame || (cfg.bars === true ? 'bars' : (r(), 'none')), // full frame: the black bars only cut the picture
    tagStyle: cfg.tagStyle || (() => { const x = r(); return x < 0.72 ? 'center' : x < 0.86 ? 'corner' : x < 0.94 ? 'plate' : 'stamp'; })(),
    sayStyle: cfg.sayStyle || (() => { const x = r(); return x < 0.8 ? 'ink' : 'chip'; })(),
    critic: cfg.critic || (() => { const x = r(); return x < 0.7 ? 'silhouette' : 'cast'; })(),
    windowStyle: cfg.windowStyle || pick(r, ['panes', 'arch', 'round', 'slit']),
    avoid: cfg.avoid || [],
    grain: cfg.grain ?? 0.1,
    wobble: cfg.wobble ?? 3,
    rim: 0.7,
  };
}

// ---------- normalising an LLM scene ----------
export function normalizeScene(raw, o = {}) {
  const r = seededRandom(`scene:${o.seed || 'x'}:${o.index || 0}`);
  const s = raw && typeof raw === 'object' ? raw : {};
  let pose = oneOf(s.pose, VOCAB.pose, 'stand');
  const env = o.keepEnv ? oneOf(s.env, VOCAB.env, 'void') : remapEnv(oneOf(s.env, VOCAB.env, o.fallbackEnv || pick(r, ['kitchen', 'rooftop', 'busstop', 'library', 'room'])), pose, o.avoid, r);
  if (NEEDS[pose] && !NEEDS[pose].includes(env)) pose = 'stand';
  if (pose === 'lie_bed' && env !== 'room') pose = 'lie_floor';
  if ((pose === 'sit_edge' || pose === 'sit_slump' || pose === 'sit_bed' || pose === 'reach') && !['room', 'living', 'desk', 'office', 'void', 'street', 'gym', 'ocean', 'forest', 'snow', 'desert', 'ruins', 'industrial', 'lab', 'road'].includes(env)) pose = 'stand';
  if (pose === 'sit_phone' && env !== 'living') pose = env === 'room' ? 'sit_edge' : 'phone';
  if (pose === 'climb' && env !== 'stairs') pose = o.avoid && o.avoid.includes('stairs') ? 'walk' : pose;
  let poseTo = oneOf(s.pose_to, VOCAB.pose, '');
  if (poseTo === pose || poseTo === 'none' || (NEEDS[poseTo] && !NEEDS[poseTo].includes(env)) || !transitionOk(pose, poseTo)) poseTo = '';
  const props = [];
  for (const p of Array.isArray(s.props) ? s.props : []) {
    const [name, ...rest] = String(p).split(':');
    if (!VOCAB.prop.includes(name)) continue;
    const arg = rest.join(':').trim();
    const re = PROP_ARG[name];
    let a = re && arg && re.test(arg) ? arg : '';
    if (a && (name === 'calendar' || name === 'battery')) a = String(Math.min(name === 'calendar' ? 35 : 100, Number(a)));
    props.push(a ? `${name}:${a}` : name);
    if (props.length >= 3) break;
  }
  // An activity needs what it acts on: a punch needs a target, a reach needs the alarm, typing needs the laptop.
  const SEATED_OR_LYING = ['sit_edge', 'sit_slump', 'sit_bed', 'sit_hug', 'sit_phone', 'lie_bed', 'lie_floor', 'reach', 'type', 'slump_desk'];
  if (props.some((p) => p.startsWith('bag')) && !SEATED_OR_LYING.includes(pose) && pose !== 'punch' && poseTo !== 'punch') pose = 'punch';
  if ((pose === 'punch' || poseTo === 'punch') && !props.some((p) => p.startsWith('bag') || p.startsWith('wall'))) props.unshift('bag');
  if (pose === 'reach' && env === 'room' && !props.some((p) => p.startsWith('alarm_clock'))) props.unshift('alarm_clock:5:00');
  if ((pose === 'type' || poseTo === 'type') && !props.some((p) => p.startsWith('laptop'))) props.unshift('laptop');
  if (pose === 'lift' || poseTo === 'lift') { const i = props.indexOf('barbell'); if (i >= 0) props.splice(i, 1); }
  if (props.length > 3) props.length = 3;
  const fx = [...new Set((Array.isArray(s.fx) ? s.fx : []).filter((f) => VOCAB.fx.includes(f)))].slice(0, 2);
  const spec = {
    env,
    time: oneOf(s.time, VOCAB.time, env === 'void' ? 'void' : (env === 'summit' ? 'dawn' : 'night')),
    pose,
    pose_to: poseTo,
    pose_at: typeof s.pose_at === 'number' && s.pose_at > 0 ? Math.min(0.85, Math.max(0.2, s.pose_at)) : 0.55,
    face: oneOf(s.face, VOCAB.face, ''),
    face_to: oneOf(s.face_to, VOCAB.face, ''),
    facing: s.facing === 'left' ? 'left' : 'right',
    at: oneOf(s.at, VOCAB.at, ''),
    props,
    hold: oneOf(s.hold, VOCAB.hold, ''),
    say: clean(s.say, 5, 30),
    say_pos: oneOf(s.say_pos, VOCAB.say_pos, 'upper'),
    say_at: typeof s.say_at === 'number' && s.say_at > 0 ? Math.min(0.8, Math.max(0.1, s.say_at)) : null,
    underline: Boolean(s.underline),
    line: clean(s.line, 18, 100),
    tag: clean(s.tag, 3, 14).toUpperCase(),
    title: clean(s.title, 3, 26),
    shadow: Boolean(s.shadow || s.critic_mode),
    critic_mode: oneOf(s.critic_mode, VOCAB.critic, ''),
    ally_follow: Boolean(s.ally_follow),
    shadow_size: typeof s.shadow_size === 'number' ? Math.min(2, Math.max(0, s.shadow_size)) : null,
    horns: Boolean(s.horns),
    growth: typeof s.growth === 'number' ? Math.min(1, Math.max(0, s.growth)) : null,
    voice: oneOf(s.voice, VOCAB.voice, ''),
    fx,
    cam: oneOf(s.cam, VOCAB.cam, pick(r, ['push', 'push', 'pull', 'pan_left', 'pan_right'])),
    flash: typeof s.flash === 'number' && s.flash > 0 ? Math.min(0.95, Math.max(0.05, s.flash)) : null,
    variant: s.variant === 'b' ? 'b' : 'a',
    zoom: oneOf(s.zoom, VOCAB.zoom, 'wide'), // the set is shown whole; zoom is a light push, never a crop
    focus: s.focus === 'prop' && !(pose === 'lie_bed' || pose === 'reach') ? 'prop' : 'hero', // the whole bed stays in frame
    slam: Boolean(s.slam),
    resolved: Boolean(s.resolved),
    awake: Boolean(s.awake || s.resolved),
    meter: parseMeter(s.meter),
  };
  if (spec.slam) { spec.env = 'void'; spec.time = 'void'; spec.pose = 'none'; spec.pose_to = ''; spec.focus = 'prop'; spec.props = ['clock_big:5:00']; spec.shadow = false; }
  if (spec.fx.includes('letters') && !spec.say && !spec.line) spec.fx = spec.fx.filter((f) => f !== 'letters');
  if (spec.pose === 'none' && !spec.title && !spec.say && !spec.slam && !spec.props.length && spec.env !== 'underground') spec.pose = 'stand';
  if (spec.pose === 'lie_bed' && spec.env !== 'room') spec.pose = 'lie_floor';
  if (spec.say && !spec.say_at) spec.say_at = null;
  return spec;
}

// ---------- repair: when the model fails, read the narration ----------
const RULES = {
  env: [
    [/\b(roof|rooftop|skyline|antenna|tower block)\b/i, 'rooftop'],
    [/\b(subway|metro|train station|platform|underground train|rush hour)\b/i, 'subway'],
    [/\b(kitchen|fridge|cook|cooking|midnight snack|dinner|breakfast|leftovers|meal)\b/i, 'kitchen'],
    [/\b(school|class|classroom|teacher|student|lecture|exam|grades?)\b/i, 'classroom'],
    [/\b(hospital|doctor|patient|surgery|ward|clinic|heartbeat|illness|disease|medical|nurse)\b/i, 'hospital'],
    [/\b(market|merchant|vendor|stall|bazaar|haggle|trader)\b/i, 'market'],
    [/\b(harbor|harbour|port|dock|docks|container|shipping|strait|canal|freight)\b/i, 'harbor'],
    [/\b(arena|gladiator|colosseum|amphitheat|spectacle|spectators)\b/i, 'arena'],
    [/\b(cliff|ledge|ravine|precipice|rope)\b/i, 'cliff'],
    [/\b(cave|cavern|crevasse|ice cave)\b/i, 'cave'],
    [/\b(server|data center|datacenter|cloud|algorithm|hack|database|cyber|chip|semiconductor)\b/i, 'server'],
    [/\b(bank|vault|loan|interest|credit|savings|wealth|mortgage|central bank)\b/i, 'bank'],
    [/\b(supermarket|grocery|aisle|checkout|shelf|shelves|shopping)\b/i, 'supermarket'],
    [/\b(bus stop|bus|rain|waiting|late for)\b/i, 'busstop'],
    [/\b(library|archive|manuscript|reading|research|scholar)\b/i, 'library'],
    [/\b(alarm|wake|woke|asleep|sleep|bed|morning|dawn|dream|insomnia)\b/i, 'room'],
    [/\b(phone|scroll|couch|sofa|netflix|binge|screen|tv)\b/i, 'living'],
    [/\b(desk|homework|exam|study|studying|write|writing|essay|book|deadline)\b/i, 'desk'],
    [/\b(office|boss|meeting|salary|corporate|career|employee|cubicle|job)\b/i, 'office'],
    [/\b(gym|lift|weights|muscle|workout|barbell|protein|reps|train|training)\b/i, 'gym'],
    [/\b(climb|stairs|step|steps|ladder|slope|uphill|grind|incline)\b/i, 'stairs'],
    [/\b(summit|peak|top of|sunrise|finally|victory|champion|success)\b/i, 'summit'],
    [/\b(desert|thirst|dehydrat|sahara|sand|dune)\b/i, 'desert'],
    [/\b(sea|ocean|ship|sail|dive|diving|drown|wave|harbor|port|strait|submarine)\b/i, 'ocean'],
    [/\b(forest|jungle|lost|wilderness|trail|trees)\b/i, 'forest'],
    [/\b(ice|cold|freez|snow|hypotherm|everest|frost|blizzard|arctic)\b/i, 'snow'],
    [/\b(factory|reactor|pipeline|oil|plant|pressure|valve|machine|industrial|refinery|steel|coolant)\b/i, 'industrial'],
    [/\b(empire|rome|roman|ancient|greek|egypt|pharaoh|temple|gladiator|emperor|senate|legion|ruins|medieval|dynasty)\b/i, 'ruins'],
    [/\b(lab|science|scientist|cell|brain|chemical|experiment|study shows|researchers|neuron|blood|organ)\b/i, 'lab'],
    [/\b(road|highway|trade|route|truck|journey|travel|commute|supply chain|cargo)\b/i, 'road'],
    [/\b(street|city|urban|crowd|traffic|night shift|downtown)\b/i, 'street'],
  ],
  pose: [
    [/\b(alarm|snooze)\b/i, 'reach'],
    [/\b(lift|lifting|lifted|barbell|deadlift|squat|weights)\b/i, 'lift'],
    [/\b(sleep|asleep|dream|bed|slept)\b/i, 'lie_bed'],
    [/\b(push-?ups?|plank)\b/i, 'pushup'],
    [/\b(punch|punched|fight|fought|strike|attack|crush)\b/i, 'punch'],
    [/\b(run|ran|chase|rush|sprint|flee|escape)\b/i, 'run'],
    [/\b(climb|ascend|uphill|ladder)\b/i, 'climb'],
    [/\b(walk|walked|march|steps|journey|travel)\b/i, 'walk'],
    [/\b(scroll|phone|feed|notification)\b/i, 'phone'],
    [/\b(type|typing|write|wrote|code|emails?)\b/i, 'type'],
    [/\b(win|won|proud|triumph|finally|victory|made it|reach(ed)? the top)\b/i, 'victory'],
    [/\b(panic|terror|scream|fear|afraid|collapse|crumble|horror)\b/i, 'despair'],
    [/\b(hide|cower|shake|tremble)\b/i, 'cower'],
    [/\b(cry|alone|lonely|lost|failed|failure|quit|give up|gave up|exhaust|tired|broke|broken|defeat)\b/i, 'sit_hug'],
    [/\b(blame|accuse|you are|you're|nobody|no one|lazy|wrong|liar|lie)\b/i, 'point'],
    [/\b(carry|burden|weight|load|heavy|debt)\b/i, 'carry'],
    [/\b(look|wonder|sky|stars|dream of|imagine|hope|future)\b/i, 'look_up'],
    [/\b(kneel|pray|beg|beg for)\b/i, 'kneel'],
    [/\b(slow|worse|drop|sink|fall|decline|empty|numb)\b/i, 'slump'],
  ],
  props: [
    [/\b(\d+\s*(?:days?|weeks?|months?)|every day|each day|daily|streak|calendar)\b/i, 'calendar'],
    [/\b(alarm|5\s?a\.?m\.?|wake up|snooze)\b/i, 'alarm_clock'],
    [/\b(hour|hours|minutes|clock|deadline|countdown|timer|late|time runs)\b/i, 'wall_clock'],
    [/\b(sand|time is|running out|years|decades|waiting)\b/i, 'hourglass'],
    [/\b(money|cost|price|prices|debt|billion|million|dollar|cash|rent|paid|pay|wage|profit|tax)\b/i, 'coins'],
    [/(\b(growth|decline|percent|market|economy|data|chart|rate|inflation|collapse of|crash|fell|fall|fallen|drop|dropped|rose|rise|surge|plunge|plunged|doubled|tripled|halved)\b|%)/i, 'chart_up'],
    [/\b(machine|system|mechanism|engine|process|gears?|factory)\b/i, 'gears'],
    [/\b(energy|battery|drain|drained|fatigue|burn out|burnout|power)\b/i, 'battery'],
    [/\b(lock|locked|secret|trapped|prison|security|cage|sealed)\b/i, 'lock'],
    [/\b(fire|burn|burning|flame|heat|war|ignite)\b/i, 'flame'],
    [/\b(trophy|champion|medal|prize|gold)\b/i, 'trophy'],
    [/\b(map|location|where|capital|border|territory)\b/i, 'pin'],
    [/\b(wall|barrier|obstacle|block|blocked|stuck|fence|gate)\b/i, 'wall'],
    [/\b(balance|justice|law|trade-?off|weigh|choice|decide|decision)\b/i, 'scales'],
    [/\b(cargo|shipment|supply|box|crate|goods|container)\b/i, 'crate'],
    [/\b(mirror|reflection|yourself|identity|who you are)\b/i, 'mirror'],
    [/\b(door|exit|opportunity|escape|way out|open)\b/i, 'door'],
    [/\b(flag|nation|country|republic|kingdom)\b/i, 'flag'],
    [/\b(laptop|computer|online|internet|software|app)\b/i, 'laptop'],
    [/\b(coffee|tea|cup|drink)\b/i, 'cup'],
    [/\b(bag|punching)\b/i, 'bag'],
  ],
  fx: [
    [/\b(rain|storm|flood)\b/i, 'rain'],
    [/\b(run|ran|chase|sprint|rush|fast|speed)\b/i, 'speed'],
    [/\b(punch|punched|strike|crash|impact|explod|slam)\b/i, 'impact'],
    [/\b(fear|panic|sweat|strain|struggle|effort|pain|hard)\b/i, 'sweat'],
    [/\b(fire|burn|ash|war|ember|ignite)\b/i, 'embers'],
  ],
  face: [
    [/\b(panic|terror|scream|afraid|fear|horror)\b/i, 'scared'],
    [/\b(angry|rage|fight|refuse|never|punch)\b/i, 'anger'],
    [/\b(pain|struggle|strain|effort|heavy|hard)\b/i, 'strain'],
    [/\b(sleep|asleep|dream)\b/i, 'asleep'],
    [/\b(proud|win|won|finally|made it|smile|joy)\b/i, 'proud'],
    [/\b(sad|lonely|alone|lost|cry|failed|quit|broke)\b/i, 'sad'],
    [/\b(shock|suddenly|wait|what|impossible|surprise)\b/i, 'shock'],
    [/\b(tired|exhaust|late|again|another)\b/i, 'tired'],
  ],
};
const firstMatch = (list, text) => { for (const [re, v] of list) if (re.test(text)) return v; return ''; };
const allMatches = (list, text, max) => { const out = []; for (const [re, v] of list) if (re.test(text) && !out.includes(v)) { out.push(v); if (out.length >= max) break; } return out; };

export function sceneFromText(text, o = {}) {
  const t = String(text || '');
  const r = seededRandom(`auto:${o.seed || 'x'}:${o.index || 0}`);
  const env = firstMatch(RULES.env, t) || pick(r, ['kitchen', 'rooftop', 'busstop', 'library', 'desk', 'street', 'room']);
  let poseRule = firstMatch(RULES.pose, t);
  const pose = poseRule || pick(r, ['stand', 'slump', 'look_up', 'walk']);
  const propNames = allMatches(RULES.props, t, 2);
  const props = propNames.map((p) => {
    if (p === 'calendar') { const m = t.match(/(\d{1,3})\s*(?:days?|weeks?|months?)/i); return m ? `calendar:${Math.min(35, Number(m[1]))}` : 'calendar:12'; }
    if (p === 'chart_up') return /(fall|fell|fallen|drop|decline|crash|collapse|shrink|lost|plunge|halved)/i.test(t) ? 'chart_up:down' : 'chart_up:up';
    if (p === 'alarm_clock') return 'alarm_clock:5:00';
    return p;
  });
  const sentences = t.replace(/\b([ap])\.m\./gi, '$1m').replace(/\s+/g, ' ').split(/(?<=[.!?])\s+/).filter(Boolean);
  const line = sentences.find((s) => words(s).length >= 3 && words(s).length <= 10) || '';
  const time = env === 'summit' ? 'dawn' : env === 'void' ? 'void' : (/\b(dawn|morning|sunrise|wake)\b/i.test(t) ? 'dawn' : /\b(evening|dusk|sunset)\b/i.test(t) ? 'dusk' : 'night');
  return normalizeScene({
    env, time, pose, face: firstMatch(RULES.face, t), props, fx: allMatches(RULES.fx, t, 1), line: o.noLine ? '' : line,
    facing: r() < 0.82 ? 'right' : 'left', shadow: /\b(nobody|no one|lazy|you can'?t|voice|doubt|critic)\b/i.test(t),
  }, { seed: o.seed, index: o.index, fallbackEnv: env, avoid: o.avoid });
}

// The scene used when a render comes back blank or broken: always drawable, still on-topic by env.
export function safeScene(spec, o = {}) {
  return normalizeScene({ env: spec?.env, time: spec?.time, pose: 'stand', face: 'tired', props: [], line: spec?.line, tag: spec?.tag, cam: 'push' }, { seed: o.seed, index: 7001, keepEnv: true });
}

export function titleScene(title, kit, o = {}) {
  return normalizeScene({ env: 'void', time: 'void', pose: 'none', title, props: [], cam: 'push', say: '' }, { seed: o.seed, keepEnv: true });
}

// ---------- variety: no two neighbouring frames may look alike ----------
const POSE_ALT = {
  stand: ['look_up', 'slump', 'point'], slump: ['sit_hug', 'stand', 'kneel'], look_up: ['stand', 'victory'], walk: ['run', 'stand'], run: ['walk', 'climb'],
  sit_hug: ['slump', 'kneel'], point: ['stand', 'cower'], phone: ['sit_phone', 'slump'], victory: ['look_up', 'stand'], punch: ['stand', 'point'], carry: ['walk', 'slump'],
};
const signature = (s) => `${s.env}|${s.pose}|${s.facing}|${(s.props || []).join(',')}`;

export function varyScenes(scenes, seed) {
  const r = seededRandom(`vary:${seed}`);
  let streak = 1;
  for (let i = 1; i < scenes.length; i++) {
    const a = scenes[i - 1]; const b = scenes[i];
    if (!a || !b || b.pose === 'none' || a.pose === 'none') { streak = 1; continue; }
    if (signature(a) === signature(b)) {
      const alts = (POSE_ALT[b.pose] || ['stand']).filter((p) => p !== b.pose && VOCAB.pose.includes(p));
      if (b.env === a.env && !(NEEDS[alts[0]] && !NEEDS[alts[0]].includes(b.env))) b.pose = alts[Math.floor(r() * alts.length)] || b.pose;
      else b.facing = a.facing === 'left' ? 'right' : 'left';
    }
    if (a.env === b.env) streak += 1; else streak = 1;
    if (streak >= 3) { b.time = b.time === 'night' ? 'dawn' : b.time === 'dawn' ? 'dusk' : 'night'; b.cam = b.cam === a.cam ? VOCAB.cam[(VOCAB.cam.indexOf(b.cam) + 2) % 5] : b.cam; streak = 1; }
    if (b.cam === a.cam && b.cam !== 'static') b.cam = a.cam === 'push' ? 'pull' : 'push';
  }
  return scenes;
}

// One scene may span several shots; later parts continue the action instead of repeating it.
const PART_CAMS = ['push', 'pan_right', 'pull', 'pan_left'];
export function partSpec(spec, i, n) {
  if (n <= 1 || i === 0) return spec;
  const out = { ...spec, variant: 'b', title: i > 0 ? '' : spec.title, tag: spec.tag, say: '', line: i % 2 ? spec.line : '', shadow: spec.shadow };
  if (spec.pose_to) { out.pose = spec.pose_to; out.pose_to = ''; out.face = spec.face_to || spec.face; out.face_to = ''; }
  out.cam = PART_CAMS[(PART_CAMS.indexOf(spec.cam) + i) % PART_CAMS.length] || 'push';
  if (i % 2) out.at = spec.at === 'right' ? 'center' : 'right';
  return out;
}

// ---------- set-ups: framings that come back, so a loop of failure can be answered by a loop of work ----------
export const SETUP_NAMES = ['bed_alarm', 'alarm_slam', 'couch_phone', 'desk', 'fridge', 'street', 'bag', 'pushups', 'calendar', 'mirror', 'stairs', 'summit', 'hug'];
const SETUPS = {
  bed_alarm: (st) => ({ env: 'room', time: 'night', pose: 'lie_bed', ...(st !== 'low' ? { pose_to: 'sit_bed', pose_at: 0.62, face_to: 'smirk' } : {}), face: st !== 'low' ? 'anger' : 'sad', props: ['alarm_clock:5:00'], zoom: 'mid', cam: 'static' }),
  alarm_slam: () => ({ slam: true, cam: 'static' }),
  couch_phone: (st, i) => (st !== 'low' ? SETUPS.desk(st, i) : { env: 'living', time: 'night', pose: 'sit_phone', face: 'empty', zoom: 'mid', cam: 'push' }),
  desk: (st) => (st !== 'low' ? { env: 'desk', time: 'night', pose: 'type', face: 'strain', props: ['laptop', 'books'], cam: 'push' } : { env: 'desk', time: 'night', pose: 'slump_desk', face: 'asleep', props: ['books'], cam: 'push' }),
  fridge: (st) => ({ env: 'kitchen', time: 'night', pose: 'stand', face: st !== 'low' ? 'smirk' : 'tired', facing: 'left', zoom: 'mid', cam: 'static' }),
  street: (st, i) => (st !== 'low' ? { env: 'street', time: i % 2 ? 'dusk' : 'night', pose: 'run', face: 'anger', fx: i % 2 ? ['speed'] : ['speed', 'rain'], cam: 'static' } : { env: 'street', time: 'night', pose: 'walk', face: 'tired', cam: 'static' }),
  bag: () => ({ env: 'gym', time: 'night', pose: 'punch', face: 'anger', props: ['bag'], fx: ['letters'], line: 'tomorrow', cam: 'static' }),
  pushups: () => ({ env: 'gym', time: 'night', pose: 'pushup', face: 'strain', fx: ['sweat'], cam: 'low' }),
  calendar: (st, i, extra) => ({ env: 'void', time: 'void', pose: 'none', props: [`calendar:${Math.min(35, Math.max(1, Number(extra?.count) || 12))}`], cam: 'push' }),
  mirror: (st) => ({ env: 'void', time: 'void', pose: 'stand', face: st !== 'low' ? 'anger' : 'sad', props: ['mirror'], cam: 'push' }),
  stairs: () => ({ env: 'stairs', time: 'dusk', pose: 'climb', face: 'strain', fx: ['sweat'], cam: 'pan_right' }),
  summit: () => ({ env: 'summit', time: 'dawn', pose: 'victory', face: 'proud', cam: 'pull' }),
  hug: () => ({ env: 'void', time: 'void', pose: 'sit_hug', face: 'sad', cam: 'push' }),
};

// Turns the director's montage list into drawable scenes. Tags climb on their own when not given.
export function montageSpecs(items, o = {}) {
  const list = (Array.isArray(items) ? items : []).filter((it) => it && SETUPS[it.setup]).slice(0, 12);
  return list.map((it, i) => {
    const state = it.state === 'up' ? 'up' : it.state === 'hype' ? 'hype' : 'low';
    const tag = it.tag || `DAY ${Math.max(1, Math.round(365 ** ((i + 1) / list.length)))}`;
    return normalizeScene({ ...SETUPS[it.setup](state, i, it), tag, meter: it.meter, resolved: state === 'up', awake: state !== 'low', face: it.face || SETUPS[it.setup](state, i, it).face, montage_item: true }, { seed: o.seed, index: (o.index || 0) + i, keepEnv: true });
  });
}

// What the visual director is told: the closed vocabulary, rendered once from VOCAB.
export function vocabText() {
  return `env: ${VOCAB.env.join(' | ')}
time: ${VOCAB.time.join(' | ')}
pose: ${VOCAB.pose.filter((p) => p !== 'none').join(' | ')}
face: ${VOCAB.face.join(' | ')}
props (max 3; some take an argument): ${VOCAB.prop.map((p) => (PROP_ARG[p] ? `${p}:<${p === 'chart_up' ? 'up|down' : p === 'battery' ? 'percent' : p === 'calendar' ? 'crossed days' : 'H:MM'}>` : p)).join(' | ')}
hold (item in the hand): ${VOCAB.hold.join(' | ')}
fx (max 2): ${VOCAB.fx.join(' | ')}
cam: ${VOCAB.cam.join(' | ')}
zoom: ${VOCAB.zoom.join(' | ')} (mid and close push in on the figure; use close for a face)
meter: optional "LABEL:percent" such as MOTIVATION:55, the one running number of the film (same label every time, the bar glides between scenes)`;
}

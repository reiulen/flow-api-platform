import { z } from 'zod';
import { CONFIDENCE, DENSITIES, MODES, PURPOSES, TONES, Outline, Research, Script, Topics } from '../contracts.js';
import { houseRules, outlinePrompt, researchExtractPrompt, researchPrompt, scriptActPrompt, scriptEditPrompt, topicsPrompt } from '../prompts.js';
import { actTargets } from '../style.js';
import { countWords, nowIso, round, stripMarkup } from '../util.js';

// ---------- S0 topics (global, not per project) ----------

const TopicsOut = z.object({
  candidates: z.array(z.object({
    title: z.string(), central_question: z.string(), angle: z.string(),
    scores: z.object({ contradiction: z.number(), mechanism: z.number(), footage: z.number(), sources: z.number(), relevance: z.number(), visualization: z.number(), risk: z.number(), hype: z.number() }),
    footage_query: z.string(), footage_evidence: z.array(z.string()), key_sources: z.array(z.string()), risks: z.array(z.string()),
  })),
});

// An angle that walks through attacking something gets refused downstream and is off-brand anyway;
// such a topic is scored as risky so the automatic pick passes it over.
const ATTACK_ANGLE = /kill[- ]?chains?|find,? fix,? (and )?track|track(ing)?,? (and )?target(ing)?|targeting (data|cycle|solution)|guidance (system|seeker)s?|seekers?\b|how\b[\w\s'-]{0,40}?\b(to|could|would|can|might) (defeat|evade|sink|shoot down|penetrate|jam|spoof|blind)|weak (spot|point)s? to exploit/i;
export function attackAngle(text) {
  const m = String(text || '').match(ATTACK_ANGLE);
  return m ? m[0] : '';
}

export function topicTotal(s) {
  return s.contradiction * 2 + s.mechanism * 1.5 + s.footage * 2 + s.sources * 1.5 + s.relevance + s.visualization + (s.hype ?? 3) * 2.5 - s.risk * 1.5;
}

// Models write searches like 'DVIDS: "F-35 takeoff" OR "F-35B landing"'; archives take plain keywords.
export function footageQueries(raw) {
  return raw.replace(/^[^:"]{1,40}:\s*/, '').split(/\s+OR\s+|\s*[;|]\s*/i)
    .map((q) => q.replace(/["“”']/g, '').replace(/\s+/g, ' ').trim()).filter(Boolean).slice(0, 3);
}

// Best result count over the query's alternatives.
export async function probeFootage(footageProbe, raw) {
  let best = { query: raw, found: null };
  for (const query of footageQueries(raw)) {
    const found = await footageProbe(query).catch(() => null);
    if (found != null && (best.found == null || found > best.found)) best = { query, found };
  }
  return best;
}

export async function scoutTopics({ llm, style, genre, count = 8, exclude = [], seedIdeas = '', footageProbe }) {
  const out = await llm.json({
    stage: 'topics', schema: TopicsOut, system: houseRules(style),
    prompt: topicsPrompt({ genre, count, exclude, seedIdeas }),
  });
  const candidates = [];
  for (const [i, c] of out.candidates.entries()) {
    const scores = { ...c.scores };
    const evidence = [...c.footage_evidence];
    if (footageProbe) {
      const { query, found } = await probeFootage(footageProbe, c.footage_query);
      if (found != null) {
        evidence.unshift(`archive probe "${query}": ${found} results`);
        if (found === 0) scores.footage = Math.min(scores.footage, 1);
        else if (found < 10) scores.footage = Math.min(scores.footage, 3);
      }
    }
    const attack = attackAngle(`${c.title} ${c.central_question} ${c.angle}`);
    if (attack) {
      scores.risk = Math.max(scores.risk, 4);
      c.risks = [...c.risks, `angle walks through an attack ("${attack}"); reframe around geography, money and decisions`];
    }
    candidates.push({
      topic_id: `T-${String(i + 1).padStart(3, '0')}`, title: c.title, central_question: c.central_question, angle: c.angle,
      scores, footage_evidence: evidence, key_sources: c.key_sources, risks: c.risks, total: round(topicTotal(scores), 2),
    });
  }
  candidates.sort((a, b) => b.total - a.total);
  return Topics.parse({ generated_at: nowIso(), genre, candidates });
}

// Automated G1: pick the best unused topic that clears the footage bar (or history illustration bar).
export function pickTopic(topics, used = []) {
  const isIllustrated = ['ancient_history', 'frontier_logistics', 'forensic_engineering', 'survival_physiology', 'shadow_economics', 'fitness_essay'].includes(topics.genre) || topics.genre?.includes('history');
  const usedSet = new Set(used.map((t) => t.toLowerCase()));
  const minFootage = isIllustrated ? 1 : 3;
  const usable = topics.candidates.filter((c) => !usedSet.has(c.title.toLowerCase()) && c.scores.footage >= minFootage && c.scores.risk <= 3);
  // High click appeal first; a lower-hype topic only when nothing else clears the bars.
  return usable.find((c) => (c.scores.hype ?? 3) >= 4) || usable[0] || null;
}

// ---------- S1 research ----------

const ResearchOut = z.object({
  sources: z.array(z.object({ source_id: z.string(), tier: z.number().int(), title: z.string(), publisher: z.string(), url: z.string(), date: z.string() })),
  claims: z.array(z.object({ claim_id: z.string(), text: z.string(), sources: z.array(z.string()), confidence: z.enum(CONFIDENCE), context: z.string(), conflicts: z.array(z.string()) })),
  chronology: z.array(z.object({ date: z.string(), event: z.string(), sources: z.array(z.string()) })),
  open_questions: z.array(z.string()),
  visual_leads: z.array(z.string()),
});

export async function runResearch({ llm, style, brief, config }) {
  const system = houseRules(style);
  const { text, sources } = await llm.research({ stage: 'research', system, prompt: researchPrompt({ brief }), maxSearches: config.llm.researchMaxSearches });
  const out = await llm.json({ stage: 'research', schema: ResearchOut, system, prompt: researchExtractPrompt({ brief, notes: text, sources }), maxTokens: 64000 });
  // Only URLs the search actually returned count; anything else was written from memory.
  const found = new Set(sources.map((s) => normalizeUrl(s.url)));
  const research = Research.parse({
    ...out,
    sources: out.sources.map((s) => ({
      ...s,
      accessed: nowIso().slice(0, 10),
      notes: isUrl(s.url) && !found.has(normalizeUrl(s.url)) ? `not found by search; ${s.notes || ''}`.trim() : s.notes,
    })),
  });
  return { research: lintResearch(research), notes: text };
}

const isUrl = (url) => /^https?:\/\/[^\s/]+\.[^\s]+/.test(url || '');
const normalizeUrl = (url) => (url || '').trim().replace(/^https?:\/\/(www\.)?/, '').replace(/[#?].*$/, '').replace(/\/+$/, '').toLowerCase();

// A claim is usable only when it cites at least one tier 1-3 source that has a real URL and was not
// flagged as unverified. Research written from memory (empty URLs, invented URLs) fails here.
export function lintResearch(research) {
  const usable = new Map(research.sources
    .filter((s) => isUrl(s.url) && !/^not found by search/.test(s.notes || ''))
    .map((s) => [s.source_id, s.tier]));
  const claims = research.claims
    .map((c) => ({ ...c, sources: c.sources.filter((id) => usable.has(id)) }))
    .filter((c) => c.sources.length && c.sources.some((id) => usable.get(id) <= 3));
  if (claims.length < 15) {
    const unverified = research.sources.length - usable.size;
    throw new Error(`research: only ${claims.length} claims backed by verified sources (need >= 15); ${unverified} of ${research.sources.length} sources have no URL or were not found by web search. Is web search working?`);
  }
  return { ...research, claims };
}

// ---------- S2 outline ----------

const OutlineOut = z.object({
  title: z.string(), central_question: z.string(), answer: z.string(),
  acts: z.array(z.object({
    act: z.number().int(), name: z.string(), target_s: z.number(), goal: z.string(), exit_tension: z.string(),
    beats: z.array(z.object({ beat_id: z.string(), summary: z.string(), claims: z.array(z.string()), mode: z.enum(MODES) })),
  })),
});

export async function runOutline({ llm, style, brief, research }) {
  const totalSeconds = brief.target_duration_min * 60;
  const acts = actTargets(style, totalSeconds);
  const out = await llm.json({ stage: 'outline', schema: OutlineOut, system: houseRules(style), prompt: outlinePrompt({ brief, research, acts, totalSeconds }) });
  const known = new Set(research.claims.map((c) => c.claim_id));
  const fixed = {
    ...out,
    acts: acts.map((a) => {
      const got = out.acts.find((x) => x.act === a.act);
      if (!got) throw new Error(`outline: act ${a.act} missing`);
      return { ...got, name: a.name, target_s: a.target_s, beats: got.beats.map((b) => ({ ...b, claims: b.claims.filter((c) => known.has(c)) })) };
    }),
  };
  return Outline.parse(fixed);
}

// ---------- S3 script ----------

const SegmentOut = z.object({
  seg_id: z.string(), beat_id: z.string(), text: z.string(), claims: z.array(z.string()),
  tone: z.enum(TONES), purpose: z.enum(PURPOSES), density: z.enum(DENSITIES), mode: z.enum(MODES),
  pron: z.array(z.object({ word: z.string(), say: z.string() })),
  stats: z.array(z.object({ value: z.string(), label: z.string(), claim_id: z.string() })),
});
const ActOut = z.object({ segments: z.array(SegmentOut) });

export function scriptWordBudget(style, brief) {
  const minutes = brief.target_duration_min;
  const share = (style.narration.speech_share[0] + style.narration.speech_share[1]) / 2;
  return Math.round(minutes * style.narration.wpm * share);
}

// checkpoint: { get(act) -> segments | null, set(act, segments) } keeps finished acts across a retry.
export async function runScript({ llm, style, brief, research, outline, maxAttempts = 3, checkpoint = null }) {
  const total = scriptWordBudget(style, brief);
  const segments = [];
  for (const act of style.acts) {
    const budget = Math.round(total * act.share);
    const saved = checkpoint?.get(act.act);
    if (saved) { segments.push(...saved); continue; }
    const previousText = segments.map((s) => stripMarkup(s.text)).join(' ').split(/\s+/).slice(-900).join(' ');
    let feedback = '';
    let accepted;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const out = await llm.json({
        stage: 'script', schema: ActOut, system: houseRules(style),
        prompt: scriptActPrompt({ brief, outline, act, wordBudget: budget, previousText, research }) + feedback,
      });
      const actSegments = out.segments.map((s, i) => ({ ...s, act: act.act, seg_id: `S-${String(act.act).padStart(2, '0')}-${String(i + 1).padStart(2, '0')}` }));
      const problems = lintAct(actSegments, { style, research, budget, actNo: act.act });
      accepted = actSegments;
      if (!problems.length) break;
      if (attempt === maxAttempts) {
        const hard = problems.filter((p) => p.hard);
        if (hard.length) throw new Error(`script act ${act.act}: ${hard.map((p) => p.msg).join('; ')}`);
        break;
      }
      feedback = `\n\nYour previous attempt was rejected by the automated editor for these reasons. Rewrite the whole act fixing all of them:\n${problems.map((p) => `- ${p.msg}`).join('\n')}`;
    }
    segments.push(...accepted);
    checkpoint?.set(act.act, accepted);
  }
  const words = segments.reduce((n, s) => n + countWords(s.text), 0);
  return Script.parse({ version: 1, title: outline.title, words, est_duration_s: Math.round((words / style.narration.wpm) * 60), segments });
}

// ---------- S3b whole-script edit ----------

const EditOut = z.object({
  edits: z.array(z.object({ seg_id: z.string(), text: z.string(), reason: z.string().default('') })).default([]),
  notes: z.array(z.string()).default([]),
});

const numbersIn = (t) => (stripMarkup(t).match(/\d[\d,.]*\d|\d/g) || []).map((n) => n.replace(/,/g, '').replace(/\.$/, ''));
// Capitalized words that are not the first word of a sentence: names, programs, places.
const namesIn = (t) => {
  const out = [];
  for (const sentence of stripMarkup(t).split(/(?<=[.?!:;—])\s+/)) {
    sentence.split(/\s+/).slice(1).forEach((w) => { const m = w.match(/^["'(]?([A-Z][A-Za-z0-9-]+)/); if (m && !/^(I|I'm|I've|I'd)$/.test(m[1])) out.push(m[1]); });
  }
  return out;
};

// One editor pass over the finished script. Edits that add facts, numbers or names, break the
// markup or length rules, or make an act fail its lint are dropped; the rest are applied.
export async function runScriptEdit({ llm, style, brief, research, outline, script, maxEdits = 30 }) {
  const out = await llm.json({ stage: 'script_edit', schema: EditOut, system: houseRules(style), prompt: scriptEditPrompt({ outline, script, research, maxEdits }) });
  const byId = new Map(script.segments.map((x) => [x.seg_id, x]));
  const claimText = new Map(research.claims.map((c) => [c.claim_id, c.text]));
  const applied = [];
  const rejected = [];
  const next = new Map();
  for (const e of out.edits.slice(0, maxEdits)) {
    const seg = byId.get(e.seg_id);
    const why = (() => {
      if (!seg) return 'unknown segment';
      if (next.has(e.seg_id)) return 'edited twice';
      const text = e.text.trim();
      if (!text || text === seg.text) return 'no change';
      const lower = stripMarkup(text).toLowerCase();
      const banned = style.narration.banned_phrases.find((b) => lower.includes(b));
      if (banned) return `banned phrase "${banned}"`;
      const words = countWords(text);
      if (words > 60) return `${words} words`;
      if (Math.abs(words - countWords(seg.text)) > Math.max(6, countWords(seg.text) * 0.35)) return 'length changed too much';
      if (/\[(?!PAUSE \d(\.\d+)?\]|BEAT\]|TONE: (quiet|normal|firm)\])[^\]]*\]/.test(text)) return 'invalid markup';
      const allowedNums = new Set([...numbersIn(seg.text), ...seg.claims.flatMap((c) => numbersIn(claimText.get(c) || ''))]);
      const newNum = numbersIn(text).find((n) => !allowedNums.has(n));
      if (newNum) return `new number ${newNum}`;
      const allowedNames = new Set([...namesIn(seg.text), ...seg.claims.flatMap((c) => stripMarkup(claimText.get(c) || '').split(/\s+/).map((w) => w.replace(/[^A-Za-z0-9-]/g, ''))), ...outline.title.split(/\s+/).map((w) => w.replace(/[^A-Za-z0-9-]/g, ''))]);
      const newName = namesIn(text).find((n) => !allowedNames.has(n));
      if (newName) return `new name ${newName}`;
      return '';
    })();
    if (why) { rejected.push({ seg_id: e.seg_id, why }); continue; }
    next.set(e.seg_id, { ...seg, text: e.text.trim() });
    applied.push({ seg_id: e.seg_id, reason: e.reason, before: seg.text, after: e.text.trim() });
  }
  // An act whose edits introduce lint problems keeps its original text.
  const total = scriptWordBudget(style, brief);
  for (const act of style.acts) {
    const ids = applied.filter((a) => byId.get(a.seg_id).act === act.act).map((a) => a.seg_id);
    if (!ids.length) continue;
    const lintOf = (segs) => lintAct(segs, { style, research, budget: Math.round(total * act.share), actNo: act.act });
    const before = lintOf(script.segments.filter((x) => x.act === act.act));
    const after = lintOf(script.segments.filter((x) => x.act === act.act).map((x) => next.get(x.seg_id) || x));
    // Only problems the edits introduce count (the same kind of problem, numbers aside).
    const kind = (p) => p.msg.replace(/\d+/g, '#');
    const had = new Set(before.map(kind));
    const introduced = after.filter((p) => !had.has(kind(p)));
    if (introduced.length || after.length > before.length) {
      for (const id of ids) { next.delete(id); rejected.push({ seg_id: id, why: `act ${act.act} would fail lint: ${(introduced.length ? introduced : after).map((p) => p.msg).join('; ').slice(0, 200)}` }); }
    }
  }
  const segments = script.segments.map((x) => next.get(x.seg_id) || x);
  const words = segments.reduce((n, x) => n + countWords(x.text), 0);
  return {
    script: Script.parse({ ...script, version: (script.version || 1) + 1, words, est_duration_s: Math.round((words / style.narration.wpm) * 60), segments }),
    report: { applied: applied.filter((a) => next.has(a.seg_id)), rejected, notes: out.notes },
  };
}

const HEDGES = /\b(reportedly|according to|analysts (?:say|believe|report|estimate)|by (?:some|one|analysts'?) (?:estimates?|accounts?)|by estimate|figures vary|it is said|some sources|is said to)\b/gi;
// A spoken list: three or more comma-separated parts ending in "and"/"or", whose middle items are all
// short (a contrast like "X come off, and Y go on" or an appositive like ", or LRSO," is not a list).
export function isListLike(sentence) {
  const parts = sentence.trim().replace(/[.?!]$/, '').split(',').map((p) => p.trim()).filter(Boolean);
  // The last item opens with "and"/"or", or (no Oxford comma) carries it: "X, Y, Z and W".
  const lastJoins = /^(?:and|or)\s/i.test(parts.at(-1)) || (parts.length >= 4 && /\s(?:and|or)\s/i.test(parts.at(-1)) && parts.at(-1).split(/\s+/).length <= 7);
  if (parts.length < 3 || !lastJoins) return false;
  const middle = parts.slice(1, -1);
  const words = (p) => p.split(/\s+/).length;
  return middle.length >= 2 ? middle.every((p) => words(p) <= 5) : middle.length === 1 && parts.length >= 4;
}

export function lintAct(segments, { style, research, budget, actNo }) {
  const problems = [];
  const claimIds = new Set(research.claims.map((c) => c.claim_id));
  const words = segments.reduce((n, s) => n + countWords(s.text), 0);
  const isHistory = style.genre?.includes('history') || style.genre === 'ancient_history';
  const hardMin = isHistory ? budget * 0.45 : budget * 0.6;
  const hardMax = isHistory ? budget * 1.75 : budget * 1.5;
  if (words < budget * 0.85 || words > budget * 1.15) problems.push({ msg: `act has ${words} words, budget is ${budget} (±10%)`, hard: words < hardMin || words > hardMax });
  let infoRun = 0;
  let beats = 0;
  for (const s of segments) {
    const spoken = stripMarkup(s.text);
    const lower = spoken.toLowerCase();
    for (const phrase of style.narration.banned_phrases) if (lower.includes(phrase)) problems.push({ msg: `${s.seg_id} uses banned phrase "${phrase}"`, hard: true });
    if (countWords(s.text) > 60) problems.push({ msg: `${s.seg_id} is ${countWords(s.text)} words (max 55)` });
    const unknown = s.claims.filter((c) => !claimIds.has(c));
    if (unknown.length) problems.push({ msg: `${s.seg_id} cites unknown claims ${unknown.join(', ')}`, hard: true });
    if (/\d/.test(spoken) && !s.claims.length) problems.push({ msg: `${s.seg_id} states a number without citing a claim`, hard: true });
    for (const st of s.stats) if (!claimIds.has(st.claim_id)) problems.push({ msg: `${s.seg_id} stat card cites unknown claim ${st.claim_id}`, hard: true });
    const badMarkup = s.text.match(/\[(?!PAUSE \d(\.\d+)?\]|BEAT\]|TONE: (quiet|normal|firm)\])[^\]]*\]/g);
    if (badMarkup) problems.push({ msg: `${s.seg_id} has invalid markup ${badMarkup.join(' ')}` });
    beats += (s.text.match(/\[BEAT\]/g) || []).length;
    infoRun = s.purpose === 'I' ? infoRun + 1 : 0;
    if (infoRun > style.pacing.max_consecutive_info) problems.push({ msg: `more than ${style.pacing.max_consecutive_info} consecutive I segments ending at ${s.seg_id}` });
  }
  if (beats > 2) problems.push({ msg: `act uses ${beats} [BEAT] markers (max 2)` });
  // Narration that hedges every fact or reads lists sounds like a report, not a film.
  const spokenAll = segments.map((s) => stripMarkup(s.text)).join(' ');
  const hedges = spokenAll.match(HEDGES) || [];
  const hedgeBudget = Math.max(1, Math.ceil(words / 200));
  if (hedges.length > hedgeBudget) problems.push({ msg: `act uses ${hedges.length} hedge/attribution phrases (${[...new Set(hedges.map((h) => h.toLowerCase()))].join(', ')}); budget is ${hedgeBudget}. State sourced facts plainly; attribute by name only a party's claim, a forecast or a quote` });
  const lists = segments.flatMap((s) => stripMarkup(s.text).split(/(?<=[.?!])\s+/).filter(isListLike).map(() => s.seg_id));
  if (lists.length) problems.push({ msg: `${[...new Set(lists)].join(', ')} read(s) like a list; use one vivid example or two contrasting ones instead` });
  if (actNo === 1 && /^(today|in this|hey|welcome)/i.test(stripMarkup(segments[0]?.text || ''))) problems.push({ msg: 'act 1 opens with a greeting/announcement', hard: true });
  return problems;
}

import { z } from 'zod';
import { CONFIDENCE, DENSITIES, MODES, PURPOSES, TONES, Outline, Research, Script, Topics } from '../contracts.js';
import { houseRules, outlinePrompt, researchExtractPrompt, researchPrompt, scriptActPrompt, topicsPrompt } from '../prompts.js';
import { actTargets } from '../style.js';
import { countWords, nowIso, round, stripMarkup } from '../util.js';

// ---------- S0 topics (global, not per project) ----------

const TopicsOut = z.object({
  candidates: z.array(z.object({
    title: z.string(), central_question: z.string(), angle: z.string(),
    scores: z.object({ contradiction: z.number(), mechanism: z.number(), footage: z.number(), sources: z.number(), relevance: z.number(), visualization: z.number(), risk: z.number() }),
    footage_query: z.string(), footage_evidence: z.array(z.string()), key_sources: z.array(z.string()), risks: z.array(z.string()),
  })),
});

export function topicTotal(s) {
  return s.contradiction * 2 + s.mechanism * 1.5 + s.footage * 2 + s.sources * 1.5 + s.relevance + s.visualization - s.risk * 1.5;
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
      const found = await footageProbe(c.footage_query).catch(() => null);
      if (found != null) {
        evidence.unshift(`archive probe "${c.footage_query}": ${found} results`);
        if (found === 0) scores.footage = Math.min(scores.footage, 1);
        else if (found < 10) scores.footage = Math.min(scores.footage, 3);
      }
    }
    candidates.push({
      topic_id: `T-${String(i + 1).padStart(3, '0')}`, title: c.title, central_question: c.central_question, angle: c.angle,
      scores, footage_evidence: evidence, key_sources: c.key_sources, risks: c.risks, total: round(topicTotal(scores), 2),
    });
  }
  candidates.sort((a, b) => b.total - a.total);
  return Topics.parse({ generated_at: nowIso(), genre, candidates });
}

// Automated G1: pick the best unused topic that clears the footage bar.
export function pickTopic(topics, used = []) {
  const usedSet = new Set(used.map((t) => t.toLowerCase()));
  return topics.candidates.find((c) => !usedSet.has(c.title.toLowerCase()) && c.scores.footage >= 3 && c.scores.risk <= 3) || null;
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
  const out = await llm.json({ stage: 'research', schema: ResearchOut, system, prompt: researchExtractPrompt({ brief, notes: text, sources }) });
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

export async function runScript({ llm, style, brief, research, outline, maxAttempts = 3 }) {
  const total = scriptWordBudget(style, brief);
  const segments = [];
  for (const act of style.acts) {
    const budget = Math.round(total * act.share);
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
  }
  const words = segments.reduce((n, s) => n + countWords(s.text), 0);
  return Script.parse({ version: 1, title: outline.title, words, est_duration_s: Math.round((words / style.narration.wpm) * 60), segments });
}

export function lintAct(segments, { style, research, budget, actNo }) {
  const problems = [];
  const claimIds = new Set(research.claims.map((c) => c.claim_id));
  const words = segments.reduce((n, s) => n + countWords(s.text), 0);
  if (words < budget * 0.85 || words > budget * 1.15) problems.push({ msg: `act has ${words} words, budget is ${budget} (±10%)`, hard: words < budget * 0.6 || words > budget * 1.5 });
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
  if (actNo === 1 && /^(today|in this|hey|welcome)/i.test(stripMarkup(segments[0]?.text || ''))) problems.push({ msg: 'act 1 opens with a greeting/announcement', hard: true });
  return problems;
}

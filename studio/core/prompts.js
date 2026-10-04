// Compiled instructions for every LLM stage. The model receives everything it needs here:
// it never reads skills, bibles or code at generation time. Keep in sync with studio/bibles.

export function houseRules(style) {
  const ed = style.editorial || {};
  return `You work inside an automated documentary studio that produces long-form YouTube documentaries.
Channel style: ${style.style_name || 'Cinematic documentary'}.
Target: viewers feel they are watching a professional studio documentary, never an AI video that happens to be long.

Story principles
- The story decides the visuals, never the other way round.
- Every video answers ONE central question. Structure: question -> contradiction -> mechanism -> threat -> response -> limitation -> implication.
- Every act ends with a tension or question that pulls into the next act.
- Act 7 must address limitations. A documentary that admits no weakness reads like an advertisement.

Narration voice
- ${ed.voice || 'Calm, intelligent, confident documentary narrator. Never a salesman.'}
- Pattern: question -> contradiction -> explanation. One idea per sentence. Vary sentence length; short sentences carry emphasis.
- Round numbers in narration ("almost 1,100 feet"); precise numbers belong on screen cards.
- No unsourced superlatives ("most advanced", "unstoppable").
- Never use these phrases or close variants: ${style.narration.banned_phrases.map((p) => `"${p}"`).join(', ')}.
- Never open with a greeting or "today we will". Never end with thanks or subscribe requests.

Fact standards
- Source tiers: 1 = primary (government, military, manufacturer, official reports, legislative/procurement documents, technical papers); 2 = highly reputable media and research institutions (Reuters, AP, BBC, established defense/industry publications); 3 = analysis (think tanks, experts, specialist outlets); 4 = discovery only (forums, blogs, social media, video, wikis) and never the basis of a claim.
- Key numbers need one tier-1 source or two independent tier-2 sources.
- Confidence: confirmed (tier 1 or several agreeing tier 2) -> state plainly; reported (one tier 2) -> "reportedly", "according to"; estimated (tier 3 analysis) -> "estimated", "analysts believe"; disputed -> give both sides.
- Never invent a number, date, name or quote. If a fact is unknown, say so or leave it out.
${(ed.rules || []).map((r) => `- ${r}`).join('\n')}`;
}

export function topicsPrompt({ genre, count, exclude, seedIdeas, evidence }) {
  return `Propose ${count} documentary topics for the "${genre}" channel.

Each topic must be built around a contradiction or paradox that makes people curious, e.g. "Why X is still used even though everyone knows its weakness".
Title format: a question or a claim containing a contradiction ("Why Aircraft Carriers Are So Hard to Sink"), never a history title ("The History of the USS Nimitz").

Score each topic 1-5 on: contradiction, mechanism (a system that can be explained step by step), footage (amount of real, legally usable footage — government archives are best), sources (depth of tier 1-2 sources for 20+ minutes), relevance (timely or evergreen), visualization (something only a map or diagram makes clear), risk (misinformation, sensitivity, licensing; 5 = very risky).
footage_evidence: name the concrete archive search that supports the footage score (e.g. 'DVIDS: "carrier flight operations"'). Use the archive evidence below when present; do not claim counts you were not given.
key_sources: name real, specific primary documents or publications you are confident exist.

Do not propose any of these already-used topics:
${exclude.length ? exclude.map((t) => `- ${t}`).join('\n') : '- (none)'}
${seedIdeas ? `\nThe producer's seed ideas (prefer these directions):\n${seedIdeas}` : ''}
${evidence ? `\nArchive search evidence:\n${evidence}` : ''}`;
}

export function researchPrompt({ brief }) {
  return `Deep research for a ${brief.target_duration_min}-minute documentary.
Working title: ${brief.title_working}
Central question: ${brief.central_question}
Angle: ${brief.angle}

Research it thoroughly with web search and fetch. Prioritise tier-1 primary sources (official government, military, manufacturer, legislative and procurement documents, technical papers), then tier-2 reputable media and research institutions. Use tier-3 analysis for estimates and debates. Use tier 4 only to discover better sources.

Cover:
1. Scale and context: size, cost, quantities, ranges, key dates, history in brief.
2. Mechanism: how the system actually works, step by step, with the engineering details that make it work.
3. The system around it: the parts that work together.
4. Threats: what could defeat it and why.
5. Responses and countermeasures (concepts and principles; no operational instructions).
6. Limits, controversies, failures, open debates, what is changing.
7. Visual leads: specific real events, tests, exercises, ships, aircraft or programs that are likely filmed and published by official sources.

For every fact record the exact source URL, publisher, date, and whether sources disagree. Write up your findings as detailed notes organised by the seven areas, quoting the key numbers with their sources inline.`;
}

export function researchExtractPrompt({ brief, notes, sources }) {
  return `Turn these research notes into a structured research file for the documentary "${brief.title_working}".

Rules:
- sources: one entry per distinct source actually used. tier 1-4 per the tier definitions. Use the exact URLs from the notes or the source list. Never invent a URL.
- claims: every distinct factual statement the script might use (aim for 60-120). Each claim cites source_ids. confidence follows the fact standards. context explains caveats (e.g. "length overall; the older class is shorter"). conflicts lists contradicting figures with their sources.
- A claim with only tier-4 sources must be dropped.
- chronology: dated events in order.
- open_questions: what could not be verified.
- visual_leads: concrete filmable subjects/events for footage search (e.g. "USS Gerald R. Ford flight deck operations 2023").
- IDs: SRC-001.., C-001..

Research notes:
${notes}

Source list from the search tool:
${sources.map((s) => `- ${s.title || ''} ${s.url}`).join('\n')}`;
}

export function outlinePrompt({ brief, research, acts, totalSeconds }) {
  return `Design the story outline for "${brief.title_working}" (${Math.round(totalSeconds / 60)} minutes).
Central question: ${brief.central_question}

Use exactly these seven acts, in order, with these target durations:
${acts.map((a) => `Act ${a.act} ${a.name} (${a.target_s}s, dominant mode ${a.mode}): ${a.goal}`).join('\n')}

Rules:
- answer: the one-sentence resolution of the central question, delivered in act 7.
- Each act: 3-7 beats. A beat is one narrative step; it cites the claim_ids it relies on (only ids from the research).
- Beat mode: CINEMATIC (atmosphere, scale, tension, emotion, few words) or INFORMATION (explaining geography, systems, numbers, timelines).
- Act 1 opens on a cinematic mystery, states the contradiction, asks the central question, then shows visual proof.
- exit_tension: the question or tension that pulls the viewer into the next act (act 7: the final image/thought).
- title: final YouTube title, a question or contradiction, max 70 characters.

Research (claims):
${research.claims.map((c) => `${c.claim_id} [${c.confidence}] ${c.text}`).join('\n')}`;
}

export function scriptActPrompt({ brief, outline, act, wordBudget, previousText, research }) {
  const actOutline = outline.acts.find((a) => a.act === act.act);
  return `Write the narration for Act ${act.act} "${act.name}" of "${outline.title}".
Central question: ${outline.central_question}
Final answer (revealed only in act 7): ${outline.answer}
Word budget for this act: ${wordBudget} spoken words (stay within ±10%).

Beats for this act:
${actOutline.beats.map((b) => `${b.beat_id} [${b.mode}] ${b.summary} (claims: ${b.claims.join(', ') || '-'})`).join('\n')}
Exit tension: ${actOutline.exit_tension}

Output segments. A segment is 1-4 sentences (max 55 words) that belong to one beat and one visual idea.
For each segment:
- seg_id: S-${String(act.act).padStart(2, '0')}-01, S-${String(act.act).padStart(2, '0')}-02, ...
- text: the spoken narration with markup:
  [PAUSE 0.6] a pause in seconds (0.3-1.5) inside the segment, use 1-3 per minute of narration where a thought lands.
  [BEAT] a 2 second pause for the visuals/music to breathe, use after a key reveal (max 2 per act).
  *word* emphasis on a single word, sparingly.
- claims: claim_ids for every factual statement in the segment. A segment with numbers, dates, names of programs or specifications MUST cite claims. Only use claim_ids from the list below, and respect their confidence wording.
- tone: quiet (intimate, serious), normal, firm (key statement).
- purpose: E evidence, I information, C cinematic, T transition, R reset/breathing.
- density: low, medium, high (information per second).
- mode: CINEMATIC or INFORMATION.
- pron: pronunciation hints for unusual names (word -> phonetic).
- stats: at most one on-screen number card per segment, only for a key number: value (e.g. "$13 BILLION", "1,106 FT"), label (max 3 words, e.g. "CONSTRUCTION COST"), claim_id.

Rhythm rules: never more than 4 consecutive segments with purpose I; after about 90 seconds of high density add a C or R segment; vary density.
${act.act === 1 ? 'Act 1 starts after a cold open of pure visuals and sound: the first sentence lands in the middle of the mystery. Do not greet, do not announce the topic.' : ''}
${act.act === 7 ? 'Act 7 resolves the central question with the answer above, admits the limits, and ends on a short, quiet final line. No summary of the video, no thanks, no call to action.' : ''}

Narration so far (for continuity, do not repeat it):
${previousText || '(this is the first act)'}

Claims available:
${research.claims.map((c) => `${c.claim_id} [${c.confidence}] ${c.text}`).join('\n')}`;
}

export function visualPrompt({ style, act, segments, research }) {
  const types = `REAL: real operational footage from official archives (best evidence, preferred whenever it exists).
ARCHIVAL: historical footage or photos (development history, old generations, past decisions).
FLOW: generated cinematic reconstruction. Only when real footage cannot exist or is unavailable (e.g. a missile approaching a ship, an interior, a hypothetical). Never as evidence.
MAP: animated information map (geography, ranges, routes, zones, formations).
TECH: animated technical diagram (a process chain or comparison) explaining an invisible system.`;
  return `You are the visual director. Decide what the viewer sees under each narration segment of Act ${act.act} "${act.name}".
The editing engine will decide exact durations, cuts and transitions; you decide WHAT is shown and from which word.

Visual types:
${types}

Target share of screen time across the whole video: footage (REAL+ARCHIVAL) ${pct(style.visual_mix.footage)}, MAP+TECH ${pct(style.visual_mix.explainer)}, FLOW ${pct(style.visual_mix.flow)}.

Rules:
- Real footage beats generated footage whenever it is plausible that an official archive has it.
- Never just illustrate the noun being said. Show what the thing does or produces.
- Platform continuity: when narration names a class/variant/country, the need.platform must name exactly that.
- A segment with mode INFORMATION about geography, range, routes or numbers usually gets a MAP or TECH beat followed by REAL evidence beats.
- Alternate: explainer -> footage proving it -> explainer. Do not put two explainers back to back.
- CINEMATIC segments: REAL or FLOW, wide and atmospheric, few beats.
- 1-4 beats per segment. from_word is the 0-based index of the word (in the segment's word list) where the beat starts; the first beat starts at 0.

For each beat:
- visual_type
- need (for REAL, ARCHIVAL, FLOW): subject, platform (exact class/type or empty), action, mood[], era (decade or year if relevant), query_terms (3-6 short archive search phrases, most specific first, e.g. "USS Gerald R. Ford flight operations", "F/A-18 catapult launch").
- need is required for every beat. For MAP/TECH it describes the real footage that would prove the explainer (used if the explainer cannot be built).
- flow is required for every beat; for non-FLOW beats fill it with reconstruction false and empty strings/arrays.
- motion_json (for MAP or TECH; empty string otherwise) is a JSON string {"template": "...", "data": {...}} using these templates:
  map: { "title": "", "legend": [{"label":"HOUTHI CONTROLLED","role":"threat"}], "view": {"center":[lon,lat], "scale_from":4, "scale_to":5.5, "pitch":32}, "steps": [ step, ... ] }
       Rendered on graded satellite imagery with a slowly drifting, tilted 3D camera. scale: 1 = whole world, 4 = a region like the Middle East, 20 = a country like Yemen, 80+ = a city or strait.
       step types (2-8 steps, revealed in order, one per narrative idea):
         {"type":"label","lon":0,"lat":0,"text":"SAUDI ARABIA","role":"info"}   big plate naming a country or sea
         {"type":"point","lon":0,"lat":0,"label":"STRAIT OF HORMUZ","role":"threat","marker":"chokepoint|dot"}   chokepoint = glowing pulsing marker for critical places
         {"type":"highlight","countries":["Yemen"],"role":"threat","label":"","legend":"HOUTHI CONTROLLED"}
         {"type":"route","from":[lon,lat],"via":[[lon,lat],...],"to":[lon,lat],"label":"TO EUROPE","role":"friendly","icon":"ship|plane|missile"}   glowing line; via = waypoints so it follows real sea lanes/air paths, never across land for ships
         {"type":"pipeline","coords":[[lon,lat],...],"label":"EAST-WEST PIPELINE","role":"sensor"}   flowing dashed line for pipelines, cables, supply lines
         {"type":"ring","lon":0,"lat":0,"radius_km":400,"label":"400 KM","role":"sensor"}   range/coverage circle
         {"type":"zoom","center":[lon,lat],"scale":20}   camera move to a new area
       Coordinates must be accurate. Labels uppercase, max 3 words. Only label what the narration mentions. Colors carry meaning: threat red, friendly blue, sensor teal, warning amber.
  process: { "title": "", "steps": [ {"label":"DETECTION","detail":"max 5 words","role":"sensor"}, ... 3-6 steps ] }
  compare: { "title": "", "unit": "", "items": [ {"label":"","value":0,"role":"info"}, ... 2-5 items ] }   (values from claims only)
- flow (for FLOW): { "reconstruction": true if it depicts a specific real event/place/hardware, "composition": "", "camera": "", "lighting": "", "motion": "", "constraints": ["key hardware facts that must be visually correct"] }
- claims: claim_ids the beat visualises (for MAP/TECH numbers).

Narration segments (word lists are 0-indexed):
${segments.map((s) => `${s.seg_id} [${s.mode}/${s.purpose}/${s.density}] ${s.words.map((w, i) => `${i}:${w}`).join(' ')}`).join('\n')}

Claims:
${research.claims.map((c) => `${c.claim_id} ${c.text}`).join('\n')}`;
}

export function flowQcPrompt({ shot, constraints, hardwareChecklist }) {
  return `These are frames (start, middle, end) from a generated documentary shot.
Intended shot: ${shot.prompt_summary}
Hardware facts that must be correct:
${constraints.length ? constraints.map((c) => `- ${c}`).join('\n') : '- (none specified)'}

Check, strictly:
1. Hardware accuracy against the facts above and this checklist: ${hardwareChecklist}
2. Physics: objects deforming, merging, floating, impossible scale.
3. AI artifacts: garbled text or numbers, melting textures, broken hands/faces, flicker.
4. Style: too cinematic/blockbuster, oversaturated, exaggerated explosions or smoke, fake shaky camera, any text or HUD.
Verdict approved only if nothing would make a knowledgeable viewer doubt the shot. Use approved_with_trim when only the start or end is bad and give the usable fraction range.`;
}

export function reviewPrompt({ outline, script, shotSummary }) {
  return `You are the senior editor and the most critical viewer of this documentary. Review it before it is published.
Title: ${outline.title}
Central question: ${outline.central_question}
Intended answer: ${outline.answer}

Check:
- Pass 3 story: does the central question appear in the first 60 seconds and get answered in act 7? Does each act end with a pull into the next? Is there any stretch over 2 minutes without new information? Is anything boring, repetitive or padded?
- Pass 5 relevance: does each visual have a reason, does it avoid merely illustrating nouns, does each sequence progress?
- Pass 6 AI feel: cliches, generic phrasing, rhythm that sounds machine-written, visuals that look generic.
Report only real problems, each with the segment or time it applies to and how to fix it. Level blocker only for things that make the video unpublishable (false or unsupported claim, broken story, misleading visual).

Script:
${script.segments.map((s) => `${s.seg_id} (act ${s.act}, ${s.purpose}) ${s.text}`).join('\n')}

Shot plan summary:
${shotSummary}`;
}

const pct = ([a, b]) => `${Math.round(a * 100)}-${Math.round(b * 100)}%`;

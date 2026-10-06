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
- Pattern: question -> contradiction -> explanation. Vary sentence length: a long sentence that builds the chain of cause and effect, then a short one that lands it.
- Every key number gets a comparison that makes its scale felt: "more than 30 times over", "about 4% of the entire world's supply", "nearly double", "five times larger than Yemen's whole economy". A number without a sense of scale is wasted.
- Carry the logic with spoken connectors: "Now,", "But", "And then,", "Meanwhile,", "Indeed,", "Unfortunately for them, however,", "In the meantime,". Each paragraph should feel like the next step of one argument.
- Prefer vivid, concrete pictures over abstractions ("it would almost landlock them", "the engine of their economy grinding to a halt").
- Have a point of view where the evidence supports it, and say it plainly ("Geopolitically, this is a disaster for them."). A dry aside is allowed about once per act; never about casualties or suffering.
- First person sparingly, only to guide ("like I mentioned earlier").
- Round numbers when precision adds nothing ("almost 1,100 feet"); keep the exact figure when the precision is the point. Exact figures also go on screen cards.
- No unsourced superlatives ("most advanced", "unstoppable"); a superlative needs a claim behind it.
- Never use these phrases or close variants: ${style.narration.banned_phrases.map((p) => `"${p}"`).join(', ')}.
- Never open with a greeting or "today we will". Never end with thanks or subscribe requests.

Fact standards
- Source tiers: 1 = primary (government, military, manufacturer, official reports, legislative/procurement documents, technical papers); 2 = highly reputable media and research institutions (Reuters, AP, BBC, established defense/industry publications); 3 = analysis (think tanks, experts, specialist outlets); 4 = discovery only (forums, blogs, social media, video, wikis) and never the basis of a claim.
- Key numbers need one tier-1 source or two independent tier-2 sources.
- Confidence decides what you may claim, not how many hedge words you say. The sources are listed in the video description; the narration speaks plainly, like a confident explainer, not like a footnote.
  - confirmed and reported -> state it plainly. Never "reportedly" for an ordinary fact from a reputable outlet.
  - estimated -> a soft number word is enough: "around", "roughly", "nearly", "an estimated".
  - disputed -> use the best-sourced figure with "around", or, only when the disagreement matters to the story, say who claims what.
- Attribute by name, once, only when it adds meaning: a party's own claim ("the Pentagon says", "the Houthis claim"), a forecast or plan that may not happen, an official warning or quote. Never the vague "analysts say", "according to analysts", "figures vary by source", "by some estimates".
- Hedge budget: at most one hedge or attribution phrase per ~200 spoken words, and never two in one sentence.
- Never invent a number, date, name or quote. If a fact is unknown, say so or leave it out.
${(ed.rules || []).map((r) => `- ${r}`).join('\n')}`;
}

export function topicsPrompt({ genre, count, exclude, seedIdeas, evidence }) {
  return `Propose ${count} documentary topics for the "${genre}" channel.

Each topic must be built around a contradiction or paradox that makes people curious, e.g. "Why X is still used even though everyone knows its weakness".
Title format: a question or a claim containing a contradiction ("Why Aircraft Carriers Are So Hard to Sink"), never a history title ("The History of the USS Nimitz").

Score each topic 1-5 on: contradiction, mechanism (a system that can be explained step by step), footage (amount of real, legally usable footage — government archives are best), sources (depth of tier 1-2 sources for 20+ minutes), relevance (timely or evergreen), visualization (something only a map or diagram makes clear), risk (misinformation, sensitivity, licensing; 5 = very risky).
hype (click appeal right now: would a broad YouTube audience click this title over everything else on their home page? 5 = a famous system or conflict people are already searching for, huge stakes, a surprising number or reveal that begs to be shared; 1 = niche, only enthusiasts care). Favour topics tied to what people are talking about this year, without sensationalising: the title must still be true.
footage_query: 2-4 plain keywords for an archive search, e.g. F-35 takeoff. No archive name, no quotes, no OR.
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
Never read out a list. At most three items in one sentence; turn categories into one vivid example or two contrasting ones ("It can hit a bunker deep inside a country one night, and mine a shipping lane the next.").
For each segment:
- seg_id: S-${String(act.act).padStart(2, '0')}-01, S-${String(act.act).padStart(2, '0')}-02, ...
- text: the spoken narration with markup:
  [PAUSE 0.6] a pause in seconds (0.3-1.5) inside the segment, use 1-3 per minute of narration where a thought lands.
  [BEAT] a 2 second pause for the visuals/music to breathe, use after a key reveal (max 2 per act).
  *word* emphasis on a single word, sparingly.
- claims: claim_ids for every factual statement in the segment. A segment with numbers, dates, names of programs or specifications MUST cite claims. Only use claim_ids from the list below; the [confidence] tag decides what you may claim (see Fact standards), not how many hedge words you add.
- tone: quiet (intimate, serious), normal, firm (key statement).
- purpose: E evidence, I information, C cinematic, T transition, R reset/breathing.
- density: low, medium, high (information per second).
- mode: CINEMATIC or INFORMATION.
- pron: pronunciation hints for unusual names (word -> phonetic).
- stats: at most one on-screen number card per segment, only for a key number: value (e.g. "$13 BILLION", "1,106 FT"), label (max 3 words, e.g. "CONSTRUCTION COST"), claim_id.

Rhythm rules: never more than 4 consecutive segments with purpose I; after about 90 seconds of high density add a C or R segment; vary density.
${act.act === 1 ? `Act 1 starts after a cold open of pure visuals and sound. Do not greet, do not announce the topic. Hook formula:
  1. First sentence: the stakes, in the present, as strong as the claims allow (what is happening, to whom, how bad).
  2. Escalate: the second blow ("As if X wasn't enough, ... now ...").
  3. Make the worst case concrete with one physical picture of what it would mean.
  4. Then the contradiction and the central question, and promise the mechanism the film will explain.` : ''}
${act.act === 7 ? 'Act 7 resolves the central question with the answer above and admits the limits: lay out the options that remain and what each one costs. End on one short, plain-spoken line a viewer would repeat. No summary of the video, no thanks, no call to action.' : ''}

Narration so far (for continuity, do not repeat it):
${previousText || '(this is the first act)'}

Claims available:
${research.claims.map((c) => `${c.claim_id} [${c.confidence}] ${c.text}`).join('\n')}`;
}

// S3b: one editor pass over the whole script, after every act is written. Acts are written one
// after another; only here does anyone see the film as a whole.
export function scriptEditPrompt({ outline, script, research, maxEdits }) {
  const claimText = new Map(research.claims.map((c) => [c.claim_id, c.text]));
  const body = script.segments.map((s, i) => {
    const head = i === 0 || script.segments[i - 1].act !== s.act ? `\n## Act ${s.act} — ${outline.acts.find((a) => a.act === s.act)?.name || ''}\n` : '';
    return `${head}${s.seg_id} [${s.purpose}/${s.density}/${s.mode}] claims: ${s.claims.join(', ') || '-'}\n${s.text}`;
  }).join('\n');
  const used = [...new Set(script.segments.flatMap((s) => s.claims))];
  return `You are the story editor of a documentary. The narration below was written act by act; you are the first to read it as one film. Make it a film people watch to the end: a hook that grabs in the first seconds, momentum between acts, no repetition, and narration that sounds like a person talking, not a report being read.

Title: ${outline.title}
Central question: ${outline.central_question}
Answer (revealed in act 7): ${outline.answer}

Edit for, in this order:
1. Hook: the first segments must make the stakes concrete in the first sentence, escalate, open a question the viewer needs answered, and promise the film will answer it. No throat-clearing, no setup before the stakes.
2. Momentum: every act opens with a turn or a new question and ends with an open loop the next act pays off. Fix act openings that restart from zero and act endings that close everything.
3. Payoffs: every question or promise raised is answered later. If one is never paid, fix the segment that should pay it (or soften the promise).
4. Repetition: the same fact, number, image, phrase or sentence opening said twice anywhere in the film. Keep the stronger one, change the other.
5. Rhythm: three or more segments in a row with the same sentence shape, length or density. Vary them: a long sentence that builds, a short one that lands.
6. Spoken English: rewrite anything that reads like written prose: nested clauses, passive voice, noun piles, abbreviations a narrator would not say aloud. Use contractions where a person would.

Hard rules for every edited segment:
- Keep its meaning and its job in the film. Do not merge, split, add or remove segments; edit text only.
- Never add a number, date, name, quote or fact that is not already in that segment. You may only use facts from that segment's claims (listed with each segment, texts below).
- Keep the markup rules: [PAUSE 0.3-1.5], [BEAT] (max 2 per act), *emphasis*; max 55 words per segment; keep about the same length (±25%).
- Never use greetings, "in this video", calls to action, or the banned phrases from the house rules.
- At most ${maxEdits} edits. Change only what clearly improves the film; leave good segments alone.

Script:
${body}

Claim texts:
${used.map((id) => `${id}: ${claimText.get(id) || '?'}`).join('\n')}

Return {"edits":[{"seg_id":"S-01-01","text":"...","reason":"hook: stakes first"}],"notes":["one line per problem you saw but could not fix by editing text"]}.`;
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
         {"type":"callout","lon":0,"lat":0,"value":"-95%","label":"SAUDI OIL EXPORTS","role":"threat"}   a key number shown on the map next to the place it is about (value max 16 chars, from claims only)
         {"type":"icons","lon":0,"lat":0,"icon":"person|barrel|coin|ship|plane|tank|missile","count":20,"total":35,"label":"SAUDI POPULATION ~35 MILLION","value":"19.6M CITIZENS","role":"success"}   pictogram grid: count icons coloured out of total (max 60; one icon = a round unit you state in the label)
         {"type":"pie","lon":0,"lat":0,"percent":95,"value":"-95%","label":"SAUDI OIL EXPORTS","role":"threat"}   share of a whole, sweeping in
         {"type":"inset","center":[lon,lat],"scale":20,"position":"tl|tr|bl|br","highlight":["Cuba"],"label":"US STRIKE GROUP","role":"threat"}   boxed small map of another place (a second front, a distant base), in a corner away from the action
       highlight takes "hatch": true for recent gains, advances or contested ground (striped instead of solid).
       Put numbers on the map where the narration compares places: a callout, pie or icon grid next to the country it belongs to. All values from claims only.
       Coordinates must be accurate. Labels uppercase, max 3 words. Only label what the narration mentions. Colors carry meaning: threat red, friendly blue, sensor teal, warning amber.
  process: { "title": "", "steps": [ {"label":"DETECTION","detail":"max 5 words","role":"sensor"}, ... 3-6 steps ] }
  compare: { "title": "", "unit": "", "source": "publisher of the figures", "items": [ {"label":"","value":0,"role":"info"}, ... 2-5 items ] }   (values from claims only)
  trend: { "title": "SAUDI OIL PRODUCTION", "subtitle": "2023-PRESENT", "unit": "M BBL/DAY", "kind": "bar|line", "x": ["2023","2024",...], "series": [ {"label":"SAUDI ARABIA","role":"threat","values":[...one per x]} ], "annotation": {"at":"2026","text":"HORMUZ CLOSES"} or null, "source": "publisher" }
       a number changing over time; only when the claims give the values for every x. 1-3 series.
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

// S6a: plan the footage before anything is downloaded. Text metadata only.
export function assetPlanPrompt({ groups }) {
  const fmtDur = (d) => (d ? `${Math.floor(d / 60)}:${String(Math.round(d % 60)).padStart(2, '0')}` : '?');
  const blocks = groups.map((g) => {
    const lens = g.shots.map((s) => s.duration_s);
    const cands = g.candidates.map((x) => {
      const c = x.c;
      const meta = [`${c.source.toUpperCase()} ${c.kind}`, c.kind === 'video' ? fmtDur(c.duration_s) : '', c.year || '', c.height ? `${c.height}p` : ''].filter(Boolean).join(' · ');
      const desc = String(c.description || '').replace(/\s+/g, ' ').slice(0, 220);
      const tags = (c.tags || []).slice(0, 8).join(', ');
      return `${x.cid} | ${meta} | "${c.title}"${desc ? ` — ${desc}` : ''}${tags ? ` [tags: ${tags}]` : ''}`;
    }).join('\n');
    return `### ${g.id} — act ${g.act} · ${g.shots.length} shot(s) of ${Math.min(...lens).toFixed(1)}-${Math.max(...lens).toFixed(1)} s · pick up to ${g.wanted + 1} clip(s), best first
Narration here: "${g.narration}"
Visual need: subject "${g.need.subject}"; platform "${g.need.platform || 'any'}"; action "${g.need.action || '-'}"; era "${g.need.era || 'any'}"
Candidates:
${cands || '(none found by the first search)'}`;
  }).join('\n\n');
  return `You are the footage planner of a documentary. Nothing has been downloaded yet. Every download costs minutes and every clip you pick is later checked frame by frame, so pick only clips whose metadata shows they contain what each moment of the film needs. A wrong pick wastes time; an empty pick is better than a wrong one.

For each group below, choose the candidate clips to download, best first:
- Hardware accuracy first: the named platform (aircraft type, ship class, variant) must be stated in the title, description or tags. A different type, class or variant is never acceptable, even if it looks similar. With platform "any", the subject and action decide.
- Prefer raw B-roll of the actual activity (takeoff, launch, underway, refuelling, loading, maintenance, firing, flyover). Short clips (under about 5 minutes) usually hold the cleanest shots. Prefer HD and the right era when one is given.
- Avoid press briefings, interviews, speeches, ceremonies, award or promotion events, news packages and reports, highlight reels and compilations with titles and music, slideshows, animations and graphics (unless the need asks for them), and clips about something else that only mention the platform.
- One clip can hold several usable shots, so pick only as many as needed (up to the number shown). The same clip may be picked for several groups when it fits all of them.
- look_for: in a few words, which moment to cut from that clip for this narration (for example "wide takeoff, gear retracting").
- If no candidate fits, return picks [] and better_query: one precise archive search query of at most 6 words that would find the right footage (DVIDS, NASA, National Archives). Otherwise better_query "".

${blocks}

Return {"groups":[{"group":"G1","picks":[{"id":"c3","look_for":"..."}],"better_query":""}, ...]} with one entry per group.`;
}

export function footageReviewPrompt({ need, asset, frames, cols = frames, purpose = '' }) {
  return `You are the footage researcher of a documentary. Before archive footage is cut into the film, you check every usable shot of the source clip.
The image above is a contact sheet of ${frames} frames in a grid of ${cols} column(s), read left to right, top to bottom: frame 1 is top-left, frame ${Math.min(cols, frames)} ends the first row. Each frame is the middle of one shot of the source clip, in time order.

Source: ${asset.source.toUpperCase()} — "${asset.title}"${asset.description ? `\nSource caption: ${asset.description.slice(0, 500)}` : ''}

The narration at this point needs:
- subject: ${need.subject || '-'}
- platform: ${need.platform || '(any, generic)'}
- action: ${need.action || '-'}
- era: ${need.era || '-'}${purpose ? `\n- planned use: ${purpose}` : ''}

For every frame return index (1-based), relevance and defects.
relevance:
  3 = shows exactly this platform/subject doing this action (or something that clearly proves the narration)
  2 = the right platform/subject, different action or angle, still a good fit
  1 = related context that does not mislead (same environment, crew, base, weather, sea, sky)
  0 = unrelated, or a different platform/class/variant than the one named (a knowledgeable viewer would object)
Be strict about the platform: a different aircraft type, ship class or variant is 0 even if it looks similar. Use the source caption to identify hardware.
defects (list every one that applies, else empty):
  slate = title or ID card, countdown, text on black
  text = burned-in captions, lower thirds, subtitles, on-screen graphics, watermarks, channel logos
  talking_head = interview, press briefing, person speaking to camera
  blank = black, white, color bars, test pattern, fade
  poor = blurry, heavily compressed, interlaced, very dark, shaky beyond use
  people = identifiable civilians in close-up
taste: 0-2, how cinematic the frame is (0 flat/snapshot, 1 decent, 2 striking composition, light or scale). Judge only the image.`;
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

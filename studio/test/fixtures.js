// Deterministic mock LLM responders that behave like a well-behaved model, for offline tests.
const SENTENCES = [
  'The ship moves through open water while the escorts hold their stations.',
  'Every system aboard exists to push the danger further away.',
  'Radar crews watch the horizon long before anything can be seen.',
  'Distance is the first layer of protection.',
  'Each layer buys time for the next one to act.',
  'The aircraft extend that reach far beyond the horizon.',
  'An attacker has to find the ship, track it, and reach it.',
  'None of those steps is as simple as it sounds.',
];

function sentences(words, offset = 0) {
  const out = [];
  let n = 0;
  let i = offset;
  while (n < words) {
    const s = SENTENCES[i % SENTENCES.length];
    out.push(s);
    n += s.split(' ').length;
    i += 1;
  }
  return out;
}

export function mockResponders() {
  return {
    topics: () => ({
      candidates: [
        { title: 'Why Aircraft Carriers Are So Hard to Sink', central_question: 'How can a ship everyone can find survive?', angle: 'Layered distance', scores: { contradiction: 5, mechanism: 5, footage: 5, sources: 4, relevance: 4, visualization: 5, risk: 2 }, footage_query: 'carrier flight operations', footage_evidence: [], key_sources: [], risks: [] },
        { title: 'Why Submarines Are Still So Hard to Find', central_question: 'How does a submarine hide in a transparent ocean?', angle: 'Acoustics', scores: { contradiction: 4, mechanism: 5, footage: 3, sources: 4, relevance: 3, visualization: 5, risk: 2 }, footage_query: 'submarine surfacing', footage_evidence: [], key_sources: [], risks: [] },
      ],
    }),
    'research:research': () => ({ text: 'Notes: the carrier is about 1,100 feet long (SRC-001).', sources: [{ url: 'https://example.gov/carrier', title: 'Carrier facts' }] }),
    research: () => ({
      sources: [
        { source_id: 'SRC-001', tier: 1, title: 'Carrier fact file', publisher: 'U.S. Navy', url: 'https://example.gov/carrier', date: '2024-01-01' },
        { source_id: 'SRC-002', tier: 2, title: 'Analysis', publisher: 'Reuters', url: 'https://example.com/a', date: '2024-02-01' },
      ],
      claims: Array.from({ length: 20 }, (_, i) => ({ claim_id: `C-${String(i + 1).padStart(3, '0')}`, text: `Fact number ${i + 1} about carriers.`, sources: ['SRC-001'], confidence: 'confirmed', context: '', conflicts: [] })),
      chronology: [], open_questions: [], visual_leads: ['carrier flight operations'],
    }),
    outline: () => ({
      title: 'Why Aircraft Carriers Are So Hard to Sink', central_question: 'How can a ship everyone can find survive?', answer: 'Because reaching it is the hard part.',
      acts: [1, 2, 3, 4, 5, 6, 7].map((act) => ({ act, name: `Act ${act}`, target_s: 30, goal: 'goal', exit_tension: 'next', beats: [{ beat_id: `B-${act}-1`, summary: `Beat summary for act ${act}`, claims: ['C-001'], mode: act % 2 ? 'CINEMATIC' : 'INFORMATION' }] })),
    }),
    script: ({ prompt }) => {
      const budget = Number(prompt.match(/Word budget for this act: (\d+)/)[1]);
      const act = Number(prompt.match(/narration for Act (\d+)/)[1]);
      const per = Math.max(20, Math.ceil(budget / 3));
      const segments = [];
      let written = 0;
      let k = 0;
      while (written < budget * 0.95) {
        const words = Math.min(per, budget - written + 5);
        const text = sentences(words, act + k).join(' [PAUSE 0.5] ');
        written += text.replace(/\[PAUSE [\d.]+\]/g, '').split(/\s+/).filter(Boolean).length;
        segments.push({
          seg_id: `S-${act}-${k}`, beat_id: `B-${act}-1`, text, claims: ['C-001'], tone: 'normal',
          purpose: k % 3 === 2 ? 'C' : 'I', density: k % 3 === 2 ? 'low' : 'medium', mode: act % 2 ? 'CINEMATIC' : 'INFORMATION',
          pron: [], stats: k === 0 && act === 2 ? [{ value: '1,106 FT', label: 'Length', claim_id: 'C-001' }] : [],
        });
        k += 1;
      }
      return { segments };
    },
    visual: ({ prompt }) => {
      const segs = [...prompt.matchAll(/^(S-\d{2}-\d{2}) \[/gm)].map((m) => m[1]);
      const act = Number(prompt.match(/Act (\d+) "/)[1]);
      const need = (subject, platform = '') => ({ subject, platform, action: 'underway', mood: ['scale'], era: '', query_terms: [subject] });
      const noFlow = { reconstruction: false, composition: '', camera: '', lighting: '', motion: '', constraints: [] };
      const mapJson = JSON.stringify({ template: 'map', data: { title: 'Pacific', view: { center: [150, 20], scale_from: 1.5, scale_to: 3 }, steps: [{ type: 'point', lon: 144.8, lat: 13.4, label: 'Guam', role: 'info' }, { type: 'ring', lon: 144.8, lat: 13.4, radius_km: 900, label: '900 km', role: 'sensor' }] } });
      const techJson = JSON.stringify({ template: 'process', data: { title: 'Layers', steps: [{ label: 'Detect', detail: '', role: 'sensor' }, { label: 'Track', detail: '', role: 'sensor' }, { label: 'Engage', detail: '', role: 'warning' }] } });
      return {
        cold_open: act === 1 ? [{ visual_type: 'FLOW', need: need('carrier alone at sea at dawn', 'Nimitz-class'), flow: { ...noFlow, reconstruction: true, composition: 'small in frame' } }, { visual_type: 'REAL', need: need('ocean horizon'), flow: noFlow }] : [],
        segments: segs.map((seg_id, i) => ({
          seg_id,
          beats: i === 0 && act === 3
            ? [{ from_word: 0, visual_type: 'MAP', need: need('carrier strike group'), motion_json: mapJson, flow: noFlow, claims: [] }, { from_word: 12, visual_type: 'REAL', need: need('flight deck operations', 'Nimitz-class'), motion_json: '', flow: noFlow, claims: [] }]
            : i === 1 && act === 4
              ? [{ from_word: 0, visual_type: 'TECH', need: need('radar'), motion_json: techJson, flow: noFlow, claims: [] }]
              : [{ from_word: 0, visual_type: i % 4 === 3 ? 'FLOW' : 'REAL', need: need(`carrier scene ${i}`), motion_json: '', flow: { ...noFlow, reconstruction: true, constraints: ['island on the starboard side'] }, claims: [] }],
        })),
      };
    },
    // Footage planner: the first candidates of every group, as many as the prompt allows.
    asset_plan: ({ prompt }) => ({
      groups: prompt.split('\n### ').slice(1).map((block) => ({
        group: block.match(/^(G\d+)/)[1],
        picks: [...block.matchAll(/^(c\d+) \|/gm)].slice(0, Number(block.match(/pick up to (\d+)/)[1])).map((m) => ({ id: m[1], look_for: 'wide shot' })),
        better_query: '',
      })),
    }),
    review: () => ({ findings: [{ pass: 3, level: 'minor', ref: 'S-03-02', detail: 'slightly repetitive', fix: 'vary the sentence' }] }),
  };
}

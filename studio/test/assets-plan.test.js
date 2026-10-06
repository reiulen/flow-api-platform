import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { runAssets } from '../core/stages/assets.js';
import { adapters } from '../core/sources.js';
import { loadConfig } from '../core/config.js';
import { loadStyle } from '../core/style.js';

const walk = (dir) => (fs.existsSync(dir) ? fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)])) : []);

test('footage is planned before download: only planned clips are fetched, each reviewed once', { timeout: 120000 }, async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'studio-plan-'));
  const config = loadConfig({ assetsDir: dir, testMode: false, disabledSources: [] });
  const style = structuredClone(loadStyle(config, 'military'));
  style.assets.source_priority = ['fake'];
  const searches = [];
  adapters.fake = {
    enabled: () => true,
    stock: false,
    async search(q) {
      searches.push(q);
      const mk = (id, title, description) => ({ kind: 'video', source: 'fake', source_id: id, source_url: 'fake://', title, description, tags: [], license: 'public_domain', credit: 'test', width: 1280, height: 720, duration_s: 24, year: 2021 });
      if (/abrams convoy/i.test(q)) return [mk('abrams', 'M1A2 Abrams convoy B-roll', 'M1 Abrams tanks drive in a convoy')];
      if (!/b-52/i.test(q)) return [];
      return [
        mk('brief', 'B-52 wing commander press briefing', 'Press conference about the B-52 deployment'),
        mk('takeoff', 'B-52H Stratofortress takeoff B-roll', 'B-52H bombers take off from Barksdale AFB'),
        mk('ceremony', 'B-52 change of command ceremony', 'Ceremony with a B-52 static display'),
        mk('b1', 'B-1B Lancer takeoff', 'B-1B bombers take off'),
      ];
    },
    async resolve(c) { return { synthetic: true, label: c.title }; },
  };
  const prompts = [];
  let footageCalls = 0;
  let sheetImages = 0;
  const llm = {
    async json({ stage, prompt, images }) {
      if (stage === 'asset_plan') {
        prompts.push(prompt);
        const groups = [...prompt.matchAll(/^### (G\d+)/gm)].map((m) => m[1]);
        return {
          groups: groups.map((g) => {
            const block = prompt.split(`### ${g}`)[1].split('\n### ')[0];
            // The planner reads the metadata: takes the B-roll, ignores briefing and ceremony;
            // with nothing usable it proposes a better search.
            const broll = [...block.matchAll(/^(c\d+) \|.*B-roll/gm)][0];
            return broll ? { group: g, picks: [{ id: broll[1], look_for: 'wide B-roll' }], better_query: '' } : { group: g, picks: [], better_query: 'M1A2 Abrams convoy' };
          }),
        };
      }
      if (stage === 'footage') {
        footageCalls += 1;
        sheetImages += images.length;
        assert.match(prompt, /contact sheet of 3 frames/);
        assert.match(prompt, /planned use: wide B-roll/);
        return { frames: [1, 2, 3].map((index) => ({ index, relevance: 3, defects: [], taste: 1 })) };
      }
      throw new Error(`unexpected stage ${stage}`);
    },
  };
  const b52 = { subject: 'bomber takeoff', platform: 'B-52H', action: 'takeoff', era: '', mood: [], query_terms: ['B-52 takeoff'] };
  const tank = { subject: 'tank column', platform: 'M1 Abrams', action: 'driving', era: '', mood: [], query_terms: [] };
  const shot = (id, seq, need, start) => ({ shot_id: id, seq_id: seq, act: 1, seg_refs: ['S-01-01'], start_s: start, duration_s: 3, visual_type: 'REAL', need, transition_in: 'cut' });
  const shotList = {
    duration_s: 120,
    shots: [shot('SH-1', 'Q-001', b52, 0), shot('SH-2', 'Q-001', b52, 3), shot('SH-3', 'Q-002', tank, 6), shot('SH-4', 'Q-003', b52, 9)],
  };
  const script = { segments: [{ seg_id: 'S-01-01', text: 'The B-52 still takes off from Barksdale [PAUSE 0.5] every week.' }] };
  try {
    const { report, plan } = await runAssets({ project: { id: 'P' }, shotList, script, style, config, flowAvailable: true, llm });
    // Shots with the same need are one group, each query searched once; the tank group, which
    // the first search found nothing for, gets one targeted retry search and one more plan call.
    assert.equal(plan.totals.groups, 2);
    assert.equal(searches.length, new Set(searches).size);
    assert.ok(searches.includes('M1A2 Abrams convoy'));
    assert.equal(prompts.length, 2, 'one plan call, one retry plan call');
    assert.match(prompts[0], /Narration here: "The B-52 still takes off from Barksdale every week\."/);
    assert.match(prompts[0], /none found by the first search/);
    assert.doesNotMatch(prompts[0], /B-1B Lancer/, 'wrong platform never reaches the planner');
    // Only the two planned clips were downloaded, each reviewed once with one contact sheet image;
    // the briefing and the ceremony were never downloaded.
    assert.equal(walk(path.join(dir, 'files')).filter((f) => f.endsWith('.mp4')).length, 2);
    assert.equal(plan.totals.downloaded_new, 2);
    assert.equal(footageCalls, 2);
    assert.equal(sheetImages, 2);
    // Three B-52 shots come from three different shots of one clip, the tank shot from the other.
    const found = report.shots.filter((r) => r.status === 'found');
    assert.equal(found.length, 4);
    assert.equal(new Set(found.filter((r) => r.shot_id !== 'SH-3').map((r) => r.asset_id)).size, 1);
    const g1 = plan.groups.find((g) => g.need.platform === 'B-52H');
    assert.equal(g1.picks.length, 1);
    assert.ok(g1.picks[0].used && g1.picks[0].fetched);
    assert.equal(plan.groups.find((g) => g.need.platform === 'M1 Abrams').planned_by, 'llm+retry');
    assert.equal(plan.totals.unused_fetched, 0);
  } finally {
    delete adapters.fake;
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('without a planner the best text matches are planned, still within the download budget', { timeout: 120000 }, async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'studio-plan2-'));
  const config = loadConfig({ assetsDir: dir, testMode: false, disabledSources: [], assets: { maxDownloads: 1 } });
  const style = structuredClone(loadStyle(config, 'military'));
  style.assets.source_priority = ['fake'];
  adapters.fake = {
    enabled: () => true,
    stock: false,
    async search() { return [0, 1, 2, 3, 4].map((i) => ({ kind: 'video', source: 'fake', source_id: `c${i}`, source_url: 'fake://', title: `B-52H takeoff ${i}`, description: '', tags: [], license: 'public_domain', credit: 't', height: 720, duration_s: 24 })); },
    async resolve(c) { return { synthetic: true, label: c.title }; },
  };
  const need = { subject: 'takeoff', platform: 'B-52H', action: 'takeoff', era: '', mood: [], query_terms: [] };
  const shots = Array.from({ length: 6 }, (_, i) => ({ shot_id: `SH-${i}`, seq_id: `Q-${i}`, act: 1, seg_refs: [], start_s: i * 3, duration_s: 3, visual_type: 'REAL', need, transition_in: 'cut' }));
  try {
    const { plan, report } = await runAssets({ project: { id: 'P' }, shotList: { duration_s: 60, shots }, style, config, flowAvailable: false, llm: null });
    assert.equal(plan.groups[0].planned_by, 'score');
    assert.equal(plan.totals.downloaded_new, 1, 'the budget caps downloads');
    assert.equal(walk(path.join(dir, 'files')).filter((f) => f.endsWith('.mp4')).length, 1);
    assert.equal(report.shots.filter((r) => r.status === 'found').length, 3);
  } finally {
    delete adapters.fake;
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('past the time budget nothing new is downloaded and the stage still finishes', { timeout: 60000 }, async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'studio-plan3-'));
  const config = loadConfig({ assetsDir: dir, testMode: false, disabledSources: [], assets: { timeBudgetMin: -1 } });
  const style = structuredClone(loadStyle(config, 'military'));
  style.assets.source_priority = ['fake'];
  adapters.fake = {
    enabled: () => true,
    stock: false,
    async search() { return [{ kind: 'video', source: 'fake', source_id: 'x', source_url: 'fake://', title: 'B-52H takeoff', description: '', tags: [], license: 'public_domain', credit: 't', height: 720, duration_s: 24 }]; },
    async resolve(c) { return { synthetic: true, label: c.title }; },
  };
  const need = { subject: 'takeoff', platform: 'B-52H', action: 'takeoff', era: '', mood: [], query_terms: [] };
  const shots = [{ shot_id: 'SH-1', seq_id: 'Q-1', act: 1, seg_refs: [], start_s: 0, duration_s: 3, visual_type: 'REAL', need, transition_in: 'cut' }];
  const logs = [];
  try {
    const { plan, report } = await runAssets({ project: { id: 'P' }, shotList: { duration_s: 300, shots }, style, config, flowAvailable: true, llm: null, log: (m) => logs.push(m) });
    assert.equal(plan.totals.downloaded_new, 0);
    assert.ok(plan.totals.time_budget_reached);
    assert.equal(report.shots[0].status, 'fallback_flow');
    assert.ok(logs.some((l) => /time budget/.test(l)));
  } finally {
    delete adapters.fake;
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

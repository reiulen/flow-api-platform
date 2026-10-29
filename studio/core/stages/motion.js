import fs from 'node:fs';
import path from 'node:path';
import { REPO_ROOT } from '../config.js';
import { renderGeo } from '../geo.js';
import { buildKit, safeScene } from '../story.js';
import { ensureDir, ffprobe, hash, mapLimit, round, run } from '../util.js';

const OVERLAY_TEMPLATES = new Set(['stat', 'label', 'subscribe']);
const VENDOR = {
  'gsap.min.js': 'node_modules/gsap/dist/gsap.min.js',
  'd3-array.min.js': 'node_modules/d3-array/dist/d3-array.min.js',
  'd3-geo.min.js': 'node_modules/d3-geo/dist/d3-geo.min.js',
  'topojson-client.min.js': 'node_modules/topojson-client/dist/topojson-client.min.js',
  'inter-tight-400.woff2': 'node_modules/@fontsource/inter-tight/files/inter-tight-latin-400-normal.woff2',
  'inter-tight-500.woff2': 'node_modules/@fontsource/inter-tight/files/inter-tight-latin-500-normal.woff2',
  'inter-tight-600.woff2': 'node_modules/@fontsource/inter-tight/files/inter-tight-latin-600-normal.woff2',
  'inter-tight-700.woff2': 'node_modules/@fontsource/inter-tight/files/inter-tight-latin-700-normal.woff2',
  'plex-mono-400.woff2': 'node_modules/@fontsource/ibm-plex-mono/files/ibm-plex-mono-latin-400-normal.woff2',
  'plex-mono-500.woff2': 'node_modules/@fontsource/ibm-plex-mono/files/ibm-plex-mono-latin-500-normal.woff2',
  'oswald-500.woff2': 'node_modules/@fontsource/oswald/files/oswald-latin-500-normal.woff2',
  'oswald-600.woff2': 'node_modules/@fontsource/oswald/files/oswald-latin-600-normal.woff2',
  'gochi-hand-400.woff2': 'node_modules/@fontsource/gochi-hand/files/gochi-hand-latin-400-normal.woff2',
  'caveat-brush-400.woff2': 'node_modules/@fontsource/caveat-brush/files/caveat-brush-latin-400-normal.woff2',
  'patrick-hand-400.woff2': 'node_modules/@fontsource/patrick-hand/files/patrick-hand-latin-400-normal.woff2',
  'kalam-400.woff2': 'node_modules/@fontsource/kalam/files/kalam-latin-400-normal.woff2',
  'kalam-700.woff2': 'node_modules/@fontsource/kalam/files/kalam-latin-700-normal.woff2',
  'story-core.js': 'studio/motion/story/core.js',
  'story-hero.js': 'studio/motion/story/hero.js',
  'story-timeline.js': 'studio/motion/story/timeline.js',
  'story-props.js': 'studio/motion/story/props.js',
  'story-envs.js': 'studio/motion/story/envs.js',
  'story-envs2.js': 'studio/motion/story/envs2.js',
  'story-envs3.js': 'studio/motion/story/envs3.js',
  'story-scene.js': 'studio/motion/story/scene.js',
};

export function prepareVendor(dir) {
  const vendor = ensureDir(path.join(dir, 'vendor'));
  for (const [name, rel] of Object.entries(VENDOR)) {
    const dest = path.join(vendor, name);
    if (name.startsWith('story-') || !fs.existsSync(dest)) fs.copyFileSync(path.join(REPO_ROOT, rel), dest);
  }
  const world = path.join(vendor, 'world.js');
  if (!fs.existsSync(world)) {
    fs.writeFileSync(world, `window.WORLD = ${fs.readFileSync(path.join(REPO_ROOT, 'node_modules/world-atlas/countries-50m.json'), 'utf8')};`);
  }
  return vendor;
}

// Renders one template. Results are cached by content hash, so identical graphics are never re-rendered.
export async function renderMotion({ config, style, template, data, duration }) {
  if (template === 'map') {
    if (!config.render.motionStub) return renderMapShot({ config, style, data, duration });
    const out = path.join(ensureDir(path.join(config.assetsDir, 'motion-cache')), `map-stub-${hash({ data, duration: round(duration, 3) })}.mp4`);
    return fs.existsSync(out) ? out : stubMotion(out, false, round(duration, 3), template);
  }
  const templatesDir = path.join(config.motionDir, 'templates');
  const html = fs.readFileSync(path.join(templatesDir, `${template}.html`), 'utf8');
  const css = fs.readFileSync(path.join(templatesDir, 'common.css'), 'utf8');
  const payload = { data, duration: round(duration, 3), colors: style.colors, fonts: style.fonts };
  const overlay = OVERLAY_TEMPLATES.has(template);
  const code = template === 'story' ? Object.keys(VENDOR).filter((n) => n.startsWith('story-')).map((n) => fs.readFileSync(path.join(REPO_ROOT, VENDOR[n]), 'utf8')) : null;
  const key = hash({ html, css, payload, fps: style.canvas.fps, code, v: 2 });
  const cacheDir = ensureDir(path.join(config.assetsDir, 'motion-cache'));
  const out = path.join(cacheDir, `${template}-${key}.${overlay ? 'mov' : 'mp4'}`);
  if (fs.existsSync(out)) return out;

  if (config.render.motionStub) return stubMotion(out, overlay, payload.duration, template);
  const workId = `${template}-${key}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const work = ensureDir(path.join(cacheDir, 'work', workId));
  prepareVendor(work);
  fs.writeFileSync(path.join(work, 'common.css'), css);
  const filled = html.replaceAll('__DURATION__', String(payload.duration)).replace('__PAYLOAD__', JSON.stringify(payload));
  fs.writeFileSync(path.join(work, 'index.html'), filled);
  const tmp = path.join(work, `output${overlay ? '.mov' : '.mp4'}`);
  const args = ['render', '--quality', config.render.motionQuality, '--fps', String(style.canvas.fps), '--format', overlay ? 'mov' : 'mp4', '-o', tmp, work];
  await run(config.render.hyperframes, args, { cwd: work, timeoutMs: 20 * 60 * 1000, env: { HYPERFRAMES_TELEMETRY: '0', DO_NOT_TRACK: '1' } });
  const info = await ffprobe(tmp);
  if (Math.abs(info.duration - payload.duration) > 0.2) throw new Error(`motion ${template}: rendered ${info.duration}s, expected ${payload.duration}s`);
  if (!fs.existsSync(out)) {
    try { fs.renameSync(tmp, out); } catch { fs.copyFileSync(tmp, out); }
  }
  fs.rmSync(work, { recursive: true, force: true });
  return out;
}

// S9: render every explainer/title shot and every overlay of the shot list.
export async function runMotion({ project, shotList, style, config }) {
  const jobs = [];
  // One kit per video: the same figure, palette and handwriting in every scene, different from every other video.
  let kit = null;
  if (style.story?.enabled) {
    kit = project.has('kit.json') ? project.read('kit.json') : project.write('kit.json', buildKit(project.brief.topic_id ? `${project.brief.title_working}|${project.id}` : project.id, style));
  }
  const withKit = (shot) => (shot.motion.template === 'story' ? { ...shot.motion.data, kit, tag_kind: kit?.tag } : shot.motion.data);
  for (const shot of shotList.shots) {
    if (shot.motion && (shot.visual_type === 'MAP' || shot.visual_type === 'TECH' || shot.shot_class === 'black')) {
      jobs.push({ target: shot, field: 'motion_file', template: shot.motion.template, data: withKit(shot), duration: shot.duration_s + transitionPad(shot, shotList, style) });
    }
  }
  for (const ov of shotList.overlays) {
    const template = ov.kind === 'stat' ? 'stat' : ov.kind === 'subscribe' ? 'subscribe' : 'label';
    jobs.push({ target: ov, field: 'motion_file', template, data: ov.data, duration: ov.duration_s });
  }
  const failures = [];
  await mapLimit(jobs, Math.max(1, Math.floor(config.concurrency)), async (job) => {
    try {
      let file = await renderMotion({ config, style, template: job.template, data: job.data, duration: job.duration });
      if (job.template === 'story' && !config.render.motionStub && !(await storyFrameOk(file, job.duration))) {
        // A blank or broken frame never ships: redraw the shot as the safe scene of the same room.
        project.log('story_redraw', { id: job.target.shot_id || job.target.overlay_id });
        file = await renderMotion({ config, style, template: 'story', data: { ...safeScene(job.data, { seed: project.id }), kit: job.data.kit }, duration: job.duration });
      }
      job.target[job.field] = path.relative(project.dir, file);
    } catch (err) {
      failures.push({ id: job.target.shot_id || job.target.overlay_id, template: job.template, error: err.message.slice(0, 400) });
      project.log('motion_failed', failures.at(-1));
    }
  });
  return { shotList, failures, rendered: jobs.length - failures.length };
}

// A shot that dissolves into the next needs extra tail frames for the overlap.
export function transitionPad(shot, shotList, style) {
  const i = shotList.shots.indexOf(shot);
  const next = shotList.shots[i + 1];
  if (!next) return 0;
  return style.transitions.durations[next.transition_in] || 0;
}

// Test stand-in: same duration and alpha behaviour, no browser.
async function stubMotion(out, overlay, duration, template) {
  const tmp = `${out}.part${overlay ? '.mov' : '.mp4'}`;
  const args = overlay
    ? ['-f', 'lavfi', '-i', `color=c=white@0.0:s=1920x1080:r=30:d=${duration},format=rgba,drawbox=x=132:y=820:w=420:h=90:color=white@0.8:t=fill`, '-c:v', 'qtrle']
    : ['-f', 'lavfi', '-i', `color=c=0x14181D:s=1920x1080:r=30:d=${duration},drawbox=x=760:y=440:w=400:h=200:color=0x3CCFCF:t=4`, '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p'];
  await run('ffmpeg', ['-y', '-v', 'error', ...args, tmp]);
  fs.renameSync(tmp, out);
  void template;
  return out;
}

// Maps go through the MapLibre renderer; cached by data, duration, provider and renderer code.
async function renderMapShot({ config, style, data, duration }) {
  const code = ['studio/motion/geo/page.js', 'studio/motion/geo/page.html', 'studio/core/geo.js'].map((f) => fs.readFileSync(path.join(REPO_ROOT, f), 'utf8'));
  const key = hash({ data, duration: round(duration, 3), provider: config.map.provider, geo: style.geo, colors: style.colors, code, v: 1 });
  const cacheDir = ensureDir(path.join(config.assetsDir, 'motion-cache'));
  const out = path.join(cacheDir, `map-${key}.mp4`);
  if (fs.existsSync(out)) return out;
  await renderGeo({ config, style, data, duration: round(duration, 3), out });
  return out;
}

// Mid-shot frame must have light and contrast; catches a scene that rendered black or collapsed.
export async function storyFrameOk(file, duration) {
  try {
    const { stderr, stdout } = await run('ffmpeg', ['-v', 'error', '-ss', String(Math.max(0.5, duration * 0.6)), '-i', file, '-frames:v', '1', '-vf', 'signalstats,metadata=mode=print:file=-', '-f', 'null', '-']);
    const out = `${stdout}${stderr}`;
    const num = (k) => Number((out.match(new RegExp(`lavfi.signalstats.${k}=([0-9.]+)`)) || [])[1]);
    const avg = num('YAVG'); const max = num('YMAX'); const min = num('YMIN');
    return avg > 5 && max - min > 50;
  } catch {
    return true;
  }
}

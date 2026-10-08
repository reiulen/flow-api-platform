import fs from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { z } from 'zod';
import { flowQcPrompt, houseRules } from '../prompts.js';
import { ensureDir, ffprobe, mapLimit, readJson, round, run, sleep, writeJson } from '../util.js';

export function cameraFilter(shot, duration, fps = 30) {
  const frames = Math.max(30, Math.round(duration * fps));
  const cam = `${shot.flow?.spec?.camera || ''} ${shot.flow?.spec?.motion || ''}`.toLowerCase();
  const idNum = Number((shot.shot_id || '0').replace(/\D/g, '')) || 0;
  const actionText = `${shot.need?.action || ''} ${shot.need?.subject || ''}`.toLowerCase();

  // 1. Slow Cinematic Horizontal Tracking Pan (6% drift at 1.07x scale)
  // For walking, streets, markets, forum, outdoor movement, corridors
  if (cam.includes('pan') || cam.includes('track') || actionText.includes('walk') || actionText.includes('street') || actionText.includes('market') || actionText.includes('crowd')) {
    const goLeft = (idNum % 2) === 0;
    const xExpr = goLeft
      ? `'iw/2-(iw/zoom/2)-(iw*0.06)*(on/${frames})'`
      : `'iw/2-(iw/zoom/2)+(iw*0.06)*(on/${frames})'`;
    return `scale=3840x2160:force_original_aspect_ratio=increase,crop=3840:2160,zoompan=z=1.07:d=1:x=${xExpr}:y='ih/2-(ih/zoom/2)':s=3840x2160:fps=${fps},scale=1920:1080:flags=lanczos`;
  }

  // 2. Cinematic Reveal / Pull-Out (Starts close 1.08x, pulls out smoothly to 1.0x wide)
  // For wide vistas, establishing architecture, city landscapes, insula exteriors, dusk/dawn scenes
  if (cam.includes('reveal') || cam.includes('wide') || cam.includes('pull') || cam.includes('out') || actionText.includes('exterior') || actionText.includes('city') || (idNum % 3 === 0)) {
    return `scale=3840x2160:force_original_aspect_ratio=increase,crop=3840:2160,zoompan=z='max(1.08-0.08*(on/${frames}),1.0)':d=1:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=3840x2160:fps=${fps},scale=1920:1080:flags=lanczos`;
  }

  // 3. Cinematic Diagonal Drift (Subtle push-in + diagonal pan for dramatic tension)
  if ((idNum % 5 === 0) || cam.includes('drift')) {
    const xDir = (idNum % 2 === 0) ? 0.03 : -0.03;
    const yDir = (idNum % 4 === 0) ? 0.02 : -0.02;
    return `scale=3840x2160:force_original_aspect_ratio=increase,crop=3840:2160,zoompan=z='min(1.02+0.06*(on/${frames}),1.08)':d=1:x='iw/2-(iw/zoom/2)+(${xDir}*iw)*(on/${frames})':y='ih/2-(ih/zoom/2)+(${yDir}*ih)*(on/${frames})':s=3840x2160:fps=${fps},scale=1920:1080:flags=lanczos`;
  }

  // 4. Dramatic Slow Push-In (Zoom in 1.0x -> 1.08x steadily focusing into the scene)
  // Default for dialogue, character actions, intimate interiors, debt records, tension
  return `scale=3840x2160:force_original_aspect_ratio=increase,crop=3840:2160,zoompan=z='min(1.0+0.075*(on/${frames}),1.075)':d=1:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=3840x2160:fps=${fps},scale=1920:1080:flags=lanczos`;
}

export async function convertImageToClip(imgFile, mp4File, shot, duration, fps = 30) {
  const vf = cameraFilter(shot, duration, fps);
  await run('ffmpeg', [
    '-y', '-v', 'error', '-loop', '1', '-i', imgFile,
    '-vf', vf,
    '-t', String(duration),
    '-c:v', 'libx264', '-preset', 'medium', '-pix_fmt', 'yuv420p',
    mp4File
  ]);
}

export function sanitizeFlowPrompt(text) {
  if (!text) return '';
  return text
    .replace(/\bslave market\b/gi, 'labor market')
    .replace(/\bslave gang\b/gi, 'work crew')
    .replace(/\brunaway slave\b/gi, 'fugitive plebeian')
    .replace(/\bslaves\b/gi, 'plebeian workers')
    .replace(/\bslave\b/gi, 'plebeian worker')
    .replace(/\benslaved\b/gi, 'bonded')
    .replace(/\bviolence\b/gi, 'struggle')
    .replace(/\bgangs\b/gi, 'crews')
    .replace(/\bgang\b/gi, 'crew')
    .replace(/\bcorpses?\b/gi, 'fallen figures')
    .replace(/\bblood\b/gi, 'shadows');
}

// S7: deterministic prompt assembly from the shot spec (studio/bibles/_common/05_FLOW_PROMPT_SYSTEM.md §4).
export function buildFlowPrompt(shot, style, corrections = []) {
  const spec = shot.flow?.spec || {};
  const need = shot.need || {};
  const subject = [need.platform, need.subject].filter(Boolean).join(': ') || 'Atmospheric documentary establishing shot';
  const constraints = (spec.constraints || []).filter(Boolean);
  const kind = shot.flow?.reconstruction ? 'documentary reconstruction' : 'documentary establishing shot';
  const cinematic = shot.mode === 'CINEMATIC';
  const avoidList = [...(style.flow.avoid || []), ...(style.flow.avoid_extra || [])];
  const lines = [
    `${style.flow.duration_s}-second ${kind}.`,
    '',
    `Framing: Single continuous 16:9 widescreen frame. Single camera view. Absolutely NO comic book panels, NO multi-panel layouts, NO comic strips, NO split screens, NO border dividers.`,
    '',
    `${subject}${need.action ? `, ${need.action}` : ''}.${constraints.length ? ` ${constraints.map((c) => c.replace(/\.?$/, '.')).join(' ')}` : ''}`,
    '',
    `Characters: ${style.flow.character_guide || 'Minimalist stickman character with smooth off-white round head, simple dot eyes, thin black stick limbs, wearing realistically draped clothing with natural fabric folds'}.`,
    '',
    `Composition: ${spec.composition || (cinematic ? 'the subject occupies a modest part of the frame with generous negative space around it' : 'clear, readable framing of the subject')}.`,
    `Camera: ${spec.camera || (cinematic ? 'very slow, completely stable movement, long lens' : 'stable, slow movement')}.`,
    `Lighting: ${spec.lighting || 'soft natural daylight, slightly overcast, light atmospheric haze'}.`,
    `Motion: ${spec.motion || 'subtle, realistic movement in the scene'}.`,
    '',
    style.flow.look,
    need.mood?.length ? `Mood: ${need.mood.join(', ')}.` : '',
    '',
    corrections.length ? `The previous attempt was rejected. It must not happen again: ${corrections.slice(0, 4).map((c) => c.replace(/\.?$/, '')).join('; ')}.` : '',
    avoidList.length ? `Avoid: ${avoidList.join(', ')}.` : '',
  ];
  return sanitizeFlowPrompt(lines.filter((l, i, arr) => !(l === '' && arr[i - 1] === '')).join('\n').trim());
}

export function flowRequest(shot, style, project, attempt, corrections = []) {
  return {
    idempotencyKey: `${project.id}:${shot.shot_id}:v${attempt}`,
    body: {
      prompt: buildFlowPrompt(shot, style, corrections),
      model: style.flow?.model || 'nano-banana-pro',
      aspectRatio: style.flow.aspect_ratio,
      resolution: style.flow.resolution,
      duration: style.flow.duration_s,
      mode: 'frames',
      count: style.flow.count,
      projectKey: project.id,
    },
  };
}

// ---- Flow API transport ----

async function flowCall(config, method, urlPath, body, headers = {}) {
  for (let a = 0; a < 4; a++) {
    try {
      const res = await fetch(`${config.flow.baseUrl}${urlPath}`, {
        method,
        signal: AbortSignal.timeout(60000),
        headers: { authorization: `Bearer ${config.flow.apiKey}`, 'content-type': 'application/json', ...headers },
        body: body ? JSON.stringify(body) : undefined,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok && res.status !== 202) throw new Error(`flow api ${method} ${urlPath} -> ${res.status} ${JSON.stringify(data.error || data).slice(0, 300)}`);
      return data;
    } catch (err) {
      if (a === 3) throw err;
      await sleep(1500 * (a + 1));
    }
  }
}

export async function submitAndWait(config, request) {
  const isImageModel = Boolean(request.body?.model && /banana/i.test(request.body.model));
  const endpoint = isImageModel ? '/v1/images' : '/v1/videos';
  const body = { ...request.body };
  if (isImageModel) {
    delete body.resolution;
    delete body.duration;
    delete body.mode;
  }
  let created;
  try {
    created = await flowCall(config, 'POST', endpoint, body, { 'idempotency-key': request.idempotencyKey });
  } catch (err) {
    if (err.message.includes('409') || err.message.includes('idempotency_conflict')) {
      created = await flowCall(config, 'POST', endpoint, body, { 'idempotency-key': `${request.idempotencyKey}:${Date.now()}` });
    } else {
      throw err;
    }
  }
  const jobId = created.data?.id;
  if (!jobId) throw new Error('flow api: no job id');
  const deadline = Date.now() + config.flow.timeoutMs;
  while (Date.now() < deadline) {
    const { data: job } = await flowCall(config, 'GET', `/v1/jobs/${jobId}`);
    if (job.state === 'completed' || job.state === 'succeeded') {
      const urls = (job.result?.items || []).map((i) => i.videoUrl || i.imageUrl || i.url).filter(Boolean);
      return { jobId, urls: urls.length ? urls : (job.result?.media || (job.result?.imageUrl ? [job.result.imageUrl] : [])) };
    }
    if (job.state === 'failed' || job.state === 'cancelled') throw new Error(`flow job ${jobId} ${job.state}: ${JSON.stringify(job.error || {}).slice(0, 300)}`);
    if (job.state === 'action_required') throw new Error(`flow job ${jobId} needs action on the Flow account (login/captcha/credits)`);
    await sleep(config.flow.pollMs);
  }
  throw new Error(`flow job ${jobId} timed out`);
}

async function fetchTo(url, dest) {
  for (let a = 0; a < 4; a++) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(300000) });
      if (!res.ok || !res.body) throw new Error(`flow download ${res.status}`);
      await pipeline(Readable.fromWeb(res.body), fs.createWriteStream(dest));
      return;
    } catch (err) {
      if (a === 3) throw err;
      await sleep(1500 * (a + 1));
    }
  }
}

async function syntheticFlow(dest, seedText) {
  const hue = [...seedText].reduce((n, ch) => n + ch.charCodeAt(0), 0) % 360;
  await run('ffmpeg', ['-y', '-v', 'error', '-f', 'lavfi', '-i', `gradients=size=1280x720:rate=30:duration=8:speed=0.01:c0=0x203040:c1=0x405060,hue=h=${hue}`, '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', dest]);
}

// ---- QC of generated footage ----

const QcOut = z.object({
  verdict: z.enum(['approved', 'approved_with_trim', 'rejected']),
  usable_from: z.number().describe('fraction 0-1 of clip where usable part starts'),
  usable_to: z.number().describe('fraction 0-1 of clip where usable part ends'),
  issues: z.array(z.string()),
});

async function frames(file, dir) {
  const info = await ffprobe(file);
  const out = [];
  for (const [i, f] of [0.1, 0.5, 0.9].entries()) {
    const png = path.join(dir, `${path.basename(file, '.mp4')}_f${i}.jpg`);
    await run('ffmpeg', ['-y', '-v', 'error', '-ss', String(info.duration * f), '-i', file, '-frames:v', '1', '-vf', 'scale=768:-2', png]);
    out.push(png);
  }
  return { out, duration: info.duration };
}

async function qcClip({ llm, style, shot, file, prompt, hardwareChecklist, workDir }) {
  const { out, duration } = await frames(file, workDir);
  if (duration < 3) return { qc: 'rejected', range: null, issues: ['clip shorter than 3 s'] };
  const res = await llm.json({
    stage: 'flowqc', schema: QcOut, system: houseRules(style), images: out,
    prompt: flowQcPrompt({ shot: { prompt_summary: prompt.split('\n').slice(0, 3).join(' ') }, style, constraints: shot.flow?.spec?.constraints || [], hardwareChecklist }),
  });
  for (const f of out) fs.rmSync(f, { force: true });
  if (res.verdict === 'rejected') return { qc: 'rejected', range: null, issues: res.issues };
  const from = Math.max(0, Math.min(0.5, res.usable_from)) * duration;
  const to = Math.max(0.5, Math.min(1, res.usable_to || 1)) * duration;
  return { qc: res.verdict, range: { in: round(from), out: round(to) }, issues: res.issues };
}

// Identifying visual features of a named platform, written once and reused by every video, so the
// same aircraft or ship looks the same across the channel and generation gets it right first time.
const PlatformOut = z.object({ constraints: z.array(z.string()).min(1).max(5) });
export async function platformConstraints({ llm, config, style, platform, hardwareChecklist }) {
  const file = path.join(ensureDir(config.assetsDir), 'platform-constraints.json');
  const all = fs.existsSync(file) ? readJson(file) : {};
  const key = platform.trim().toLowerCase();
  if (all[key]) return all[key];
  const out = await llm.json({
    stage: 'flow_spec', schema: PlatformOut, system: houseRules(style), maxTokens: 1500,
    prompt: `A documentary shot of the ${platform} will be generated by a video model. List 2-5 short visual facts that identify the ${platform} and that a knowledgeable viewer would check: number and placement of engines, tail shape and count, wing shape, island side, hull and sail shape, markings style. Only features you are certain of for this exact type and variant; no dimensions, no numbers you would need a source for (counts of visible parts are fine). One short sentence each.\n\nGeneral checklist of common mistakes:\n${hardwareChecklist}`,
  });
  all[key] = out.constraints;
  writeJson(file, all);
  return out.constraints;
}

// S8: generate every FLOW shot, QC it, retry, and attach the selected clip.
export async function runFlow({ project, shotList, style, config, llm, hardwareChecklist }) {
  const dir = project.subdir('flow');
  const queueDir = project.subdir('flow_queue');
  const results = project.read('flow_results.json', undefined, { results: [] });
  const byShot = new Map(results.results.map((r) => [r.shot_id, r]));
  let pending = 0;
  let generations = results.results.reduce((n, r) => n + r.attempt, 0);

  const flowShots = shotList.shots.filter((s) => s.visual_type === 'FLOW');
  const flowConcurrency = Math.max(1, Math.min(Number(config.flowConcurrency || config.concurrency || 2), 4));

  await mapLimit(flowShots, flowConcurrency, async (shot) => {
    const prev = byShot.get(shot.shot_id);
    if (prev?.selected && fs.existsSync(path.join(project.dir, prev.selected))) {
      shot.flow_file = prev.selected;
      shot.asset_range = prev.range;
      return;
    }
    const existingFile = [
      path.join(dir, `${shot.shot_id}_v1.mp4`),
      path.join(dir, `${shot.shot_id}_v1_a.mp4`),
      path.join(dir, `${shot.shot_id}.mp4`),
    ].find((f) => fs.existsSync(f));
    if (existingFile) {
      const relFile = path.relative(project.dir, existingFile);
      const dur = (await ffprobe(existingFile).catch(() => null))?.duration || shot.duration_s || 8;
      const entry = { shot_id: shot.shot_id, attempt: 1, job_id: null, prompt: '', outputs: [{ file: relFile, qc: 'approved', range: { in: 0, out: dur } }], selected: relFile, range: { in: 0, out: dur } };
      byShot.set(shot.shot_id, entry);
      shot.flow_file = relFile;
      shot.asset_range = { in: 0, out: dur };
      project.write('flow_results.json', { results: [...byShot.values()] });
      return;
    }
    if (prev?.exhausted) return;
    let attempt = prev?.attempt || 0;
    let done = false;
    // A named platform without constraints from the visual director (e.g. a footage shot that fell
    // back to Flow) gets its identifying features before the first generation.
    if (shot.need?.platform && !(shot.flow?.spec?.constraints || []).length && llm && !config.testMode) {
      try {
        const constraints = await platformConstraints({ llm, config, style, platform: shot.need.platform, hardwareChecklist });
        shot.flow = { ...(shot.flow || { reconstruction: true }), spec: { ...(shot.flow?.spec || {}), constraints } };
      } catch (err) {
        project.log('flow_constraints_failed', { shot_id: shot.shot_id, error: err.message.slice(0, 200) });
      }
    }
    // What QC rejected last time is written into the next prompt, so a retry is not the same roll.
    let corrections = (prev?.outputs || []).filter((o) => o.qc === 'rejected').flatMap((o) => o.issues || []);
    while (!done && attempt < style.flow.max_attempts) {
      attempt += 1;
      const budgetMax = Math.max(project.brief?.flow_budget?.max_generations || 100, flowShots.length * 2);
      if (generations >= budgetMax) break;
      const request = flowRequest(shot, style, project, attempt, [...new Set(corrections)]);
      let urls;
      let jobId = null;
      if (config.testMode || config.flow.mode === 'synthetic') {
        const f = path.join(dir, `${shot.shot_id}_v${attempt}.mp4`);
        await syntheticFlow(f, shot.shot_id);
        urls = [f];
      } else if (config.flow.mode === 'queue') {
        const reqFile = path.join(queueDir, `${shot.shot_id}_v${attempt}.request.json`);
        const resFile = reqFile.replace('.request.json', '.result.json');
        if (!fs.existsSync(resFile)) {
          writeJson(reqFile, { ...request, project_id: project.id, shot_id: shot.shot_id, attempt, out_dir: path.relative(project.dir, dir) });
          pending += 1;
          attempt -= 1;
          break;
        }
        const r = readJson(resFile);
        jobId = r.jobId || null;
        urls = (r.files || []).map((f) => path.join(project.dir, f));
        if (r.error) project.log('flow_queue_error', { shot_id: shot.shot_id, attempt, error: r.error });
      } else if (config.flow.mode === 'direct') {
        let r;
        try {
          r = await submitAndWait(config, request);
        } catch (err) {
          console.warn(`[flow] ${shot.shot_id} attempt ${attempt} submit failed: ${err.message}`);
          if (err.message.includes('no_healthy_account') || err.message.includes('aktivitas yang tidak biasa') || err.message.includes('unusual activity') || err.message.includes('batas penggunaan')) {
            console.log(`[flow] Cooling down account pool for 60s before retry...`);
            await sleep(60000);
            attempt -= 1;
            continue;
          }
          corrections.push(`Previous generation failed: ${err.message.slice(0, 100)}. Simplify scene composition.`);
          continue;
        }
        jobId = r.jobId;
        urls = [];
        const wantedUrls = (r.urls || []).slice(0, style.flow?.count || 1);
        for (const [i, url] of wantedUrls.entries()) {
          const suffix = wantedUrls.length > 1 ? `_${'abcd'[i]}` : '';
          const f = path.join(dir, `${shot.shot_id}_v${attempt}${suffix}.mp4`);
          const isImg = Boolean(/banana/i.test(request.body?.model || '') || url.match(/\.(png|jpe?g|webp)(\?|$)/i));
          if (isImg) {
            const imgFile = path.join(dir, `${shot.shot_id}_v${attempt}${suffix}.png`);
            await fetchTo(url, imgFile);
            const duration = Math.max(3, Math.round(shot.duration_s || style.flow?.duration_s || 8));
            await convertImageToClip(imgFile, f, shot, duration);
          } else {
            await fetchTo(url, f);
          }
          urls.push(f);
        }
      } else {
        break;
      }
      generations += style.flow.count;
      const outputs = [];
      for (const file of urls) {
        const verdict = config.testMode
          ? { qc: 'approved', range: { in: 0.5, out: 7.5 }, issues: [] }
          : await qcClip({ llm, style, shot, file, prompt: request.body.prompt, hardwareChecklist, workDir: dir });
        outputs.push({ file: path.relative(project.dir, file), ...verdict });
      }
      corrections = outputs.filter((o) => o.qc === 'rejected').flatMap((o) => o.issues || []);
      const best = outputs.filter((o) => o.qc !== 'rejected').sort((a, b) => (b.range.out - b.range.in) - (a.range.out - a.range.in))[0];
      const usable = best && best.range.out - best.range.in >= Math.min(shot.duration_s, 3);
      const entry = { shot_id: shot.shot_id, attempt, job_id: jobId, prompt: request.body.prompt, outputs, selected: usable ? best.file : null, range: usable ? best.range : null };
      byShot.set(shot.shot_id, entry);
      if (usable) {
        shot.flow_file = best.file;
        shot.asset_range = best.range;
        done = true;
      }
      project.write('flow_results.json', { results: [...byShot.values()] });
    }
    if (!done && !pending && attempt >= style.flow.max_attempts) byShot.set(shot.shot_id, { ...(byShot.get(shot.shot_id) || { shot_id: shot.shot_id, outputs: [], prompt: '' }), attempt, exhausted: true });
    project.write('flow_results.json', { results: [...byShot.values()] });
  });
  project.write('flow_results.json', { results: [...byShot.values()] });
  return { shotList, pending, generations };
}

export function hardwareChecklistText(config, style) {
  const file = style.editorial?.hardware_qc ? path.join(config.root, '..', style.editorial.hardware_qc) : null;
  if (!file || !fs.existsSync(file)) return 'general physical plausibility';
  // Only the checklist sections, without the prose, to keep the vision prompt focused.
  return fs.readFileSync(file, 'utf8').split('\n').filter((l) => l.startsWith('- ') || l.startsWith('### ') || l.startsWith('| ')).join('\n').slice(0, 6000);
}

// Runs on the Mac next to the Flow API: processes queued requests of every project.
export async function runFlowQueue(config) {
  ensureDir(config.projectsDir);
  let processed = 0;
  for (const projectId of fs.readdirSync(config.projectsDir)) {
    const queueDir = path.join(config.projectsDir, projectId, 'flow_queue');
    if (!fs.existsSync(queueDir)) continue;
    for (const name of fs.readdirSync(queueDir).filter((f) => f.endsWith('.request.json')).sort()) {
      const reqFile = path.join(queueDir, name);
      const resFile = reqFile.replace('.request.json', '.result.json');
      if (fs.existsSync(resFile)) continue;
      const req = readJson(reqFile);
      try {
        const r = await submitAndWait(config, req);
        const files = [];
        for (const [i, url] of r.urls.entries()) {
          const rel = path.join(req.out_dir, `${req.shot_id}_v${req.attempt}_${'abcd'[i]}.mp4`);
          await fetchTo(url, path.join(config.projectsDir, projectId, rel));
          files.push(rel);
        }
        writeJson(resFile, { jobId: r.jobId, files });
      } catch (err) {
        writeJson(resFile, { error: err.message });
      }
      processed += 1;
    }
  }
  return processed;
}

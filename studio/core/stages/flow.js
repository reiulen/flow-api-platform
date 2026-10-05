import fs from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { z } from 'zod';
import { flowQcPrompt, houseRules } from '../prompts.js';
import { ensureDir, ffprobe, readJson, round, run, sleep, writeJson } from '../util.js';

// S7: deterministic prompt assembly from the shot spec (studio/bibles/_common/05_FLOW_PROMPT_SYSTEM.md §4).
export function buildFlowPrompt(shot, style) {
  const spec = shot.flow?.spec || {};
  const need = shot.need || {};
  const subject = [need.platform, need.subject].filter(Boolean).join(': ') || 'Atmospheric documentary establishing shot';
  const constraints = (spec.constraints || []).filter(Boolean);
  const kind = shot.flow?.reconstruction ? 'documentary reconstruction' : 'documentary establishing shot';
  const cinematic = shot.mode === 'CINEMATIC';
  const lines = [
    `${style.flow.duration_s}-second ${kind}.`,
    '',
    `${subject}${need.action ? `, ${need.action}` : ''}.${constraints.length ? ` ${constraints.map((c) => c.replace(/\.?$/, '.')).join(' ')}` : ''}`,
    '',
    `Composition: ${spec.composition || (cinematic ? 'the subject occupies a modest part of the frame with generous negative space around it' : 'clear, readable framing of the subject')}.`,
    `Camera: ${spec.camera || (cinematic ? 'very slow, completely stable movement, long lens' : 'stable, slow movement')}.`,
    `Lighting: ${spec.lighting || 'soft natural daylight, slightly overcast, light atmospheric haze'}.`,
    `Motion: ${spec.motion || 'subtle, realistic movement in the scene'}.`,
    '',
    style.flow.look,
    need.mood?.length ? `Mood: ${need.mood.join(', ')}.` : '',
    '',
    `Avoid: ${style.flow.avoid.join(', ')}.`,
  ];
  return lines.filter((l, i, arr) => !(l === '' && arr[i - 1] === '')).join('\n').trim();
}

export function flowRequest(shot, style, project, attempt) {
  return {
    idempotencyKey: `${project.id}:${shot.shot_id}:v${attempt}`,
    body: {
      prompt: buildFlowPrompt(shot, style),
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
  const res = await fetch(`${config.flow.baseUrl}${urlPath}`, {
    method,
    headers: { authorization: `Bearer ${config.flow.apiKey}`, 'content-type': 'application/json', ...headers },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok && res.status !== 202) throw new Error(`flow api ${method} ${urlPath} -> ${res.status} ${JSON.stringify(data.error || data).slice(0, 300)}`);
  return data;
}

export async function submitAndWait(config, request) {
  const created = await flowCall(config, 'POST', '/v1/videos', request.body, { 'idempotency-key': request.idempotencyKey });
  const jobId = created.data?.id;
  if (!jobId) throw new Error('flow api: no job id');
  const deadline = Date.now() + config.flow.timeoutMs;
  while (Date.now() < deadline) {
    const { data: job } = await flowCall(config, 'GET', `/v1/jobs/${jobId}`);
    if (job.state === 'completed' || job.state === 'succeeded') {
      const urls = (job.result?.items || []).map((i) => i.videoUrl || i.url).filter(Boolean);
      return { jobId, urls: urls.length ? urls : job.result?.media || [] };
    }
    if (job.state === 'failed' || job.state === 'cancelled') throw new Error(`flow job ${jobId} ${job.state}: ${JSON.stringify(job.error || {}).slice(0, 300)}`);
    if (job.state === 'action_required') throw new Error(`flow job ${jobId} needs action on the Flow account (login/captcha/credits)`);
    await sleep(config.flow.pollMs);
  }
  throw new Error(`flow job ${jobId} timed out`);
}

async function fetchTo(url, dest) {
  const res = await fetch(url);
  if (!res.ok || !res.body) throw new Error(`flow download ${res.status}`);
  await pipeline(Readable.fromWeb(res.body), fs.createWriteStream(dest));
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
    prompt: flowQcPrompt({ shot: { prompt_summary: prompt.split('\n').slice(0, 3).join(' ') }, constraints: shot.flow?.spec?.constraints || [], hardwareChecklist }),
  });
  for (const f of out) fs.rmSync(f, { force: true });
  if (res.verdict === 'rejected') return { qc: 'rejected', range: null, issues: res.issues };
  const from = Math.max(0, Math.min(0.5, res.usable_from)) * duration;
  const to = Math.max(0.5, Math.min(1, res.usable_to || 1)) * duration;
  return { qc: res.verdict, range: { in: round(from), out: round(to) }, issues: res.issues };
}

// S8: generate every FLOW shot, QC it, retry, and attach the selected clip.
export async function runFlow({ project, shotList, style, config, llm, hardwareChecklist }) {
  const dir = project.subdir('flow');
  const queueDir = project.subdir('flow_queue');
  const results = project.read('flow_results.json', undefined, { results: [] });
  const byShot = new Map(results.results.map((r) => [r.shot_id, r]));
  let pending = 0;
  let generations = results.results.reduce((n, r) => n + r.attempt, 0);

  for (const shot of shotList.shots.filter((s) => s.visual_type === 'FLOW')) {
    const prev = byShot.get(shot.shot_id);
    if (prev?.selected) { shot.flow_file = prev.selected; shot.asset_range = prev.range; continue; }
    if (prev?.exhausted) continue;
    let attempt = prev?.attempt || 0;
    let done = false;
    while (!done && attempt < style.flow.max_attempts) {
      attempt += 1;
      if (generations >= project.brief.flow_budget.max_generations) break;
      const request = flowRequest(shot, style, project, attempt);
      let urls;
      let jobId = null;
      if (config.testMode || config.flow.mode === 'synthetic') {
        const f = path.join(dir, `${shot.shot_id}_v${attempt}_a.mp4`);
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
        const r = await submitAndWait(config, request);
        jobId = r.jobId;
        urls = [];
        for (const [i, url] of r.urls.entries()) {
          const f = path.join(dir, `${shot.shot_id}_v${attempt}_${'abcd'[i]}.mp4`);
          await fetchTo(url, f);
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
      const best = outputs.filter((o) => o.qc !== 'rejected').sort((a, b) => (b.range.out - b.range.in) - (a.range.out - a.range.in))[0];
      const usable = best && best.range.out - best.range.in >= Math.min(shot.duration_s, 3);
      const entry = { shot_id: shot.shot_id, attempt, job_id: jobId, prompt: request.body.prompt, outputs, selected: usable ? best.file : null, range: usable ? best.range : null };
      byShot.set(shot.shot_id, entry);
      if (usable) {
        shot.flow_file = best.file;
        shot.asset_range = best.range;
        done = true;
      }
    }
    if (!done && !pending && attempt >= style.flow.max_attempts) byShot.set(shot.shot_id, { ...(byShot.get(shot.shot_id) || { shot_id: shot.shot_id, outputs: [], prompt: '' }), attempt, exhausted: true });
  }
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

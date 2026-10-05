// S11: deterministic ffmpeg renderer for an EDL + audio plan.
import fs from 'node:fs';
import path from 'node:path';
import { ensureDir, ffprobe, hash, mapLimit, round, run } from './util.js';

const XFADE = { dissolve_short: 'fade', dissolve: 'fade', dissolve_slow: 'fade', fade_black: 'fadeblack', match_cut: 'fade' };

// Every clip is normalized to the same canvas, rate and codec, carrying extra tail frames
// for the dissolve into the next clip.
async function normalizeClip(clip, next, edl, style, outDir, threads, preset) {
  const tail = next && next.transition_in.type !== 'cut' ? next.transition_in.dur_s : 0;
  const len = round(clip.duration_s + tail, 3);
  const key = hash({ clip: { ...clip, clip_id: undefined, start_s: undefined }, len, look: style.look, v: 3 });
  const out = path.join(outDir, `${clip.clip_id}-${key}.mp4`);
  if (fs.existsSync(out)) return { out, len };
  const { width: W, height: H, fps } = edl;
  const args = ['-y', '-v', 'error'];
  let vf;
  if (clip.kind === 'black') {
    args.push('-f', 'lavfi', '-i', `color=c=black:s=${W}x${H}:r=${fps}:d=${len}`);
    vf = 'null';
  } else if (clip.kind === 'image') {
    args.push('-loop', '1', '-framerate', String(fps), '-t', String(len), '-i', clip.src);
    const frames = Math.round(len * fps);
    const z = style.look.still_zoom;
    vf = `scale=${W * 2}:${H * 2}:force_original_aspect_ratio=increase,crop=${W * 2}:${H * 2},zoompan=z='1+${z}*on/${frames}':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=1:s=${W}x${H}:fps=${fps}`;
  } else {
    const info = await ffprobe(clip.src);
    const speed = clip.speed || 1;
    const available = Math.max(0, info.duration - clip.src_in) / speed;
    args.push('-ss', String(clip.src_in), '-t', String(round(len * speed + 0.1, 3)), '-i', clip.src);
    vf = `${speed !== 1 ? `setpts=PTS/${speed},` : ''}scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},fps=${fps}`;
    if (available < len - 0.05) vf += `,tpad=stop_mode=clone:stop_duration=${round(len - available + 0.1)}`;
  }
  const chain = [`[0:v]${vf},setsar=1${clip.look ? `,${style.look.footage_filter},${style.look.grain}` : ''},trim=duration=${len},setpts=PTS-STARTPTS,format=yuv420p[base]`];
  let last = 'base';
  clip.overlays.forEach((ov, i) => {
    args.push('-i', ov.src);
    chain.push(`[${i + 1}:v]setpts=PTS-STARTPTS+${ov.at_s}/TB[ov${i}]`, `[${last}][ov${i}]overlay=eof_action=pass:format=auto[o${i}]`);
    last = `o${i}`;
  });
  chain.push(`[${last}]format=yuv420p[v]`);
  args.push('-filter_complex', chain.join(';'), '-map', '[v]', '-an', '-r', String(fps), '-c:v', 'libx264', '-preset', preset === 'ultrafast' ? 'ultrafast' : 'veryfast', '-crf', '14', '-g', String(fps), '-pix_fmt', 'yuv420p');
  if (threads) args.push('-threads', String(threads));
  args.push(`${out}.part.mp4`);
  await run('ffmpeg', args, { timeoutMs: 30 * 60 * 1000 });
  fs.renameSync(`${out}.part.mp4`, out);
  return { out, len };
}

// Joins clips with cuts/dissolves. Groups are closed on cuts so each ffmpeg graph stays small,
// then groups are concatenated losslessly.
async function assemble(normalized, clips, edl, workDir, threads, preset, crf) {
  const groups = [];
  let cur = [];
  clips.forEach((clip, i) => {
    if (cur.length >= 24 && clip.transition_in.type === 'cut') { groups.push(cur); cur = []; }
    cur.push(i);
  });
  if (cur.length) groups.push(cur);
  const parts = [];
  for (const [gi, idx] of groups.entries()) {
    const out = path.join(workDir, `group-${String(gi).padStart(3, '0')}.mp4`);
    const args = ['-y', '-v', 'error'];
    for (const i of idx) args.push('-i', normalized[i].out);
    const chain = idx.map((_, k) => `[${k}:v]fps=${edl.fps},settb=AVTB,setpts=PTS-STARTPTS[i${k}]`);
    let label = 'i0';
    let consumed = clips[idx[0]].duration_s;
    for (let k = 1; k < idx.length; k++) {
      const clip = clips[idx[k]];
      const t = clip.transition_in;
      const outLabel = `x${k}`;
      if (t.type === 'cut' || t.dur_s <= 0) {
        chain.push(`[${label}]trim=duration=${round(consumed, 3)},setpts=PTS-STARTPTS[t${k}]`, `[t${k}][i${k}]concat=n=2:v=1:a=0,settb=AVTB[${outLabel}]`);
      } else {
        chain.push(`[${label}][i${k}]xfade=transition=${XFADE[t.type] || 'fade'}:duration=${t.dur_s}:offset=${round(consumed, 3)},settb=AVTB[${outLabel}]`);
      }
      label = outLabel;
      consumed += clip.duration_s;
    }
    chain.push(`[${label}]trim=duration=${round(consumed, 3)},setpts=PTS-STARTPTS,format=yuv420p[v]`);
    args.push('-filter_complex', chain.join(';'), '-map', '[v]', '-r', String(edl.fps), '-c:v', 'libx264', '-preset', preset, '-crf', String(crf), '-g', String(edl.fps * 2), '-pix_fmt', 'yuv420p');
    if (threads) args.push('-threads', String(threads));
    args.push(out);
    await run('ffmpeg', args, { timeoutMs: 60 * 60 * 1000 });
    parts.push(out);
  }
  const list = path.join(workDir, 'groups.txt');
  fs.writeFileSync(list, parts.map((p) => `file '${p}'`).join('\n'));
  const video = path.join(workDir, 'video.mp4');
  await run('ffmpeg', ['-y', '-v', 'error', '-f', 'concat', '-safe', '0', '-i', list, '-c', 'copy', video]);
  return video;
}

// Music gain follows the narration: bed level under VO, raised in the gaps, with ramps.
function duckExpression(regions, from, to, bedDb, breathDb, attack, release) {
  const B = 10 ** (bedDb / 20);
  const Hh = 10 ** (breathDb / 20);
  const local = regions.filter((r) => r.e + release > from && r.s - attack < to).map((r) => ({ s: round(r.s - from, 3), e: round(r.e - from, 3) }));
  if (!local.length) return `${Hh}`;
  const terms = local.map((r) => `clip((t-(${r.s}-${attack}))/${attack},0,1)*clip(((${r.e}+${release})-t)/${release},0,1)`);
  const d = terms.reduce((acc, term) => (acc ? `max(${acc},${term})` : term), '');
  return `${Hh}-(${Hh - B})*${d}`;
}

// Integrated loudness of a file (LUFS), cached by content. Silent files report null.
const loudnessCache = new Map();
export async function fileLoudness(file) {
  const st = fs.statSync(file);
  const key = `${file}:${st.size}:${st.mtimeMs}`;
  if (!loudnessCache.has(key)) {
    const { stderr } = await run('ffmpeg', ['-nostats', '-v', 'info', '-i', file, '-af', 'ebur128', '-f', 'null', '-']);
    const v = Number((stderr.slice(stderr.lastIndexOf('Summary:')).match(/I:\s+(-?[\d.]+) LUFS/) || [])[1]);
    loudnessCache.set(key, Number.isFinite(v) && v > -70 ? v : null);
  }
  return loudnessCache.get(key);
}

// Every source is first brought to a common reference level, so the style's relative levels
// (bed under VO, ambience) mean the same thing whatever the TTS engine or music track.
const REF_LUFS = -20;
async function levelGains(plan) {
  const gain = async (file, rel, clampDb) => {
    const l = await fileLoudness(file);
    if (l === null) return rel;
    return round(Math.max(-clampDb, Math.min(clampDb, REF_LUFS - l)) + rel, 2);
  };
  const files = [...new Set([...plan.vo.map((v) => v.file), ...plan.music.map((m) => m.file), ...plan.ambience.map((m) => m.file)])];
  const g = new Map();
  await mapLimit(files, 4, async (f) => { g.set(f, await gain(f, 0, 24)); });
  return (file) => g.get(file) ?? 0;
}

async function renderAudio(plan, style, workDir) {
  const a = style.audio;
  const gainOf = await levelGains(plan);
  const out = path.join(workDir, 'mix.wav');
  const args = ['-y', '-v', 'error'];
  const chain = [];
  const mixInputs = [];
  let n = 0;
  // VO
  const voLabels = [];
  for (const v of plan.vo) {
    args.push('-i', v.file);
    const ms = Math.round(v.start_s * 1000);
    chain.push(`[${n}:a]aresample=48000,aformat=channel_layouts=mono,volume=${gainOf(v.file)}dB,adelay=${ms}|${ms},apad=whole_dur=${plan.duration_s}[vo${n}]`);
    voLabels.push(`[vo${n}]`);
    n += 1;
  }
  chain.push(`${voLabels.join('')}amix=inputs=${voLabels.length}:normalize=0:duration=longest,atrim=duration=${plan.duration_s},volume=${a.vo_gain_db}dB[vo]`);
  mixInputs.push('[vo]');
  // Music cues
  const bedDb = a.bed_db_rel_vo;
  const breathDb = a.bed_db_rel_vo + a.bed_breath_boost_db;
  const musLabels = [];
  for (const m of plan.music) {
    const len = round(m.end_s - m.start_s, 3);
    args.push('-ss', String(m.src_in), '-t', String(len + 0.1), '-stream_loop', '-1', '-i', m.file);
    const lvl = gainOf(m.file);
    const expr = duckExpression(plan.vo_regions, m.start_s, m.end_s, bedDb + lvl, breathDb + lvl, a.duck_attack_s, a.duck_release_s);
    const ms = Math.round(m.start_s * 1000);
    const fade = Math.min(a.music_fade_s, len / 3);
    chain.push(`[${n}:a]aresample=48000,aformat=channel_layouts=stereo,atrim=duration=${len},asetpts=PTS-STARTPTS,afade=t=in:d=${fade},afade=t=out:st=${round(len - fade, 3)}:d=${fade},volume='${expr}':eval=frame,adelay=${ms}|${ms},apad=whole_dur=${plan.duration_s}[mu${n}]`);
    musLabels.push(`[mu${n}]`);
    n += 1;
  }
  if (musLabels.length) {
    chain.push(`${musLabels.join('')}amix=inputs=${musLabels.length}:normalize=0:duration=longest,atrim=duration=${plan.duration_s}[mus]`);
    mixInputs.push('[mus]');
  }
  // Ambience
  const ambLabels = [];
  for (const m of plan.ambience) {
    const len = round(m.end_s - m.start_s, 3);
    args.push('-stream_loop', '-1', '-t', String(len + 0.1), '-i', m.file);
    const ms = Math.round(m.start_s * 1000);
    chain.push(`[${n}:a]aresample=48000,aformat=channel_layouts=stereo,atrim=duration=${len},asetpts=PTS-STARTPTS,afade=t=in:d=0.8,afade=t=out:st=${round(Math.max(0, len - 0.8), 3)}:d=0.8,volume=${round(m.gain_db + gainOf(m.file), 2)}dB,adelay=${ms}|${ms},apad=whole_dur=${plan.duration_s}[am${n}]`);
    ambLabels.push(`[am${n}]`);
    n += 1;
  }
  if (ambLabels.length) {
    chain.push(`${ambLabels.join('')}amix=inputs=${ambLabels.length}:normalize=0:duration=longest,atrim=duration=${plan.duration_s}[amb]`);
    mixInputs.push('[amb]');
  }
  chain.push(`${mixInputs.join('')}amix=inputs=${mixInputs.length}:normalize=0:duration=longest,atrim=duration=${plan.duration_s},aformat=channel_layouts=stereo[mix]`);
  const script = path.join(workDir, 'audio.filter');
  fs.writeFileSync(script, chain.join(';\n'));
  args.push('-filter_complex_script', script, '-map', '[mix]', '-ar', '48000', '-c:a', 'pcm_s24le', out);
  await run('ffmpeg', args, { timeoutMs: 60 * 60 * 1000 });

  // Two-pass loudness normalization to the style target.
  const target = `I=${a.lufs}:TP=${a.true_peak}:LRA=11`;
  const { stderr } = await run('ffmpeg', ['-v', 'info', '-i', out, '-af', `loudnorm=${target}:print_format=json`, '-f', 'null', '-']);
  const m = JSON.parse(stderr.slice(stderr.lastIndexOf('{'), stderr.lastIndexOf('}') + 1));
  const master = path.join(workDir, 'master.wav');
  await run('ffmpeg', ['-y', '-v', 'error', '-i', out, '-af', `loudnorm=${target}:measured_I=${m.input_i}:measured_TP=${m.input_tp}:measured_LRA=${m.input_lra}:measured_thresh=${m.input_thresh}:offset=${m.target_offset}:linear=true,aresample=48000`, '-c:a', 'pcm_s24le', master]);
  return master;
}

export async function renderProject({ project, edl, audioPlan, style, config, name = 'rough' }) {
  const workDir = ensureDir(project.file('renders', 'work'));
  const clipDir = ensureDir(path.join(workDir, 'clips'));
  const normalized = await mapLimit(edl.clips, Math.max(1, config.concurrency), (clip, i) => normalizeClip(clip, edl.clips[i + 1], edl, style, clipDir, config.render.threads, config.render.preset));
  const video = await assemble(normalized, edl.clips, edl, workDir, config.render.threads, config.render.preset, config.render.crf);
  const audio = await renderAudio(audioPlan, style, workDir);
  const renders = ensureDir(project.file('renders'));
  const existing = fs.readdirSync(renders).filter((f) => f.startsWith(`${name}_v`)).length;
  const out = path.join(renders, `${name}_v${existing + 1}.mp4`);
  await run('ffmpeg', ['-y', '-v', 'error', '-i', video, '-i', audio, '-map', '0:v', '-map', '1:a', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '320k', '-shortest', '-movflags', '+faststart', out]);
  return out;
}

export async function measureLoudness(file) {
  const { stderr } = await run('ffmpeg', ['-nostats', '-v', 'info', '-i', file, '-af', 'ebur128=peak=true', '-f', 'null', '-']);
  const tail = stderr.slice(stderr.lastIndexOf('Summary:'));
  const num = (re) => Number((tail.match(re) || [])[1]);
  return { lufs: num(/I:\s+(-?[\d.]+) LUFS/), lra: num(/LRA:\s+(-?[\d.]+) LU/), true_peak: num(/Peak:\s+(-?[\d.]+) dBFS/) };
}

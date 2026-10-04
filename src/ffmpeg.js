import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { MsEdgeTTS, OUTPUT_FORMAT } from 'msedge-tts';
import { AppError } from './errors.js';

const pExec = promisify(execFile);

function resolveBinary(name) {
  const envKey = `${name.toUpperCase()}_PATH`;
  if (process.env[envKey] && fs.existsSync(process.env[envKey])) {
    return process.env[envKey];
  }
  const searchPaths = [
    name,
    `/opt/homebrew/bin/${name}`,
    `/usr/local/bin/${name}`,
    `/usr/bin/${name}`,
  ];
  for (const candidate of searchPaths) {
    if (candidate === name) continue;
    if (fs.existsSync(candidate)) return candidate;
  }
  return name;
}

const FFMPEG_BIN = resolveBinary('ffmpeg');
const FFPROBE_BIN = resolveBinary('ffprobe');

/**
 * Extract the last frame of a video file as a high-quality PNG.
 * @param {string} videoPath 
 * @param {string} outputPath 
 */
export async function extractLastFrame(videoPath, outputPath) {
  if (!fs.existsSync(videoPath)) {
    throw new AppError(404, 'file_not_found', `Video file tidak ditemukan: ${videoPath}`);
  }
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });

  try {
    // Extract true last frame: seek near EOF and stream to outputPath with -update 1
    // Without -frames:v 1, ffmpeg continually overwrites outputPath until the absolute final frame
    await pExec(FFMPEG_BIN, [
      '-y',
      '-sseof', '-0.25',
      '-i', videoPath,
      '-update', '1',
      '-q:v', '2',
      outputPath,
    ]);
  } catch {
    // Fallback seek slightly earlier if clip has sparse keyframes near the tail
    await pExec(FFMPEG_BIN, [
      '-y',
      '-sseof', '-0.75',
      '-i', videoPath,
      '-update', '1',
      '-q:v', '2',
      outputPath,
    ]);
  }

  if (!fs.existsSync(outputPath) || fs.statSync(outputPath).size === 0) {
    throw new AppError(500, 'frame_extraction_failed', `Gagal mengekstrak frame dari ${videoPath}`);
  }
  return outputPath;
}

/**
 * Retrieve metadata and duration for a video file.
 * @param {string} videoPath 
 * @returns {Promise<{ duration: number, width: number, height: number, codec: string, size: number }>}
 */
export async function getVideoInfo(videoPath) {
  if (!fs.existsSync(videoPath)) {
    throw new AppError(404, 'file_not_found', `Video file tidak ditemukan: ${videoPath}`);
  }

  const { stdout } = await pExec(FFPROBE_BIN, [
    '-v', 'error',
    '-show_entries', 'format=duration,size:stream=width,height,codec_name',
    '-of', 'json',
    videoPath,
  ]);

  const parsed = JSON.parse(stdout || '{}');
  const duration = Number.parseFloat(parsed.format?.duration ?? '0');
  const size = Number.parseInt(parsed.format?.size ?? '0', 10);
  const stream = (parsed.streams || []).find((s) => s.codec_name) || {};

  return {
    duration,
    width: stream.width ?? 0,
    height: stream.height ?? 0,
    codec: stream.codec_name ?? 'unknown',
    size,
  };
}

/**
 * Seamlessly concatenate an array of video paths into a master video file.
 * Tries fast stream-copy first (instant, 100% loss-free). Falls back to re-encoding if needed.
 * @param {string[]} videoPaths 
 * @param {string} outputPath 
 */
export async function concatenateVideos(videoPaths, outputPath, options = {}) {
  if (!videoPaths || videoPaths.length === 0) {
    throw new AppError(400, 'invalid_arguments', 'Minimal 1 file video untuk konkatenasi');
  }
  if (videoPaths.length === 1) {
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.copyFileSync(videoPaths[0], outputPath);
    return getVideoInfo(outputPath);
  }

  for (const vp of videoPaths) {
    if (!fs.existsSync(vp)) {
      throw new AppError(404, 'file_not_found', `Segmen video tidak ditemukan: ${vp}`);
    }
  }

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });

  const transition = options.transition || 'cut';
  if (transition === 'crossfade' && videoPaths.length >= 2) {
    try {
      const infos = await Promise.all(videoPaths.map((p) => getVideoInfo(p)));
      const crossDuration = Math.min(Math.max(Number(options.crossfadeDuration || 0.5), 0.2), 1.5);

      const inputs = [];
      for (const p of videoPaths) {
        inputs.push('-i', path.resolve(p));
      }

      const filterParts = [];
      let lastV = '0:v';
      let lastA = '0:a';
      let currentOffset = Math.max(0.1, infos[0].duration - crossDuration);

      for (let i = 1; i < videoPaths.length; i++) {
        const outV = `v${i}`;
        const outA = `a${i}`;
        filterParts.push(`[${lastV}][${i}:v]xfade=transition=fade:duration=${crossDuration}:offset=${currentOffset.toFixed(3)}[${outV}]`);
        filterParts.push(`[${lastA}][${i}:a]acrossfade=d=${crossDuration}[${outA}]`);
        lastV = outV;
        lastA = outA;
        if (i < videoPaths.length - 1) {
          currentOffset += Math.max(0.1, infos[i].duration - crossDuration);
        }
      }

      await pExec(FFMPEG_BIN, [
        '-y',
        ...inputs,
        '-filter_complex', filterParts.join(';'),
        '-map', `[${lastV}]`,
        '-map', `[${lastA}]`,
        '-c:v', 'libx264',
        '-pix_fmt', 'yuv420p',
        '-c:a', 'aac',
        outputPath,
      ]);

      if (fs.existsSync(outputPath) && fs.statSync(outputPath).size > 0) {
        return getVideoInfo(outputPath);
      }
    } catch {
      // Fallback to standard concat demuxer if xfade encounters divergent inputs
    }
  }

  const listFilePath = path.join(path.dirname(outputPath), `concat_list_${Date.now()}.txt`);
  const listContent = videoPaths.map((p) => `file '${path.resolve(p)}'`).join('\n');
  fs.writeFileSync(listFilePath, listContent, 'utf8');

  try {
    // 1. Fast Demuxer Concat Copy (no re-encoding, lossless, sub-second)
    await pExec(FFMPEG_BIN, [
      '-y',
      '-f', 'concat',
      '-safe', '0',
      '-i', listFilePath,
      '-c', 'copy',
      outputPath,
    ]);
  } catch (copyErr) {
    // 2. Fallback: Re-encode concat in case timebases or parameters slightly diverge
    try {
      await pExec(FFMPEG_BIN, [
        '-y',
        '-f', 'concat',
        '-safe', '0',
        '-i', listFilePath,
        '-c:v', 'libx264',
        '-pix_fmt', 'yuv420p',
        '-c:a', 'aac',
        outputPath,
      ]);
    } catch (reencodeErr) {
      throw new AppError(500, 'concat_failed', `Gagal menggabungkan segmen video: ${reencodeErr.message}`);
    }
  } finally {
    if (fs.existsSync(listFilePath)) {
      fs.unlinkSync(listFilePath);
    }
  }

  if (!fs.existsSync(outputPath) || fs.statSync(outputPath).size === 0) {
    throw new AppError(500, 'concat_failed', 'File master video tidak terbuat');
  }

  return getVideoInfo(outputPath);
}

/**
 * Download remote media (URL) directly to disk.
 * @param {string} url 
 * @param {string} destinationPath 
 */
export async function downloadMedia(url, destinationPath) {
  fs.mkdirSync(path.dirname(destinationPath), { recursive: true });
  const response = await fetch(url);
  if (!response.ok) {
    throw new AppError(502, 'download_failed', `Gagal mendownload media: HTTP ${response.status}`);
  }
  const fileStream = fs.createWriteStream(destinationPath);
  await pipeline(response.body, fileStream);
  return destinationPath;
}

/**
 * Generates ultra-realistic Neural AI Voiceover audio file (Indonesian TikTok/Shopee UGC style).
 * Uses advanced Neural AI voice synthesis (e.g. id-ID-GadisNeural / id-ID-ArdiNeural) instead of archaic robotic TTS.
 * @param {string} text
 * @param {string} outputPath
 * @param {string} voiceOrLang - 'id', 'en', or specific voice name like 'id-ID-GadisNeural'
 */
export async function generateVoiceover(text, outputPath, voiceOrLang = 'id') {
  if (!text || typeof text !== 'string') {
    throw new AppError(400, 'invalid_text', 'Teks voiceover tidak boleh kosong');
  }
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });

  const cleanText = text.replace(/["“”«»]/g, '').trim();

  // Map requested voice or language to natural neural voices
  let voiceName = 'id-ID-GadisNeural';
  if (voiceOrLang.includes('-')) {
    voiceName = voiceOrLang;
  } else if (voiceOrLang === 'id') {
    voiceName = 'id-ID-GadisNeural';
  } else if (voiceOrLang === 'id-male') {
    voiceName = 'id-ID-ArdiNeural';
  } else if (voiceOrLang === 'en') {
    voiceName = 'en-US-AvaNeural';
  } else if (voiceOrLang === 'en-male') {
    voiceName = 'en-US-AndrewNeural';
  }

  try {
    const tts = new MsEdgeTTS();
    await tts.setMetadata(voiceName, OUTPUT_FORMAT.AUDIO_24KHZ_96KBITRATE_MONO_MP3);
    const stream = tts.toStream(cleanText);
    const fileStream = fs.createWriteStream(outputPath);
    stream.audioStream.pipe(fileStream);

    await new Promise((resolve, reject) => {
      fileStream.on('finish', resolve);
      fileStream.on('error', reject);
    });

    return outputPath;
  } catch (err) {
    throw new AppError(502, 'voiceover_generation_failed', `Gagal menghasilkan suara voiceover neural AI: ${err.message}`);
  }
}

/**
 * Muxes a voiceover audio track into a video file using ffmpeg.
 * @param {string} videoPath
 * @param {string} audioPath
 * @param {string} outputPath
 */
export async function mergeAudioIntoVideo(videoPath, audioPath, outputPath) {
  if (!fs.existsSync(videoPath) || !fs.existsSync(audioPath)) {
    throw new AppError(404, 'file_not_found', 'File video atau audio tidak ditemukan untuk di-merge');
  }
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });

  await pExec(FFMPEG_BIN, [
    '-y',
    '-i', videoPath,
    '-i', audioPath,
    '-c:v', 'copy',
    '-c:a', 'aac',
    '-b:a', '192k',
    '-shortest',
    outputPath,
  ]);

  return getVideoInfo(outputPath);
}

/**
 * Prepares and reframes an initial product start frame to match the target aspect ratio,
 * ensuring the product is prominent, properly proportioned, and not letterboxed into a tiny scale by Veo.
 * @param {string} inputPath
 * @param {string} outputPath
 * @param {string} aspectRatio - '9:16' | '16:9' | '1:1'
 */
export async function prepareStartFrame(inputPath, outputPath, aspectRatio = '9:16') {
  if (!fs.existsSync(inputPath)) return inputPath;
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });

  let targetW = 720;
  let targetH = 1280;
  let fgW = 700;
  let fgH = 1240;

  if (aspectRatio === '16:9') {
    targetW = 1280;
    targetH = 720;
    fgW = 1220;
    fgH = 700;
  } else if (aspectRatio === '1:1') {
    targetW = 1080;
    targetH = 1080;
    fgW = 1040;
    fgH = 1040;
  }

  const tempOut = `${outputPath}.tmp_${Date.now()}.png`;
  try {
    // Generate blurred ambient background filling the exact canvas + prominent, centered foreground
    await pExec(FFMPEG_BIN, [
      '-y',
      '-i', inputPath,
      '-filter_complex',
      `[0:v]scale=${targetW}:${targetH}:force_original_aspect_ratio=increase,crop=${targetW}:${targetH},boxblur=25:5[bg];[0:v]scale=${fgW}:${fgH}:force_original_aspect_ratio=decrease[fg];[bg][fg]overlay=(W-w)/2:(H-h)/2`,
      tempOut,
    ]);
    if (fs.existsSync(tempOut)) {
      fs.copyFileSync(tempOut, outputPath);
      fs.unlinkSync(tempOut);
    }
  } catch (err) {
    console.warn('[prepareStartFrame] Note:', err.message);
    if (fs.existsSync(tempOut)) {
      try { fs.unlinkSync(tempOut); } catch {}
    }
  }
  return outputPath;
}



import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { AppError } from './errors.js';
import { callRpc, RPC } from './rpc.js';
import { extractLastFrame, getVideoInfo, concatenateVideos, downloadMedia, prepareStartFrame } from './ffmpeg.js';

const ORIGIN = 'https://flow.google.com';


function urls(obj) {
  const result = [];
  function walk(curr) {
    if (!curr) return;
    if (typeof curr === 'string') {
      if (curr.startsWith('http://') || curr.startsWith('https://')) result.push(curr);
      return;
    }
    if (Array.isArray(curr)) {
      for (const item of curr) walk(item);
      return;
    }
    if (typeof curr === 'object') {
      for (const val of Object.values(curr)) walk(val);
    }
  }
  walk(obj);
  return result;
}

function extractMediaIds(envelope) {
  const ids = new Set();
  function walk(node) {
    if (!node) return;
    if (typeof node === 'string') {
      const match = node.match(/media\/([a-zA-Z0-9_-]+)/);
      if (match) ids.add(match[1]);
      if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(node)) {
        ids.add(node);
      }
      return;
    }
    if (Array.isArray(node)) {
      for (const c of node) walk(c);
      return;
    }
    if (typeof node === 'object') {
      for (const v of Object.values(node)) walk(v);
    }
  }
  walk(envelope);
  return ids;
}

/**
 * Intelligently splits a single script containing multi-scene markers into individual segment prompts.
 * E.g. handles "SCENE 0–10 SECONDS: ... SCENE 10–20 SECONDS: ...", "SHOT 1: ... SHOT 2: ...", etc.
 * Preserves shared header context and shared footer (visual style / negative prompts).
 */
export function parsePromptScenes(fullText) {
  if (!fullText || typeof fullText !== 'string') return [];
  const clean = fullText.trim();

  const sceneRegex = /(?:^|\n)\s*(?:SCENE|SHOT|SEGMENT|PART|BAGIAN)\s*(?:\d+[\s–-]+\d+\s*(?:SECONDS|DETIK)?|\d+)[:\s-]/gi;
  const matches = [...clean.matchAll(sceneRegex)];

  if (matches.length < 2) {
    return [clean];
  }

  const header = clean.slice(0, matches[0].index).trim();

  // Find any common footer after the last scene (e.g. VISUAL STYLE, NEGATIVE, IMPORTANT, etc.)
  const lastMatch = matches[matches.length - 1];
  const lastSection = clean.slice(lastMatch.index + lastMatch[0].length);
  const footerRegex = /(?:^|\n)\s*(?:VISUAL STYLE|STYLE|IMPORTANT|NEGATIVE|CATATAN)[:\s-]/i;
  const footerMatch = lastSection.match(footerRegex);
  const footer = footerMatch ? lastSection.slice(footerMatch.index).trim() : '';

  const scenes = [];
  for (let i = 0; i < matches.length; i++) {
    const start = matches[i].index + matches[i][0].length;
    let end;
    if (i + 1 < matches.length) {
      end = matches[i + 1].index;
    } else {
      end = footerMatch ? (lastMatch.index + lastMatch[0].length + footerMatch.index) : clean.length;
    }
    const sceneBody = clean.slice(start, end).trim();
    const combined = [header, sceneBody, footer].filter(Boolean).join('\n\n').trim();
    scenes.push(combined);
  }

  return scenes.length > 0 ? scenes : [clean];
}

export class VideoChainEngine {
  constructor(config, store, adapter) {
    this.config = config;
    this.store = store;
    this.adapter = adapter;
  }

  calculateSegmentDurations(promptsCount, targetDuration, segmentDuration) {
    const numSegments = promptsCount > 1
      ? promptsCount
      : Math.max(2, Math.ceil(targetDuration / segmentDuration));

    const snapDuration = (val) => {
      if (val <= 5) return 4;
      if (val <= 7) return 6;
      if (val <= 9) return 8;
      return 10;
    };

    const durations = [];
    let remaining = targetDuration;
    for (let i = 0; i < numSegments; i++) {
      if (i === numSegments - 1) {
        durations.push(snapDuration(Math.min(Math.max(remaining, 4), 10)));
      } else {
        const segLen = snapDuration(Math.min(segmentDuration, remaining));
        durations.push(segLen);
        remaining = Math.max(0, remaining - segLen);
      }
    }
    return { numSegments, segmentDurations: durations };
  }

  async execute(job, account, projectId, sourcePath, page) {
    const req = job.request || {};
    const targetDuration = Math.min(Math.max(Number(req.targetDuration || 20), 8), 120);
    const segmentDuration = Math.min(Math.max(Number(req.segmentDuration || 10), 4), 10);

    let prompts = [];
    if (Array.isArray(req.prompts) && req.prompts.length > 0) {
      prompts = req.prompts.map((p) => String(p).trim()).filter(Boolean);
    } else if (req.prompt) {
      prompts = parsePromptScenes(String(req.prompt).trim());
    }
    if (prompts.length === 0) {
      throw new AppError(400, 'invalid_prompt', 'Prompt tidak boleh kosong');
    }

    // Auto-detect 9:16 aspect ratio if prompt explicitly asks for vertical/9:16
    let resolvedAspectRatio = req.aspectRatio || '16:9';
    const allPromptText = (req.prompt || prompts.join(' ')).toLowerCase();
    if (resolvedAspectRatio === '16:9' && (allPromptText.includes('9:16') || allPromptText.includes('vertical') || allPromptText.includes('portrait'))) {
      resolvedAspectRatio = '9:16';
    }

    const requestedDurations = Array.isArray(req.segmentDurations)
      ? req.segmentDurations.map(Number)
      : null;
    const hasExactDurations = requestedDurations
      && requestedDurations.length === prompts.length
      && requestedDurations.every((value) => [4, 6, 8, 10].includes(value))
      && requestedDurations.reduce((sum, value) => sum + value, 0) === targetDuration;
    const { numSegments, segmentDurations } = hasExactDurations
      ? { numSegments: requestedDurations.length, segmentDurations: requestedDurations }
      : this.calculateSegmentDurations(prompts.length, targetDuration, segmentDuration);

    while (prompts.length < numSegments) {
      prompts.push(`Continuous seamless continuation extending directly from the preceding frame, maintaining identical character, outfit, and environment: active progressive demonstration showing product in use, authentic natural movement, steady continuous handheld camera, authentic TikTok UGC aesthetic, photorealistic 4k`);
    }

    const chainDir = path.resolve(this.config.dataDir, 'chains', job.id);
    fs.mkdirSync(chainDir, { recursive: true });

    await page.goto(`${ORIGIN}${sourcePath}`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2500);

    // Dismiss any open sidebars (e.g. Creative Agent) or overlays upon loading
    const closeSidebarBtn = page.locator('button[aria-label*="Tutup" i], button[aria-label*="Close" i]').filter({ has: page.locator('mat-icon:has-text("close")') }).first();
    if (await closeSidebarBtn.isVisible().catch(() => false)) {
      await closeSidebarBtn.click().catch(() => {});
      await page.waitForTimeout(400);
    }
    const agentChip = page.locator('button.agent-mode-chip-checked, button.agent-mode-chip[aria-checked="true"]').first();
    if (await agentChip.isVisible().catch(() => false)) {
      await agentChip.click().catch(() => {});
      await page.waitForTimeout(500);
    }

    const segments = [];

    // Check if any previous segments were already downloaded and valid (Resume support)
    for (let sIdx = 0; sIdx < numSegments; sIdx++) {
      const segPath = path.join(chainDir, `segment_${sIdx}.mp4`);
      if (fs.existsSync(segPath)) {
        const segInfo = await getVideoInfo(segPath).catch(() => null);
        if (segInfo && segInfo.codec && segInfo.codec !== 'unknown' && segInfo.duration > 0.5) {
          const lastFramePath = path.join(chainDir, `frame_${sIdx}.png`);
          if (!fs.existsSync(lastFramePath) || fs.statSync(lastFramePath).size === 0) {
            await extractLastFrame(segPath, lastFramePath).catch(() => {});
          }
          segments.push({
            index: sIdx,
            url: null,
            localPath: segPath,
            lastFramePath: fs.existsSync(lastFramePath) ? lastFramePath : null,
          });
          console.log(`[VideoChainEngine] Resuming previously completed segment ${sIdx + 1}/${numSegments} from ${segPath}`);
        } else {
          break;
        }
      } else {
        break;
      }
    }

    for (let i = segments.length; i < numSegments; i++) {
      const currentDuration = segmentDurations[i];
      const currentPrompt = prompts[i];

      this.store.checkpoint(job.id, {
        phase: 'generating_segment',
        segmentIndex: i,
        totalSegments: numSegments,
        segmentDuration: currentDuration,
        completedSegments: segments.length,
      });

      if (i > 0) {
        const prevSegment = segments[i - 1];
        const lastFramePath = path.join(chainDir, `frame_${i - 1}.png`);
        if (!fs.existsSync(lastFramePath) || fs.statSync(lastFramePath).size === 0) {
          await extractLastFrame(prevSegment.localPath, lastFramePath);
        }
        prevSegment.lastFramePath = lastFramePath;

        // Unique filename to avoid any caching collision
        const uniqueUploadName = `frame_${job.id.replace(/^job_/, '').slice(0, 8)}_seg${i - 1}_${Date.now()}.png`;
        const uniqueUploadPath = path.join(chainDir, uniqueUploadName);
        fs.copyFileSync(lastFramePath, uniqueUploadPath);

        await this.adapter.clearFrameSlots(page);

        await this.adapter.applySettings(page, {
          type: 'video',
          request: {
            model: req.model || 'omni-1-1-flash',
            mode: 'frames',
            aspectRatio: resolvedAspectRatio,
            resolution: req.resolution || '720p',
            duration: currentDuration,
            count: 1,
          },
        });

        await this.adapter.setFrameSlot(page, 'start', uniqueUploadPath);

        const approvedEndFrame = req.referenceFrames?.[i];
        if (approvedEndFrame && typeof approvedEndFrame === 'string') {
          let approvedEndPath = approvedEndFrame;
          if (/^https?:\/\//.test(approvedEndFrame)) {
            approvedEndPath = path.join(chainDir, `approved_end_${i}.png`);
            await downloadMedia(approvedEndFrame, approvedEndPath);
          } else if (approvedEndFrame.startsWith('data:image/')) {
            approvedEndPath = path.join(chainDir, `approved_end_${i}.png`);
            const base64Data = approvedEndFrame.replace(/^data:image\/[^;]+;base64,/, '');
            fs.writeFileSync(approvedEndPath, Buffer.from(base64Data, 'base64'));
          }
          if (fs.existsSync(approvedEndPath)) {
            await prepareStartFrame(approvedEndPath, approvedEndPath, resolvedAspectRatio);
            await this.adapter.setFrameSlot(page, 'end', approvedEndPath);
          }
        }
      } else {
        await this.adapter.clearFrameSlots(page);
        await this.adapter.applySettings(page, {
          type: 'video',
          request: {
            model: req.model || 'omni-1-1-flash',
            mode: 'frames',
            aspectRatio: resolvedAspectRatio,
            resolution: req.resolution || '720p',
            duration: currentDuration,
            count: 1,
          },
        });
        const initialImg = req.startFrame || req.initialFrame;
        if (initialImg && typeof initialImg === 'string') {
          let resolvedInitialPath = initialImg;
          if (initialImg.startsWith('http://') || initialImg.startsWith('https://')) {
            resolvedInitialPath = path.join(chainDir, 'initial_product_frame.png');
            await downloadMedia(initialImg, resolvedInitialPath).catch(() => {});
          } else if (initialImg.startsWith('data:image/')) {
            resolvedInitialPath = path.join(chainDir, 'initial_product_frame.png');
            try {
              const base64Data = initialImg.replace(/^data:image\/\w+;base64,/, '');
              fs.writeFileSync(resolvedInitialPath, Buffer.from(base64Data, 'base64'));
            } catch (err) {
              console.warn('[VideoChainEngine] Error writing base64 initial frame:', err.message);
            }
          }
          if (fs.existsSync(resolvedInitialPath)) {
            await prepareStartFrame(resolvedInitialPath, resolvedInitialPath, resolvedAspectRatio);
            console.log(`[VideoChainEngine] Setting initial product/start frame from ${resolvedInitialPath} (framed to ${resolvedAspectRatio})`);
            await this.adapter.setFrameSlot(page, 'start', resolvedInitialPath);
          }
        }
      }

      // Add continuity instruction for segments > 0 if not already present
      let segmentPrompt = currentPrompt;
      if (i > 0 && !/continuous|seamless|continuation/i.test(segmentPrompt)) {
        segmentPrompt = `Continuous fluid camera motion extending directly from the start frame, steady movement, consistent environment and lighting, ${segmentPrompt}`;
      }

      const promptBox = page.locator('[contenteditable="true"], textarea').filter({ visible: true }).first();
      await promptBox.click().catch(() => {});
      await promptBox.fill(segmentPrompt);
      await page.waitForTimeout(400);

      const baseline = await callRpc(page, RPC.contents, [`projects/${projectId}`, null, null, null, [1]], sourcePath);
      const baselineHash = crypto.createHash('sha256').update(JSON.stringify(baseline)).digest('hex');
      const baselineUrls = urls(baseline);
      const baselineIds = extractMediaIds(baseline);

      const button = page.locator('button[aria-label*="generation" i], button[aria-label*="Start" i], button:has-text("arrow_forward")')
        .or(page.getByRole('button', { name: /start generation|start creation|mulai pembuatan|generate|create/i }))
        .filter({ visible: true })
        .first();

      // Double check trigger pill duration before clicking generate to prevent 4s fallback
      if (currentDuration && currentDuration !== 8) {
        const durCheck = new RegExp(`\\b${currentDuration}\\s*(s|dtk)\\b`, 'i');
        const trigger = page.locator('button.settings-trigger-button, button[aria-label*="Settings trigger" i]')
          .or(page.locator('button:has-text("Banana"), button:has-text("Veo"), button:has-text("Omni")'))
          .or(page.locator('form, [class*="prompt"]').locator('button').filter({ hasText: /Video|Image|Gambar/i }))
          .filter({ visible: true })
          .first();
        const activeText = (await trigger.innerText().catch(() => '')).replace(/\s+/g, ' ').trim();
        if (activeText && !durCheck.test(activeText)) {
          console.warn(`[VideoChainEngine] Trigger pill ("${activeText}") did not confirm ${currentDuration}s, reapplying settings before generation...`);
          await this.adapter.applySettings(page, {
            type: 'video',
            request: {
              model: req.model || 'omni-1-1-flash',
              mode: 'frames',
              aspectRatio: resolvedAspectRatio,
              resolution: req.resolution || '720p',
              duration: currentDuration,
              count: 1,
            },
          });
        }
      }

      // Wait patiently for generate button to be enabled (Flow validates chips, prompts & credits asynchronously)
      let isReady = false;
      for (let attempt = 0; attempt < 30; attempt++) {
        if (await button.isEnabled().catch(() => false)) {
          isReady = true;
          break;
        }
        if (attempt === 3 || attempt === 8) {
          // Trigger change detection by focusing/typing slightly
          await promptBox.click().catch(() => {});
          await page.keyboard.press('Space').catch(() => {});
          await page.keyboard.press('Backspace').catch(() => {});
        }
        await page.waitForTimeout(500);
      }

      if (!isReady) {
        const text = await page.locator('body').innerText().catch(() => '');
        if (/insufficient|not enough|habis|kredit.*0|0.*credit/i.test(text)) {
          throw new AppError(409, 'account_credits_exhausted', 'Kredit akun Flow habis');
        }
        throw new AppError(409, 'generation_not_ready', `Tombol generate belum siap untuk segmen ${i + 1}`);
      }

      await button.click();

      const segCheckpoint = {
        phase: 'submitted',
        accountId: account.id,
        projectId,
        baselineHash,
        baselineUrls,
        baselineIds: [...baselineIds],
        submittedAt: new Date().toISOString(),
      };

      const segResult = await this.adapter.waitForResult(page, { type: 'video', request: { ...req, duration: currentDuration } }, projectId, segCheckpoint);
      if (!segResult?.url) {
        throw new AppError(500, 'segment_failed', `Segmen ${i + 1} tidak menghasilkan URL video valid`);
      }

      const localVideoPath = path.join(chainDir, `segment_${i}.mp4`);
      await downloadMedia(segResult.url, localVideoPath);
      const segInfo = await getVideoInfo(localVideoPath).catch(() => ({ duration: currentDuration }));
      if (!segInfo.codec || segInfo.codec === 'unknown' || segInfo.duration < 0.5) {
        throw new AppError(500, 'invalid_video_segment', `Segmen ${i + 1} bukan file video yang valid (codec: ${segInfo.codec || 'unknown'})`);
      }

      segments.push({
        index: i,
        prompt: currentPrompt,
        duration: segInfo.duration || currentDuration,
        url: segResult.url,
        mediaId: segResult.mediaIds?.[0] || null,
        localPath: localVideoPath,
        lastFramePath: null,
      });
    }

    this.store.checkpoint(job.id, {
      phase: 'concatenating',
      totalSegments: numSegments,
      completedSegments: segments.length,
    });

    const masterPath = path.join(chainDir, 'master.mp4');
    const segmentPaths = segments.map((s) => s.localPath);
    const masterInfo = await concatenateVideos(segmentPaths, masterPath, {
      transition: req.transition || 'cut',
      crossfadeDuration: 0.5,
    });

    return {
      type: 'video_chain',
      projectId,
      masterUrl: `/v1/media/chains/${job.id}/master.mp4`,
      downloadUrl: `/v1/media/chains/${job.id}/master.mp4?download=true`,
      totalDuration: masterInfo.duration,
      targetDuration,
      segmentsCount: segments.length,
      width: masterInfo.width,
      height: masterInfo.height,
      size: masterInfo.size,
      segments: segments.map((s) => ({
        index: s.index,
        duration: s.duration,
        prompt: s.prompt,
        url: s.url,
        mediaId: s.mediaId,
        segmentUrl: `/v1/media/chains/${job.id}/segment_${s.index}.mp4`,
        lastFrameUrl: s.lastFramePath ? `/v1/media/chains/${job.id}/frame_${s.index}.png` : null,
      })),
    };
  }
}

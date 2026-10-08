import crypto from 'node:crypto';
import path from 'node:path';
import fs from 'node:fs';
import { AppError } from './errors.js';
import { callRpc, RPC } from './rpc.js';
import { extractLastFrame, getVideoInfo, concatenateVideos, downloadMedia } from './ffmpeg.js';
import { VideoChainEngine } from './chain-engine.js';

const ORIGIN = 'https://flow.google.com';
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function urls(value, out = new Set()) {
  if (typeof value === 'string' && /^https?:\/\//.test(value)) out.add(value);
  else if (Array.isArray(value)) value.forEach((item) => urls(item, out));
  else if (value && typeof value === 'object') Object.values(value).forEach((item) => urls(item, out));
  return [...out];
}

function extractMediaIds(contentsPayload) {
  const ids = new Set();
  if (!contentsPayload || !Array.isArray(contentsPayload)) return ids;
  for (const index of [1, 2, 3]) {
    const list = contentsPayload[index];
    if (Array.isArray(list)) {
      for (const item of list) {
        if (Array.isArray(item)) {
          if (typeof item[0] === 'string' && item[0].length > 10) {
            ids.add(item[0]);
          }

          if (Array.isArray(item[3])) {
            for (const sub of item[3]) {
              if (typeof sub === 'string' && /^[0-9a-f-]{36}$/i.test(sub)) {
                ids.add(sub);
              }
            }
          }
        }
      }
    }
  }
  return ids;
}

function extractMediaItems(contentsPayload) {
  const items = [];
  const seenMedia = new Set();
  if (!contentsPayload || !Array.isArray(contentsPayload)) return items;
  // Index 1 contains the cards in the project
  const list = contentsPayload[1];
  if (Array.isArray(list)) {
    for (const item of list) {
      if (Array.isArray(item) && typeof item[0] === 'string' && item[0].length > 10) {
        const itemId = item[0];
        let mediaId = itemId;
        if (Array.isArray(item[3])) {
          for (const sub of item[3]) {
            if (typeof sub === 'string' && /^[0-9a-f-]{36}$/i.test(sub) && sub !== itemId) {
              mediaId = sub;
              break;
            }
          }
        }
        if (!seenMedia.has(mediaId)) {
          seenMedia.add(mediaId);
          items.push({ itemId, mediaId, prompt: item[3]?.[0] || null });
        }
      }
    }
  }
  return items;
}

export class FlowAdapter {
  constructor(config, store, browsers) {
    this.config = config;
    this.store = store;
    this.browsers = browsers;
    this.chainEngine = new VideoChainEngine(config, store, this);
  }

  async authenticatedPage(account) {
    const page = await this.browsers.pageFor(account);
    if (!page.url().startsWith(ORIGIN)) await page.goto(ORIGIN, { waitUntil: 'domcontentloaded' });
    const login = page.url().includes('accounts.google.com') || await page.getByText(/sign in|masuk/i).first().isVisible().catch(() => false);
    if (login) throw new AppError(409, 'action_required', 'Login Google diperlukan untuk akun worker ini');
    return page;
  }

  async beginSetup(account) {
    const page = await this.browsers.pageFor(account);
    await page.goto(ORIGIN, { waitUntil: 'domcontentloaded' });
    return { accountId: account.id, state: page.url().includes('accounts.google.com') ? 'waiting_for_login' : 'ready', url: page.url() };
  }

  async setupStatus(account) {
    const page = await this.browsers.pageFor(account);
    const waiting = page.url().includes('accounts.google.com') ||
      await page.getByText(/sign in|masuk/i).first().isVisible().catch(() => false);
    return { accountId: account.id, state: waiting ? 'waiting_for_login' : 'ready', url: page.url() };
  }

  async projectId(account, page) {
    let id = account.project_id;
    if (id) {
      try {
        const check = await callRpc(page, RPC.contents, [`projects/${id}`, null, null, null, [1]], `/project/${id}`);
        if (check && Array.isArray(check) && (check[1] || check[4])) return id;
      } catch {}
    }

    try {
      const list = await callRpc(page, RPC.projects, ['projects/*', 5, null], '/');
      const items = list?.[0];
      if (Array.isArray(items) && items.length > 0) {
        const first = items[0]?.[0];
        const match = typeof first === 'string' && (first.match(/projects\/([0-9a-f-]+)/i) || first.match(/([0-9a-f-]{36})/i));
        if (match?.[1]) {
          const validId = match[1];
          this.store.setAccountProject(account.id, validId);
          return validId;
        }
      }
    } catch {}

    await page.goto(ORIGIN, { waitUntil: 'domcontentloaded' });
    const create = page.getByRole('button', { name: /new project|project baru|create project/i })
      .or(page.getByText(/new project|project baru|create project/i)).first();
    await create.click();
    await page.waitForURL(/\/project\/[0-9a-f-]+/i);
    const newId = page.url().match(/\/project\/([^/?#]+)/)?.[1];
    if (!newId) throw new AppError(502, 'project_creation_failed', 'Project ID tidak ditemukan');
    this.store.setAccountProject(account.id, newId);
    return newId;
  }

  async read(account, name, payload, sourcePath = '/') {
    const page = await this.authenticatedPage(account);
    return callRpc(page, RPC[name], payload, sourcePath);
  }

  async execute(job, account) {
    const page = await this.authenticatedPage(account);
    const binding = job.request.projectKey ? this.store.getProjectBinding(job.request.projectKey) : null;
    const projectId = job.request.projectId ?? binding?.flowProjectId ?? await this.projectId(account, page);
    const sourcePath = `/project/${projectId}`;

    if (job.checkpoint?.phase === 'submitted' && job.checkpoint?.accountId === account.id && job.checkpoint?.projectId === projectId) {
      return this.waitForResult(page, job, projectId, job.checkpoint);
    }

    if (job.type === 'video_chain') {
      return this.executeVideoChain(page, job, account, projectId, sourcePath);
    }

    await page.goto(`${ORIGIN}${sourcePath}`, { waitUntil: 'domcontentloaded' });
    const baseline = await callRpc(page, RPC.contents, [`projects/${projectId}`, null, null, null, [1]], sourcePath);
    const baselineHash = crypto.createHash('sha256').update(JSON.stringify(baseline)).digest('hex');
    const baselineUrls = urls(baseline);
    const domUrls = await page.evaluate(() => {
      const imgs = Array.from(document.querySelectorAll('img.image')).map((i) => i.src);
      const vids = Array.from(document.querySelectorAll('video, video source')).map((v) => v.src);
      return [...imgs, ...vids];
    }).catch(() => []);
    for (const u of domUrls) {
      if (u) baselineUrls.push(u);
    }
    const baselineIds = extractMediaIds(baseline);

    if (job.type === 'video_upscale') {
      const upscaleResult = await this.triggerUpscaleOnPage(page, projectId, { mediaIds: job.request.mediaId ? [job.request.mediaId] : [] }, { baselineIds, baselineUrls });
      if (upscaleResult?.url) return upscaleResult;
      throw new AppError(404, 'upscale_failed', 'Gagal memicu aksi upscale ke 1080p di Flow');
    }

    await this.applySettings(page, job);

    if (job.type === 'image' && Array.isArray(job.request.references) && job.request.references.length > 0) {
      const referencePaths = await this.materializeImageReferences(job.id, job.request.references);
      for (const referencePath of referencePaths) {
        await this.addImageReference(page, referencePath);
      }
    }

    // Dismiss any existing snackbars cleanly before starting prompt entry
    const oldSnackbar = page.locator('mat-snack-bar-container, simple-snack-bar, .error-message').first();
    if (await oldSnackbar.isVisible().catch(() => false)) {
      const dismissBtn = oldSnackbar.locator('button').first();
      if (await dismissBtn.isVisible().catch(() => false)) {
        await dismissBtn.click().catch(() => {});
      } else {
        await page.keyboard.press('Escape').catch(() => {});
      }
      await page.waitForTimeout(300);
      if (await oldSnackbar.isVisible().catch(() => false)) {
        await page.reload({ waitUntil: 'domcontentloaded' }).catch(() => {});
        await page.waitForTimeout(1000);
      }
    }

    const promptBox = page.locator('.ProseMirror, [contenteditable="true"], textarea').filter({ visible: true }).first();
    await promptBox.click().catch(() => {});
    await page.waitForTimeout(200);
    await page.keyboard.press(process.platform === 'darwin' ? 'Meta+A' : 'Control+A').catch(() => {});
    await page.keyboard.press('Backspace').catch(() => {});
    await page.waitForTimeout(100);
    await page.context().grantPermissions(['clipboard-read', 'clipboard-write']).catch(() => {});
    const copied = await page.evaluate(async (text) => {
      try {
        await navigator.clipboard.writeText(text);
        return true;
      } catch {
        return false;
      }
    }, job.request.prompt).catch(() => false);

    if (copied) {
      await promptBox.focus();
      await page.keyboard.press(process.platform === 'darwin' ? 'Meta+V' : 'Control+V');
    } else {
      await page.keyboard.insertText(job.request.prompt);
    }
    await page.waitForTimeout(1200);

    const button = page.locator('button.generate-icon-button, button[aria-label*="generation" i], button[aria-label*="Start" i], button[aria-label*="pembuatan" i], button:has-text("arrow_forward")')
      .or(page.getByRole('button', { name: /start generation|start creation|mulai pembuatan|generate|create/i }))
      .filter({ visible: true })
      .first();

    if (!await button.isEnabled().catch(() => false)) {
      const text = await page.locator('body').innerText().catch(() => '');
      if (/insufficient|not enough|habis|kredit.*0|0.*credit/i.test(text)) {
        throw new AppError(409, 'account_credits_exhausted', 'Kredit akun Flow habis');
      }
      await promptBox.press('Enter').catch(() => {});
      await page.waitForTimeout(500);
    }

    if (!await button.isEnabled().catch(() => false)) {
      // Give Angular / ProseMirror form validation up to 3 seconds to unblock
      await button.waitFor({ state: 'visible', timeout: 3000 }).catch(() => {});
    }

    if (!await button.isEnabled().catch(() => false)) {
      throw new AppError(409, 'generation_not_ready', 'Tombol generate belum siap di Flow');
    }

    await button.hover().catch(() => {});
    await page.waitForTimeout(250);
    await button.click();

    // Check immediately for any instant error snackbar (within 600ms of clicking)
    await page.waitForTimeout(600);
    const instantToast = page.locator('.cdk-overlay-container mat-snack-bar-container, .cdk-overlay-container simple-snack-bar').first();
    if (await instantToast.isVisible().catch(() => false)) {
      const errText = (await instantToast.innerText().catch(() => '')).trim();
      if (/failed|error|violate|policy|couldn't|tidak dapat|gagal|batas penggunaan|limit/i.test(errText)) {
        throw new AppError(422, 'generation_failed_by_flow', `Google Flow menolak/gagal membuat video: ${errText}`);
      }
    }
    await page.waitForTimeout(600);
    const approveBtnPre = page.locator('button:has-text("Selalu setujui"), button:has-text("Setujui"), button:has-text("Always approve"), button:has-text("Approve")').first();
    if (await approveBtnPre.isVisible().catch(() => false)) {
      await approveBtnPre.click().catch(() => {});
      await page.waitForTimeout(500);
    }
    // Dismiss or delete any preexisting failed cards on the canvas
    const oldErrorCard = page.locator('div:has-text("Failed") button:has-text("delete"), div:has-text("Failed") button:has-text("delete_forever"), div:has-text("Gagal") button:has-text("delete"), div:has-text("Gagal") button:has-text("delete_forever"), div:has-text("Gagal") button[aria-label*="delete" i], div:has-text("Failed") button[aria-label*="delete" i]').first();
    if (await oldErrorCard.isVisible().catch(() => false)) {
      await oldErrorCard.click().catch(() => {});
      await page.waitForTimeout(400);
    }
    const errorCardSelector = '[role="alert"], div:has-text("Failed"), div:has-text("Gagal"), mat-card:has-text("Failed"), mat-card:has-text("Gagal"), .error-card';
    const baselineErrorCount = await page.locator(errorCardSelector).count().catch(() => 0);
    const checkpoint = {
      phase: 'submitted',
      accountId: account.id,
      projectId,
      baselineHash,
      baselineUrls,
      baselineIds: [...baselineIds],
      baselineErrorCount,
      submittedAt: new Date().toISOString(),
    };
    this.store.checkpoint(job.id, checkpoint);
    const result = await this.waitForResult(page, { ...job, checkpoint }, projectId, checkpoint);

    // If 1080p resolution requested for video, trigger upscale
    if (job.type === 'video' && String(job.request?.resolution).toLowerCase() === '1080p') {
      try {
        const upscaled = await this.triggerUpscaleOnPage(page, projectId, result, checkpoint);
        if (upscaled?.url) {
          return {
            ...upscaled,
            baseVideoUrl: result.url,
            resolution: '1080p',
          };
        }
      } catch {}
    }
    return result;
  }

  async triggerUpscaleOnPage(page, projectId, baseResult, checkpoint) {
    const beforeIds = new Set(checkpoint?.baselineIds ?? []);
    if (baseResult?.mediaIds) {
      for (const id of baseResult.mediaIds) beforeIds.add(id);
    }

    const upscaleBtn = page.locator('button:has-text("1080p"), button[aria-label*="1080p" i], button:has-text("Upscale"), button:has-text("Tingkatkan")')
      .filter({ visible: true })
      .first();

    if (await upscaleBtn.isVisible().catch(() => false)) {
      await upscaleBtn.click().catch(() => {});
      await page.waitForTimeout(500);
    } else {
      const card = page.locator('.video-card, [data-media-id], mat-card, video').last();
      await card.hover().catch(() => {});
      await page.waitForTimeout(300);

      const moreBtn = page.locator('button[aria-label*="more" i], button:has-text("more_vert")').last();
      if (await moreBtn.isVisible().catch(() => false)) {
        await moreBtn.click().catch(() => {});
        await page.waitForTimeout(300);
        const menuItem = page.locator('[role="menuitem"], button, div, span')
          .filter({ hasText: /1080p|upscale|tingkatkan/i })
          .first();
        if (await menuItem.isVisible().catch(() => false)) {
          await menuItem.click().catch(() => {});
          await page.waitForTimeout(500);
        } else {
          await page.keyboard.press('Escape').catch(() => {});
          return null;
        }
      } else {
        return null;
      }
    }

    const upscaleCheckpoint = {
      phase: 'submitted',
      baselineIds: [...beforeIds],
      baselineUrls: checkpoint?.baselineUrls ?? [],
      baselineHash: '',
      submittedAt: new Date().toISOString(),
    };
    return this.waitForResult(page, { type: 'video', request: { ...baseResult } }, projectId, upscaleCheckpoint);
  }

  async creditSnapshot(account) {
    const raw = await this.read(account, 'credits', []);
    const first = Array.isArray(raw) && Number.isFinite(Number(raw[0])) ? Number(raw[0]) : null;
    return { remaining: first, raw };
  }

  async applySettings(page, job) {
    const request = job.request || {};
    const isVideo = job.type === 'video' || job.type === 'video_chain' || job.type === 'video_upscale' || request.type === 'video';

    // Dismiss any open sidebars (e.g. Creative Agent drawer)
    const closeSidebarBtn = page.locator('button.header-action[aria-label="Close"], button.header-action[aria-label="Tutup"], button[aria-label="Close"], button[aria-label="Tutup"]')
      .filter({ visible: true })
      .first();
    if (await closeSidebarBtn.isVisible({ timeout: 2500 }).catch(() => false)) {
      await closeSidebarBtn.click().catch(() => {});
      await page.waitForTimeout(600);
    }

    // Dismiss credit banner if open so it doesn't obstruct anything
    const closeCreditBanner = page.locator('button.credit-banner-dismiss, button[aria-label*="banner" i]').first();
    if (await closeCreditBanner.isVisible().catch(() => false)) {
      await closeCreditBanner.click().catch(() => {});
      await page.waitForTimeout(200);
    }

    // Dismiss any open popovers or lingering menus
    const openPopover = page.locator('flow-add-menu-popover-content');
    if (await openPopover.isVisible().catch(() => false)) {
      await page.keyboard.press('Escape').catch(() => {});
      await page.waitForTimeout(200);
    }

    // Turn off Agent mode chip if active so standard model & frames controls unhide
    const agentChip = page.locator('.agent-mode-chip-checked, [aria-checked="true"].agent-mode-chip, button.agent-mode-chip')
      .or(page.locator('button:has-text("Agent"), button:has-text("Agen")'))
      .filter({ visible: true })
      .first();
    if (await agentChip.isVisible({ timeout: 2000 }).catch(() => false)) {
      const isChecked = await agentChip.evaluate((el) => {
        return el.classList.contains('agent-mode-chip-checked') ||
          el.getAttribute('aria-checked') === 'true' ||
          el.getAttribute('aria-pressed') === 'true' ||
          /agent|agen/i.test(el.innerText.trim());
      }).catch(() => false);
      if (isChecked) {
        await agentChip.click().catch(() => {});
        await page.waitForTimeout(600);
      }
    }

    // Ensure prompt container is mounted before searching for settings trigger
    const promptBoxPre = page.locator('.ProseMirror, [contenteditable="true"], textarea').first();
    await promptBoxPre.waitFor({ state: 'visible', timeout: 30000 }).catch(() => {});

    const trigger = page.locator('button.settings-trigger-button, button[aria-label*="Settings trigger" i], button[aria-label*="Pemicu setelan" i]')
      .or(page.locator('button:has-text("Banana"), button:has-text("Veo"), button:has-text("Omni")'))
      .or(page.locator('form, [class*="prompt"]').locator('button').filter({ hasText: /Video|Image|Gambar/i }))
      .filter({ visible: true })
      .first();

    await trigger.waitFor({ state: 'visible', timeout: 10000 }).catch(() => {});
    if (!await trigger.isVisible().catch(() => false)) {
      // Second attempt: close drawer and click agent chip if still up
      if (await closeSidebarBtn.isVisible().catch(() => false)) {
        await closeSidebarBtn.click().catch(() => {});
        await page.waitForTimeout(600);
      }
      const retryAgent = page.locator('.agent-mode-chip, button:has-text("Agent"), button:has-text("Agen")').first();
      if (await retryAgent.isVisible().catch(() => false)) {
        await retryAgent.click().catch(() => {});
        await page.waitForTimeout(600);
      }
      if (!await trigger.isVisible().catch(() => false)) {
        console.warn('[FlowAdapter] Warning: settings trigger button not found after 15s');
        return;
      }
    }

    const settingsPanel = page.locator('flow-prompt-box-settings');
    if (!await settingsPanel.isVisible().catch(() => false)) {
      await trigger.click().catch(() => {});
      await settingsPanel.waitFor({ state: 'visible', timeout: 6000 }).catch(() => {});
      await page.waitForTimeout(200);
    }

    const selectToggle = async (pattern, timeout = 3000) => {
      const toggle = settingsPanel.locator('mat-button-toggle').filter({ hasText: pattern }).first();
      await toggle.waitFor({ state: 'visible', timeout }).catch(() => {});
      if (await toggle.count() > 0) {
        await toggle.scrollIntoViewIfNeeded().catch(() => {});
        const isChecked = await toggle.evaluate((el) => {
          const btn = el.querySelector('button');
          return el.classList.contains('mat-button-toggle-checked') ||
            el.getAttribute('aria-checked') === 'true' ||
            btn?.getAttribute('aria-checked') === 'true' ||
            btn?.getAttribute('aria-pressed') === 'true';
        }).catch(() => false);
        if (!isChecked) {
          const innerBtn = toggle.locator('button').first();
          await innerBtn.scrollIntoViewIfNeeded().catch(() => {});
          if (await innerBtn.count() > 0) {
            await innerBtn.click().catch(() => toggle.click());
          } else {
            await toggle.click().catch(() => {});
          }
          await page.waitForTimeout(300);
        }
        return true;
      }
      return false;
    };

    // 1. Tab: Video vs Image (Gambar)
    if (isVideo) {
      await selectToggle(/videocam\s*Video|Video/i);
    } else {
      await selectToggle(/image\s*(Image|Gambar)|Image|Gambar/i);
    }

    // Determine target duration for video
    let targetDuration = null;
    if (isVideo) {
      if (request.duration != null) {
        const d = Number(request.duration);
        targetDuration = d <= 5 ? 4 : d <= 7 ? 6 : d <= 9 ? 8 : 10;
      } else {
        targetDuration = 8;
      }
    }

    // 2. Select Model FIRST (so model-specific controls like duration & resolution mount)
    let targetPattern = null;
    if (isVideo) {
      const modelLower = (request.model || '').toLowerCase();
      // Veo models are hardcoded to 8s in Flow. If a custom duration (4, 6, 10) was requested, we MUST use Omni 1.1 Flash.
      if (targetDuration !== 8) {
        targetPattern = /Omni 1\.1 Flash/i;
      } else if (modelLower.includes('fast')) {
        targetPattern = /Veo 3\.1 - Fast/i;
      } else if (modelLower.includes('quality')) {
        targetPattern = /Veo 3\.1 - Quality/i;
      } else if (modelLower.includes('veo') && modelLower.includes('lite')) {
        targetPattern = /Veo 3\.1 - Lite(?!\s*\[)/i;
      } else {
        targetPattern = /Omni 1\.1 Flash/i;
      }
    } else if (request.model) {
      const modelLower = request.model.toLowerCase();
      if (modelLower.includes('lite') && (modelLower.includes('banana') || modelLower.includes('harbor'))) {
        targetPattern = /Nano Banana 2 Lite/i;
      } else if (modelLower.includes('pro') && (modelLower.includes('banana') || modelLower.includes('nano_banana'))) {
        targetPattern = /Nano Banana Pro/i;
      } else if (modelLower.includes('banana') || modelLower.includes('narwhal')) {
        targetPattern = /Nano Banana 2(?!\s*Lite)/i;
      }
    }

    if (targetPattern) {
      const modelBtn = settingsPanel.locator('button:has-text("arrow_drop_down")').filter({ visible: true }).first();
      if (await modelBtn.isVisible().catch(() => false)) {
        const currentText = await modelBtn.innerText().catch(() => '');
        if (!targetPattern.test(currentText)) {
          await modelBtn.click().catch(() => {});
          await page.waitForTimeout(400);
          const option = page.locator('.mat-mdc-menu-panel [role="menuitem"], mat-menu-panel [role="menuitem"], [role="menu"] [role="menuitem"]')
            .filter({ hasText: targetPattern })
            .filter({ visible: true })
            .first();
          if (await option.isVisible().catch(() => false)) {
            await option.click().catch(() => {});
            await page.waitForTimeout(500); // Allow menu to close & model toggles to mount
          } else {
            await page.keyboard.press('Escape').catch(() => {});
            await page.waitForTimeout(200);
          }
        }
      }
    }

    // If Omni 1.1 Flash is active for video, ensure the duration controls are mounted
    if (isVideo && targetPattern && /Omni 1\.1 Flash/i.test(targetPattern.source)) {
      await settingsPanel.locator('mat-button-toggle').filter({ hasText: /\b(4s|6s|8s|10s|4 dtk|6 dtk|8 dtk|10 dtk)\b/i }).first().waitFor({ timeout: 2500 }).catch(() => {});
    }

    // 3. Submode: Frame vs Ingredients / Bahan (for video)
    if (isVideo && request.mode) {
      const mode = request.mode.toLowerCase();
      if (mode === 'ingredients' || mode === 'bahan') {
        await selectToggle(/chrome_extension\s*Ingredients|Ingredients|Bahan/i);
      } else {
        await selectToggle(/crop_free\s*Frames|Frames|Frame/i);
      }
    }

    // 4. Aspect ratio (16:9, 9:16, 1:1, 4:3, 3:4)
    if (request.aspectRatio) {
      let ratioText = request.aspectRatio;
      if (ratioText === 'landscape') ratioText = '16:9';
      if (ratioText === 'portrait') ratioText = '9:16';
      const cleanRatio = ratioText.replace(':', '\\:');
      await selectToggle(new RegExp(`(${cleanRatio})`, 'i'));
    }

    // 5. Resolution (Omni 1.1 Flash: 720p, 360p, or fallback 720p for 1080p upscale)
    if (isVideo && request.resolution) {
      const is1080p = String(request.resolution).toLowerCase() === '1080p';
      const targetRes = is1080p ? '720p' : request.resolution;
      await selectToggle(new RegExp(`^${targetRes}$|\\b${targetRes}\\b`, 'i'));
    }

    // 6. Duration (Omni 1.1 Flash: 4s, 6s, 8s, 10s or Indonesian 4 dtk, etc.)
    if (isVideo && targetDuration != null) {
      const durPattern = new RegExp(`^\\s*${targetDuration}\\s*(s|dtk)?\\s*$|\\b${targetDuration}\\s*(s|dtk)\\b`, 'i');
      await selectToggle(durPattern);
    }

    // 7. Output count (x1, x2, x3, x4)
    if (request.count != null) {
      await selectToggle(new RegExp(`^x${request.count}$`, 'i'));
    }

    // Close settings overlay if still open
    if (await settingsPanel.isVisible().catch(() => false)) {
      await page.keyboard.press('Escape').catch(() => {});
      await page.waitForTimeout(300);
    }

    // 8. Assertive Verification & Auto-Correction via Trigger Pill
    let triggerText = (await trigger.innerText().catch(() => '')).replace(/\s+/g, ' ').trim();

    // Verify Video mode
    if (isVideo && !/video/i.test(triggerText)) {
      if (!await settingsPanel.isVisible().catch(() => false)) {
        await trigger.click().catch(() => {});
        await page.waitForTimeout(300);
      }
      await selectToggle(/videocam\s*Video|Video/i);
      await page.keyboard.press('Escape').catch(() => {});
      await page.waitForTimeout(300);
      triggerText = (await trigger.innerText().catch(() => '')).replace(/\s+/g, ' ').trim();
    }

    // Verify Duration
    if (isVideo && targetDuration != null) {
      const durRegex = new RegExp(`\\b${targetDuration}\\s*(s|dtk)\\b`, 'i');
      if (!durRegex.test(triggerText)) {
        // Auto-recovery: Re-open settings panel if closed, ensure Omni 1.1 Flash is selected, and re-click duration
        if (!await settingsPanel.isVisible().catch(() => false)) {
          await trigger.click().catch(() => {});
          await page.waitForTimeout(300);
        }

        const mBtn = settingsPanel.locator('button:has-text("arrow_drop_down")').filter({ visible: true }).first();
        if (await mBtn.isVisible().catch(() => false)) {
          const curText = await mBtn.innerText().catch(() => '');
          if (!/Omni 1\.1 Flash/i.test(curText)) {
            await mBtn.click().catch(() => {});
            await page.waitForTimeout(400);
            const opt = page.locator('.mat-mdc-menu-panel [role="menuitem"], mat-menu-panel [role="menuitem"], [role="menu"] [role="menuitem"]')
              .filter({ hasText: /Omni 1\.1 Flash/i })
              .filter({ visible: true })
              .first();
            if (await opt.isVisible().catch(() => false)) {
              await opt.click().catch(() => {});
              await page.waitForTimeout(500);
            }
          }
        }

        await settingsPanel.locator('mat-button-toggle').filter({ hasText: /\b(4s|6s|8s|10s|4 dtk|6 dtk|8 dtk|10 dtk)\b/i }).first().waitFor({ timeout: 2500 }).catch(() => {});

        const durPattern = new RegExp(`^\\s*${targetDuration}\\s*(s|dtk)?\\s*$|\\b${targetDuration}\\s*(s|dtk)\\b`, 'i');
        await selectToggle(durPattern);
        await page.keyboard.press('Escape').catch(() => {});
        await page.waitForTimeout(300);

        triggerText = (await trigger.innerText().catch(() => '')).replace(/\s+/g, ' ').trim();
        if (!durRegex.test(triggerText)) {
          console.warn(`[FlowAdapter] Warning: target duration ${targetDuration}s not confirmed in trigger pill ("${triggerText}"), proceeding.`);
        }
      }
    }

    // Verify Resolution
    if (isVideo && request.resolution) {
      const is1080p = String(request.resolution).toLowerCase() === '1080p';
      const targetRes = is1080p ? '720p' : request.resolution;
      const resRegex = new RegExp(`\\b${targetRes}\\b`, 'i');
      if (!resRegex.test(triggerText)) {
        if (!await settingsPanel.isVisible().catch(() => false)) {
          await trigger.click().catch(() => {});
          await page.waitForTimeout(300);
        }
        await selectToggle(new RegExp(`^${targetRes}$|\\b${targetRes}\\b`, 'i'));
        await page.keyboard.press('Escape').catch(() => {});
        await page.waitForTimeout(300);
      }
    }

    // Verify Count
    if (request.count != null) {
      const countRegex = new RegExp(`\\bx${request.count}\\b`, 'i');
      if (!countRegex.test(triggerText)) {
        if (!await settingsPanel.isVisible().catch(() => false)) {
          await trigger.click().catch(() => {});
          await page.waitForTimeout(300);
        }
        await selectToggle(new RegExp(`^x${request.count}$`, 'i'));
        await page.keyboard.press('Escape').catch(() => {});
        await page.waitForTimeout(300);
      }
    }
  }

  async waitForResult(page, job, projectId, checkpoint) {
    const maxWaitMs = job.type === 'image' ? 90_000 : this.config.jobTimeoutMs;
    const deadline = Date.now() + maxWaitMs;
    const sourcePath = `/project/${projectId}`;
    const beforeHash = checkpoint.baselineHash;
    const beforeIds = new Set(checkpoint.baselineIds ?? []);
    const oldUrls = new Set(checkpoint.baselineUrls ?? []);
    const pollInterval = Math.min(this.config.pollIntervalMs, 3000);

    while (Date.now() < deadline) {
      await sleep(pollInterval);

      // Auto-approve agent prompt if it appears during execution
      const approveBtn = page.locator('button:has-text("Selalu setujui"), button:has-text("Setujui"), button:has-text("Always approve"), button:has-text("Approve")').first();
      if (await approveBtn.isVisible().catch(() => false)) {
        await approveBtn.click().catch(() => {});
      }

      // Immediate detection of Flow error toasts or safety policy rejections in CDK overlay
      const errorToast = page.locator('.cdk-overlay-container mat-snack-bar-container, .cdk-overlay-container simple-snack-bar').first();
      if (await errorToast.isVisible().catch(() => false)) {
        const errorText = (await errorToast.innerText().catch(() => '')).trim();
        if (/failed|error|violate|policy|couldn't|tidak dapat|gagal/i.test(errorText)) {
          const dismissBtn = errorToast.locator('button').first();
          if (await dismissBtn.isVisible().catch(() => false)) {
            await dismissBtn.click().catch(() => {});
          } else {
            await page.keyboard.press('Escape').catch(() => {});
          }
          await page.screenshot({ path: '/Users/reihanpraja/.gemini/antigravity-ide/brain/cff15285-550f-4c93-a2a4-ef71dcfe3172/scratch/latest_flow_error.png' }).catch(() => {});
          throw new AppError(422, 'generation_failed_by_flow', `Google Flow menolak/gagal membuat video: ${errorText}`);
        }
      }

      // Detection of newly appeared error cards or usage limit banners appearing on the canvas
      const errorCardSelector = '[role="alert"], div:has-text("Failed"), div:has-text("Gagal"), mat-card:has-text("Failed"), mat-card:has-text("Gagal"), .error-card';
      const errorCards = page.locator(errorCardSelector);
      const errCount = await errorCards.count().catch(() => 0);
      if (errCount > (checkpoint.baselineErrorCount || 0)) {
        const latestCard = errorCards.first();
        const errText = (await latestCard.innerText().catch(() => '')).trim();
        if (/failed|error|violate|policy|couldn't|tidak dapat|gagal|batas penggunaan|limit|unusual activity|aktivitas yang tidak biasa|usage limit|try again later/i.test(errText)) {
          await page.screenshot({ path: '/Users/reihanpraja/.gemini/antigravity-ide/brain/cff15285-550f-4c93-a2a4-ef71dcfe3172/scratch/latest_flow_error.png' }).catch(() => {});
          const isLimit = /batas penggunaan|limit|try again later|usage limit/i.test(errText);
          throw new AppError(isLimit ? 429 : 422, isLimit ? 'rate_limit_exceeded' : 'generation_failed_by_flow', `Google Flow menolak/gagal membuat video: ${errText}`);
        }
      }

      let current;
      try {
        current = await callRpc(page, RPC.contents, [`projects/${projectId}`, null, null, null, [1]], sourcePath);
      } catch {
        continue;
      }
      if (!current) continue;

      const currentItems = extractMediaItems(current);
      const newItems = currentItems.filter((it) => !beforeIds.has(it.itemId) && !beforeIds.has(it.mediaId));
      const currentIds = extractMediaIds(current);
      const newIds = [...currentIds].filter((id) => !beforeIds.has(id));

      if (newItems.length > 0 || newIds.length > 0) {
        const publicUrls = [];
        const mediaItems = [];
        const isVideo = job.type === 'video' || job.type === 'video_chain' || job.type === 'video_upscale';

        const maxWanted = Math.max(1, Number(job.request?.count) || 1);
        const rawCandidates = newItems.length > 0 ? newItems : newIds.map((id) => ({ itemId: id, mediaId: id }));
        const candidateItems = rawCandidates.slice(0, maxWanted);
        const seenCleanUrls = new Set();

        for (const item of candidateItems) {
          try {
            let mediaData = await callRpc(page, RPC.media, [item.mediaId], sourcePath);
            if (!mediaData || (Array.isArray(mediaData) && mediaData.length === 0)) {
              if (item.itemId !== item.mediaId) {
                mediaData = await callRpc(page, RPC.media, [item.itemId], sourcePath);
              }
            }
            const allUrls = urls(mediaData);
            const foundUrls = allUrls.filter((u) => /flow-content\.google|flow\.google\.com\/asb|googleusercontent\.com/i.test(u));
            const candidateUrls = foundUrls.length ? foundUrls : allUrls.filter((u) => !/accounts\.google|gstatic\.com\/favicon/i.test(u));
            if (candidateUrls.length) {
              const videoUrls = candidateUrls.filter((u) => /video\//i.test(u) || /\.mp4/i.test(u));
              const imageUrls = candidateUrls.filter((u) => /image\//i.test(u) || /\/asb\//i.test(u) || /\.(png|jpe?g|webp)/i.test(u));

              if (isVideo && videoUrls.length === 0) {
                // Video is still rendering (only thumbnail image is available so far). Continue waiting!
                continue;
              }

              const primaryUrl = isVideo ? videoUrls[0] : (imageUrls[0] || candidateUrls[0]);
              if (!primaryUrl) continue;

              const cleanUrl = primaryUrl.split('?')[0];
              if (seenCleanUrls.has(cleanUrl)) continue;
              seenCleanUrls.add(cleanUrl);

              publicUrls.push(primaryUrl);
              mediaItems.push({
                id: item.itemId,
                mediaId: item.mediaId,
                type: isVideo ? 'video' : 'image',
                url: primaryUrl,
                ...(videoUrls[0] ? { videoUrl: videoUrls[0] } : {}),
                ...(imageUrls[0] ? { thumbnailUrl: imageUrls[0] } : {}),
              });
            }
          } catch {}
        }

        // DOM image fallback if RPC.media did not return URLs but image is visible on page
        if (publicUrls.length === 0 && !isVideo) {
          const domNewUrls = await page.evaluate(() => {
            return Array.from(document.querySelectorAll('img.image, img'))
              .map((i) => i.src)
              .filter((s) => /flow\.google\.com\/asb|googleusercontent\.com|flow-content\.google/i.test(s));
          }).catch(() => []);
          for (const dUrl of domNewUrls) {
            if (dUrl && !oldUrls.has(dUrl)) {
              publicUrls.push(dUrl);
              mediaItems.push({
                id: candidateItems[0]?.itemId || 'dom-image',
                type: 'image',
                url: dUrl,
              });
            }
          }
        }

        if (publicUrls.length > 0) {
          const uniqueUrls = [...new Set(publicUrls)];
          return {
            projectId,
            type: job.type,
            url: uniqueUrls[0],
            media: uniqueUrls,
            items: mediaItems,
            mediaIds: newIds,
          };
        }
      }
    }
    await page.screenshot({ path: '/Users/reihanpraja/.gemini/antigravity-ide/brain/cff15285-550f-4c93-a2a4-ef71dcfe3172/scratch/timeout_screen.png' }).catch(() => {});
    throw new AppError(504, 'generation_timeout', 'Generation belum selesai sebelum timeout');
  }

  async setFrameSlot(page, slotType = 'start', imagePath) {
    if (!fs.existsSync(imagePath)) {
      throw new AppError(404, 'file_not_found', `Gambar frame tidak ditemukan: ${imagePath}`);
    }

    const filename = path.basename(imagePath);
    const slotIdx = String(slotType).toLowerCase() === 'end' ? 1 : 0;

    // Clean up any lingering popover or open settings modal first
    const openPopover = page.locator('flow-add-menu-popover-content');
    if (await openPopover.isVisible().catch(() => false)) {
      await page.keyboard.press('Escape').catch(() => {});
      await page.waitForTimeout(300);
    }

    const triggers = page.locator('.frame-trigger');
    let trigger = triggers.nth(slotIdx);

    if (!await trigger.isVisible({ timeout: 4000 }).catch(() => false)) {
      console.warn('[FlowAdapter] Frame trigger not visible immediately, checking settings and ensuring Frames mode...');
      await this.applySettings(page, {
        type: 'video',
        request: { mode: 'frames', model: 'omni-1-1-flash' },
      });
      trigger = page.locator('.frame-trigger').nth(slotIdx);
    }

    if (!await trigger.isVisible({ timeout: 8000 }).catch(() => false)) {
      throw new AppError(400, 'frame_trigger_not_found', `Slot frame '${slotType}' tidak ditemukan di Flow`);
    }

    await trigger.scrollIntoViewIfNeeded().catch(() => {});
    await trigger.click();
    await page.waitForTimeout(600);

    const uploadBtnSelector = 'button.sidebar-upload-btn, button:has-text("Upload media"), button:has-text("Unggah media"), button:has-text("Upload"), button:has-text("Unggah"), button[aria-label*="upload" i]';
    let uploadBtn = page.locator(uploadBtnSelector).filter({ visible: true }).first();

    // If upload button didn't appear, try re-clicking trigger once
    if (!await uploadBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await trigger.click().catch(() => {});
      await page.waitForTimeout(600);
      uploadBtn = page.locator(uploadBtnSelector).filter({ visible: true }).first();
    }

    if (await uploadBtn.isVisible({ timeout: 4000 }).catch(() => false)) {
      const [fileChooser] = await Promise.all([
        page.waitForEvent('filechooser', { timeout: 15000 }),
        uploadBtn.click(),
      ]);
      await fileChooser.setFiles(imagePath);
    } else {
      // Fallback: search for direct file input in DOM
      const fileInput = page.locator('input[type="file"]').first();
      if (await fileInput.count() > 0) {
        await fileInput.setInputFiles(imagePath);
      } else {
        throw new AppError(500, 'upload_button_not_found', 'Tombol Upload media tidak ditemukan di Flow');
      }
    }

    const agreeBtn = page.locator('button:has-text("I agree"), button:has-text("Saya setuju"), button:has-text("Agree")').first();
    if (await agreeBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await agreeBtn.click().catch(() => {});
      await page.waitForTimeout(500);
    }

    const popover = page.locator('flow-add-menu-popover-content');
    await popover.waitFor({ state: 'visible', timeout: 10000 });

    // The newly uploaded asset is at the top of the asset grid in popover; match by short prefix or fallback to first
    const filenamePrefix = filename.replace(/\.png$/i, '').slice(0, 10);
    let targetItem = popover.locator('.asset-item-container').filter({ hasText: filenamePrefix }).first();
    if (!await targetItem.isVisible({ timeout: 4000 }).catch(() => false)) {
      targetItem = popover.locator('.asset-item-container').first();
    }
    await targetItem.waitFor({ state: 'visible', timeout: 20000 });

    // Wait for the thumbnail image to be rendered inside targetItem (signals upload & server processing completed)
    const targetThumbnail = targetItem.locator('.asset-thumbnail-image');
    await targetThumbnail.waitFor({ state: 'visible', timeout: 25000 }).catch(() => {});

    // Click "Add to prompt" if already available, or select uploaded asset first
    const addBtn = popover.locator('button.detail-add-to-prompt-btn, button:has-text("Add to prompt"), button:has-text("Tambahkan ke perintah")').first();
    const canAddImmediately = await addBtn.isEnabled().catch(() => false);
    if (!canAddImmediately) {
      const targetBtn = targetItem.locator('button.asset-item').first();
      await targetBtn.click().catch(() => {});
      await page.waitForTimeout(400);
    }

    await addBtn.waitFor({ state: 'visible', timeout: 10000 });
    await addBtn.click();
    await page.waitForTimeout(1000);

    // Close popover if still visible so it doesn't obscure the prompt or generate button
    if (await popover.isVisible().catch(() => false)) {
      await page.keyboard.press('Escape').catch(() => {});
      await page.waitForTimeout(300);
    }

    // Verify trigger or prompt box now holds the chip
    const hasImage = await trigger.locator('img, .chip-image, flow-image-ingredient-chip').first().isVisible({ timeout: 6000 }).catch(() => false);
    if (!hasImage) {
      const chipInBox = await page.locator('flow-prompt-box flow-image-ingredient-chip, .frame-trigger img').first().isVisible({ timeout: 4000 }).catch(() => false);
      if (!chipInBox) {
        throw new AppError(500, 'frame_pin_failed', `Gagal menyematkan frame ${slotType} (${filename}) ke dalam prompt`);
      }
    }
  }

  async materializeImageReferences(jobId, references) {
    const referenceDir = path.resolve(this.config.dataDir, 'references', jobId);
    fs.mkdirSync(referenceDir, { recursive: true });
    const paths = [];
    for (const [index, reference] of references.filter(Boolean).slice(0, 4).entries()) {
      const outputPath = path.join(referenceDir, `reference_${index}.png`);
      if (reference.startsWith('data:image/')) {
        const match = reference.match(/^data:image\/[a-zA-Z0-9.+-]+;base64,(.+)$/s);
        if (!match) throw new AppError(400, 'invalid_image_reference', `Referensi gambar ${index + 1} tidak valid`);
        fs.writeFileSync(outputPath, Buffer.from(match[1], 'base64'));
      } else if (/^https?:\/\//i.test(reference)) {
        await downloadMedia(reference, outputPath);
      } else if (fs.existsSync(reference)) {
        fs.copyFileSync(reference, outputPath);
      } else {
        throw new AppError(400, 'invalid_image_reference', `Referensi gambar ${index + 1} tidak dapat dibaca`);
      }
      if (fs.statSync(outputPath).size === 0) {
        throw new AppError(400, 'invalid_image_reference', `Referensi gambar ${index + 1} kosong`);
      }
      paths.push(outputPath);
    }
    return paths;
  }

  async addImageReference(page, imagePath) {
    const promptBox = page.locator('flow-prompt-box').first();
    const addIcon = promptBox.locator('mat-icon').filter({ hasText: /^(add|add_photo_alternate)$/i });
    const addButton = promptBox.locator(
      'button[aria-label*="add" i], button[aria-label*="media" i], button[aria-label*="upload" i]'
    ).or(promptBox.locator('button').filter({ has: addIcon })).filter({ visible: true }).first();
    if (!await addButton.isVisible({ timeout: 5000 }).catch(() => false)) {
      throw new AppError(500, 'image_reference_button_not_found', 'Tombol penambahan referensi gambar tidak ditemukan di Flow');
    }
    await addButton.click();
    await page.waitForTimeout(400);

    const uploadButton = page.locator(
      'button.sidebar-upload-btn, button:has-text("Upload media"), button:has-text("Unggah media"), button:has-text("Upload"), button:has-text("Unggah"), button[aria-label*="upload" i]'
    ).filter({ visible: true }).first();
    if (!await uploadButton.isVisible({ timeout: 5000 }).catch(() => false)) {
      throw new AppError(500, 'upload_button_not_found', 'Tombol unggah referensi tidak ditemukan di Flow');
    }
    const [fileChooser] = await Promise.all([
      page.waitForEvent('filechooser', { timeout: 15000 }),
      uploadButton.click(),
    ]);
    await fileChooser.setFiles(imagePath);

    const agreeButton = page.locator('button:has-text("I agree"), button:has-text("Saya setuju"), button:has-text("Agree")').first();
    if (await agreeButton.isVisible({ timeout: 3000 }).catch(() => false)) {
      await agreeButton.click();
    }

    const popover = page.locator('flow-add-menu-popover-content');
    await popover.waitFor({ state: 'visible', timeout: 15000 });
    const asset = popover.locator('.asset-item-container').first();
    await asset.waitFor({ state: 'visible', timeout: 25000 });
    await asset.locator('.asset-thumbnail-image').waitFor({ state: 'visible', timeout: 25000 }).catch(() => {});
    const addToPrompt = popover.locator('button.detail-add-to-prompt-btn, button:has-text("Add to prompt"), button:has-text("Tambahkan ke perintah")').first();
    if (!await addToPrompt.isEnabled().catch(() => false)) {
      await asset.locator('button.asset-item').first().click().catch(() => asset.click());
      await page.waitForTimeout(300);
    }
    await addToPrompt.waitFor({ state: 'visible', timeout: 10000 });
    await addToPrompt.click();
    await page.waitForTimeout(500);
    if (await popover.isVisible().catch(() => false)) await page.keyboard.press('Escape').catch(() => {});

    const chips = page.locator('flow-prompt-box flow-image-ingredient-chip');
    if ((await chips.count().catch(() => 0)) === 0) {
      throw new AppError(500, 'image_reference_pin_failed', 'Referensi produk gagal ditambahkan ke prompt Nano Banana');
    }
  }

  async clearFrameSlots(page) {
    const chips = page.locator('flow-prompt-box flow-image-ingredient-chip');
    const count = await chips.count().catch(() => 0);
    for (let i = 0; i < count; i++) {
      const chip = chips.nth(0);
      if (await chip.isVisible().catch(() => false)) {
        await chip.hover().catch(() => {});
        await page.waitForTimeout(200);
        const cancelBtn = chip.locator('.hover-icon-overlay, mat-icon:has-text("cancel"), mat-icon:has-text("close")').first();
        if (await cancelBtn.isVisible().catch(() => false)) {
          await cancelBtn.click({ force: true }).catch(() => {});
        } else {
          await chip.click({ force: true }).catch(() => {});
        }
        await page.waitForTimeout(300);
      }
    }

    const frameDeleteBtns = page.locator('.frame-trigger button, .frame-trigger mat-icon:has-text("cancel"), .frame-trigger mat-icon:has-text("close"), .frame-trigger [aria-label*="Hapus" i], .frame-trigger [aria-label*="Delete" i]');
    const fCount = await frameDeleteBtns.count().catch(() => 0);
    for (let i = 0; i < fCount; i++) {
      const btn = frameDeleteBtns.nth(0);
      if (await btn.isVisible().catch(() => false)) {
        await btn.click({ force: true }).catch(() => {});
        await page.waitForTimeout(300);
      }
    }
  }

  async executeVideoChain(page, job, account, projectId, sourcePath) {
    return this.chainEngine.execute(job, account, projectId, sourcePath, page);
  }
}

function escapeRegExp(value) { return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

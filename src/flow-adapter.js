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

function isFlowMediaUrl(u) {
  if (typeof u !== 'string') return false;
  if (/ogw|googleusercontent\.com\/a[/-]|gstatic\.com|favicon|accounts\.google|profile|avatar|\.gif/i.test(u)) return false;
  return /flow\.google\.com\/asb\/|googleusercontent\.com\/asb\/|flow-content\.google/i.test(u);
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

  async importCookiesAndVerify(account, cookiesInput) {
    const count = await this.browsers.importCookies(account, cookiesInput);
    const page = await this.browsers.pageFor(account);
    await page.goto(ORIGIN, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForTimeout(2000);

    const isLogin = page.url().includes('accounts.google.com') ||
      await page.getByText(/sign in|masuk/i).first().isVisible({ timeout: 4000 }).catch(() => false);

    if (isLogin) {
      this.store.markAccount(account.id, 'action_required', 0);
      return {
        success: false,
        state: 'action_required',
        importedCount: count,
        message: 'Cookies berhasil dimasukkan tetapi halaman Flow meminta login. Pastikan cookies disalin saat status akun sedang aktif login di flow.google.com.',
        url: page.url(),
      };
    }

    let projId = account.project_id || null;
    try {
      projId = await this.projectId(account, page);
    } catch (e) {
      console.warn('[FlowAdapter] Failed to resolve project ID on cookie import:', e.message);
    }

    let credits = null;
    try {
      credits = await this.creditSnapshot(account);
      if (credits?.remaining !== null && credits?.remaining !== undefined) {
        this.store.updateCredits(account.id, credits.remaining, credits.raw);
      }
    } catch (e) {
      console.warn('[FlowAdapter] Failed to snapshot credits on cookie import:', e.message);
    }

    this.store.markAccount(account.id, 'ready', 100);
    return {
      success: true,
      state: 'ready',
      importedCount: count,
      accountId: account.id,
      projectId: projId,
      credits: credits?.remaining ?? null,
      message: 'Cookies valid! Akun siap digunakan untuk generate video dan gambar.',
    };
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

    if (job.type === 'video_chain') {
      return this.executeVideoChain(page, job, account, projectId, sourcePath);
    }

    let lastNetworkError = null;
    const responseHandler = async (res) => {
      try {
        if (res.url().includes('batchexecute') && res.url().includes('ogiZ0b')) {
          const text = await res.text().catch(() => '');
          console.log(`[FlowAdapter] [${account.label}] 🔍 ogiZ0b RAW: ${text.slice(0, 300).replace(/\n/g, ' ')}`);
          if (text.includes('PUBLIC_ERROR_UNUSUAL_ACTIVITY')) {
            lastNetworkError = new AppError(429, 'rate_limit_exceeded', 'Google Flow: Aktivitas yang tidak biasa (PUBLIC_ERROR_UNUSUAL_ACTIVITY)');
          }
        }
      } catch {}
    };
    page.on('response', responseHandler);

    try {
      await page.goto(`${ORIGIN}${sourcePath}`, { waitUntil: 'domcontentloaded' });
    const promptBoxPreload = page.locator('.ProseMirror, [contenteditable="true"], textarea').first();
    await promptBoxPreload.waitFor({ state: 'visible', timeout: 20000 }).catch(() => {});
    await page.waitForFunction(() => !!window.WIZ_global_data?.cfb2h, { timeout: 15000 }).catch(() => {});

    // Clean up any old error cards from previous attempts
    const oldErrorTile = page.locator('flow-error-tile button, .error-tile button, button:has-text("delete_forever"), button[aria-label*="delete" i]').first();
    if (await oldErrorTile.isVisible().catch(() => false)) {
      await oldErrorTile.click().catch(() => {});
      await page.waitForTimeout(400);
    }

    const baseline = await callRpc(page, RPC.contents, [`projects/${projectId}`, null, null, null, [1]], sourcePath);
    const baselineHash = crypto.createHash('sha256').update(JSON.stringify(baseline)).digest('hex');
    const baselineUrls = urls(baseline);
    const domUrls = await page.evaluate(() => {
      const imgs = Array.from(document.querySelectorAll('img.image, img')).map((i) => i.src);
      const vids = Array.from(document.querySelectorAll('video, video source')).map((v) => v.src);
      return [...imgs, ...vids];
    }).catch(() => []);
    for (const u of domUrls) {
      if (u) baselineUrls.push(u);
    }
    const baselineIds = extractMediaIds(baseline);
    const baselineItems = extractMediaItems(baseline);
    for (const it of baselineItems) {
      if (it.itemId) baselineIds.add(it.itemId);
      if (it.mediaId) baselineIds.add(it.mediaId);
    }

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

    // Select all and clear existing text cleanly
    await page.keyboard.press(process.platform === 'darwin' ? 'Meta+A' : 'Control+A').catch(() => {});
    await page.keyboard.press('Backspace').catch(() => {});
    await page.waitForTimeout(200);

    // Insert text via keyboard for native ProseMirror transaction dispatch
    await page.keyboard.insertText(job.request.prompt).catch(() => {});
    await page.waitForTimeout(400);

    let promptCurrentText = (await promptBox.innerText().catch(() => '')).trim();
    if (!promptCurrentText) {
      await promptBox.fill(job.request.prompt).catch(() => {});
      await page.waitForTimeout(400);
      promptCurrentText = (await promptBox.innerText().catch(() => '')).trim();
    }

    if (!promptCurrentText) {
      throw new AppError(422, 'prompt_entry_failed', 'Gagal memasukkan teks prompt ke Flow prompt box');
    }
    await page.waitForTimeout(500);

    const button = page.locator('button.generate-icon-button, button[aria-label*="generation" i], button[aria-label*="Start" i], button[aria-label*="pembuatan" i], button:has-text("arrow_forward")')
      .or(page.getByRole('button', { name: /start generation|start creation|mulai pembuatan|generate|create/i }))
      .filter({ visible: true })
      .first();

    await button.waitFor({ state: 'visible', timeout: 5000 }).catch(() => {});

    if (!await button.isEnabled().catch(() => false)) {
      const text = await page.locator('body').innerText().catch(() => '');
      if (/insufficient|not enough|habis|kredit.*0|0.*credit/i.test(text)) {
        throw new AppError(409, 'account_credits_exhausted', 'Kredit akun Flow habis');
      }
      await promptBox.press(process.platform === 'darwin' ? 'Meta+Enter' : 'Control+Enter').catch(() => {});
      await page.waitForTimeout(500);
    }

    if (!await button.isEnabled().catch(() => false)) {
      await button.waitFor({ state: 'visible', timeout: 3000 }).catch(() => {});
    }

    if (!await button.isEnabled().catch(() => false)) {
      const inlineErr = await page.locator('mat-error, .mat-mdc-form-field-error, .error-message, [role="alert"]').first().innerText().catch(() => '');
      if (inlineErr) {
        throw new AppError(422, 'generation_failed_by_flow', `Google Flow: ${inlineErr.trim()}`);
      }
      throw new AppError(409, 'generation_not_ready', 'Tombol generate belum siap di Flow');
    }

    console.log(`[FlowAdapter] [${account.label}] Tombol generate aktif. Mengklik generate untuk job ${job.id}...`);
    // Random human jitter to avoid simultaneous burst clicks
    await page.waitForTimeout(300 + Math.floor(Math.random() * 500));
    const box = await button.boundingBox().catch(() => null);
    if (box) {
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 5 }).catch(() => {});
      await page.waitForTimeout(100);
      await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2).catch(() => {});
    } else {
      await button.click().catch(() => {});
    }
    
    // Wait for Flow to dispatch RPC and clear prompt box (up to 3.5s)
    let cleared = false;
    for (let c = 0; c < 7; c++) {
      await page.waitForTimeout(500);
      const text = (await promptBox.innerText().catch(() => '')).trim();
      if (!text) {
        cleared = true;
        break;
      }
    }
    console.log(`[FlowAdapter] [${account.label}] Selesai klik generate. Box cleared: ${cleared}`);

    if (!cleared && await button.isEnabled().catch(() => false)) {
      // Fallback only if prompt box was not cleared and button is still enabled
      await promptBox.press(process.platform === 'darwin' ? 'Meta+Enter' : 'Control+Enter').catch(() => {});
      await page.waitForTimeout(800);
    }

    // Check immediately for any instant error snackbar, dialog, or alert
    const errorSelector = '.cdk-overlay-container mat-snack-bar-container, .cdk-overlay-container .mat-mdc-snack-bar-container, .cdk-overlay-container simple-snack-bar, .cdk-overlay-container [role="alert"], mat-dialog-container, .mat-mdc-dialog-container, [role="alert"].error';
    for (let c = 0; c < 3; c++) {
      await page.waitForTimeout(400);
      const instantToast = page.locator(errorSelector).first();
      if (await instantToast.isVisible().catch(() => false)) {
        const errText = (await instantToast.innerText().catch(() => '')).trim();
        if (/failed|error|violate|policy|couldn't|tidak dapat|gagal|batas penggunaan|limit|unusual activity|aktivitas yang tidak biasa|usage limit/i.test(errText)) {
          const isLimit = /batas penggunaan|limit|try again later|usage limit|unusual activity/i.test(errText);
          throw new AppError(isLimit ? 429 : 422, isLimit ? 'rate_limit_exceeded' : 'generation_failed_by_flow', `Google Flow menolak/gagal membuat video: ${errText}`);
        }
      }
    }
    await page.waitForTimeout(600);
    const approveBtnPre = page.locator('button:has-text("Selalu setujui"), button:has-text("Setujui"), button:has-text("Always approve"), button:has-text("Approve")').first();
    if (await approveBtnPre.isVisible().catch(() => false)) {
      await approveBtnPre.click().catch(() => {});
      await page.waitForTimeout(500);
    }
    // Dismiss or delete any preexisting failed tiles on the canvas
    const oldErrorCard = page.locator('flow-error-tile button[aria-label="Delete"], .error-tile button[aria-label="Delete"], button:has-text("delete_forever"), div:has-text("Failed") button[aria-label*="delete" i]').first();
    if (await oldErrorCard.isVisible().catch(() => false)) {
      await oldErrorCard.click().catch(() => {});
      await page.waitForTimeout(400);
    }
    const errorCardSelector = 'flow-error-tile, .error-tile, [role="alert"], div:has-text("Failed"), div:has-text("Gagal"), mat-card:has-text("Failed"), mat-card:has-text("Gagal"), .error-card';
    const baselineErrorCount = await page.locator(errorCardSelector).count().catch(() => 0);
    const checkpoint = {
      ...(job.checkpoint || {}),
      phase: 'submitted',
      accountId: account.id,
      accountLabel: account.label,
      projectId,
      baselineHash,
      baselineUrls,
      baselineIds: [...baselineIds],
      baselineErrorCount,
      submittedAt: new Date().toISOString(),
    };
    this.store.checkpoint(job.id, checkpoint);
    const result = await this.waitForResult(page, { ...job, checkpoint }, projectId, checkpoint, () => lastNetworkError);

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
    } finally {
      page.off('response', responseHandler);
    }
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
    if (await agentChip.isVisible({ timeout: 1500 }).catch(() => false)) {
      const isChecked = await agentChip.evaluate((el) => {
        return el.classList.contains('agent-mode-chip-checked') ||
          el.classList.contains('mat-mdc-chip-selected') ||
          el.classList.contains('selected') ||
          el.classList.contains('active') ||
          el.getAttribute('aria-checked') === 'true' ||
          el.getAttribute('aria-pressed') === 'true' ||
          el.getAttribute('aria-selected') === 'true';
      }).catch(() => false);
      if (isChecked) {
        await agentChip.click().catch(() => {});
        await page.waitForTimeout(400);
      }
    }

    // Ensure prompt container is mounted before searching for settings trigger
    const promptBoxPre = page.locator('.ProseMirror, [contenteditable="true"], textarea').first();
    await promptBoxPre.waitFor({ state: 'visible', timeout: 30000 }).catch(() => {});

    const settingsPanel = page.locator('flow-prompt-box-settings, .cdk-overlay-pane, [role="dialog"]').first();
    const trigger = page.locator([
      'flow-prompt-box button:has-text("Banana")',
      'flow-prompt-box button:has-text("Nano")',
      'flow-prompt-box button:has-text("Veo")',
      'flow-prompt-box button:has-text("Omni")',
      'flow-prompt-box button:has-text("Imagen")',
      'flow-prompt-box button.settings-trigger-button',
      'button:has-text("Banana")',
      'button:has-text("Veo")',
      'button:has-text("Omni")',
      'button:has-text("Imagen")',
      'flow-prompt-box button:has-text("Video")',
      'flow-prompt-box button:has-text("Image")',
      'flow-prompt-box button:has-text("Gambar")',
      'form button:has-text("Video")',
      'form button:has-text("Image")',
      'form button:has-text("Gambar")',
      'button.settings-trigger-button',
      'button[aria-label*="Settings trigger" i]',
      'button[aria-label*="Pemicu setelan" i]',
      '.prompt-container button.settings-trigger-button',
      'flow-prompt-box button[aria-haspopup="dialog"]',
      'flow-prompt-box button[aria-haspopup="menu"]'
    ].join(', '))
      .filter({ visible: true })
      .first();

    if (await trigger.isVisible().catch(() => false)) {
      const triggerText = (await trigger.innerText().catch(() => '')).replace(/\s+/g, ' ').trim();
      const isBanana = !request.model || /banana/i.test(request.model);
      const isBanana2 = !request.model || /banana.*2|narwhal/i.test(request.model);
      const wants16x9 = !request.aspectRatio || request.aspectRatio === '16:9' || request.aspectRatio === 'landscape';
      const wantsX1 = !request.count || Number(request.count) === 1;

      // Fast-bypass: if trigger already matches image + Nano Banana 2.1 + 16:9 + x1, avoid opening modal
      if (!isVideo && isBanana2 && wants16x9 && wantsX1 &&
          /nano banana 2/i.test(triggerText) && /crop_16_9|16:9/i.test(triggerText) && /x1/i.test(triggerText)) {
        console.log(`[FlowAdapter] ⚡ Setelan sudah sesuai (${triggerText}). Langsung bypass modal setelan.`);
        return;
      }
    }

    if (!await settingsPanel.isVisible().catch(() => false)) {
      await trigger.waitFor({ state: 'visible', timeout: 3500 }).catch(() => {});
      if (!await trigger.isVisible().catch(() => false)) {
        if (await closeSidebarBtn.isVisible().catch(() => false)) {
          await closeSidebarBtn.click().catch(() => {});
          await page.waitForTimeout(300);
        }
        await trigger.waitFor({ state: 'visible', timeout: 1500 }).catch(() => {});
      }

      if (await trigger.isVisible().catch(() => false)) {
        await trigger.click().catch(() => {});
        await settingsPanel.waitFor({ state: 'visible', timeout: 4000 }).catch(() => {});
        await page.waitForTimeout(200);
      } else if (!await settingsPanel.isVisible().catch(() => false)) {
        console.warn('[FlowAdapter] Warning: settings trigger button not found (continuing with default canvas settings)');
        return;
      }
    }

    try {
      const pBtns = await page.locator('flow-prompt-box button').allInnerTexts().catch(() => []);
      const sBtns = await settingsPanel.locator('button, [role="button"], mat-select, [role="combobox"]').allInnerTexts().catch(() => []);
      console.log('[FlowAdapter] prompt-box buttons:', JSON.stringify(pBtns.map(b => b.replace(/\s+/g, ' ').trim())));
      console.log('[FlowAdapter] settingsPanel buttons:', JSON.stringify(sBtns.map(b => b.replace(/\s+/g, ' ').trim())));
    } catch {}

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
      } else if (modelLower.includes('banana') || modelLower.includes('narwhal') || modelLower.includes('2.1') || modelLower.includes('2_1')) {
        targetPattern = /Nano Banana 2(\.1)?(?!\s*Lite)|Nano Banana(?!.*(Pro|Lite))/i;
      }
    }

    if (targetPattern) {
      const modelBtn = settingsPanel.locator('button:has-text("arrow_drop_down"), button:has-text("Banana"), button:has-text("Nano"), button:has-text("Omni"), button:has-text("Veo"), button[aria-haspopup="menu"]').filter({ visible: true }).first();
      if (await modelBtn.isVisible().catch(() => false)) {
        const currentText = await modelBtn.innerText().catch(() => '');
        if (!targetPattern.test(currentText)) {
          console.log(`[FlowAdapter] Model mismatch: current="${currentText.replace(/\s+/g, ' ').trim()}", clicking dropdown for target=${targetPattern}...`);
          await modelBtn.click().catch(() => {});
          await page.waitForTimeout(400);
          const option = page.locator('.mat-mdc-menu-panel [role="menuitem"], mat-menu-panel [role="menuitem"], [role="menu"] [role="menuitem"], .cdk-overlay-container [role="menuitem"]')
            .filter({ hasText: targetPattern })
            .filter({ visible: true })
            .first();
          if (await option.isVisible().catch(() => false)) {
            console.log(`[FlowAdapter] Selecting model option: ${await option.innerText().catch(() => '')}`);
            await option.click().catch(() => {});
            await page.waitForTimeout(500); // Allow menu to close & model toggles to mount
          } else {
            console.warn(`[FlowAdapter] Warning: model option not found for pattern ${targetPattern}`);
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

    // Verify Model
    if (targetPattern && !targetPattern.test(triggerText)) {
      console.log(`[FlowAdapter] Model verify check: triggerText="${triggerText}" does not match target=${targetPattern}. Opening panel to correct...`);
      if (!await settingsPanel.isVisible().catch(() => false)) {
        await trigger.click().catch(() => {});
        await page.waitForTimeout(400);
      }
      const modelBtn = settingsPanel.locator('button:has-text("arrow_drop_down"), button:has-text("Banana"), button:has-text("Nano"), button:has-text("Omni"), button:has-text("Veo"), button[aria-haspopup="menu"]').filter({ visible: true }).first();
      if (await modelBtn.isVisible().catch(() => false)) {
        await modelBtn.click().catch(() => {});
        await page.waitForTimeout(400);
        const option = page.locator('.mat-mdc-menu-panel [role="menuitem"], mat-menu-panel [role="menuitem"], [role="menu"] [role="menuitem"], .cdk-overlay-container [role="menuitem"]')
          .filter({ hasText: targetPattern })
          .filter({ visible: true })
          .first();
        if (await option.isVisible().catch(() => false)) {
          console.log(`[FlowAdapter] Correcting model option: ${await option.innerText().catch(() => '')}`);
          await option.click().catch(() => {});
          await page.waitForTimeout(500);
        } else {
          await page.keyboard.press('Escape').catch(() => {});
        }
      }
      await page.keyboard.press('Escape').catch(() => {});
      await page.waitForTimeout(300);
      triggerText = (await trigger.innerText().catch(() => '')).replace(/\s+/g, ' ').trim();
    }

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

  async resolveMediaUrls(page, urlList, isVideo) {
    const resolved = [];
    for (const u of urlList) {
      if (!isVideo && !u.startsWith('data:') && (u.includes('/asb/') || !u.includes('flow-content.google'))) {
        try {
          const resp = await page.request.get(u, { timeout: 30000 });
          if (resp.ok()) {
            const buf = await resp.body();
            const cType = resp.headers()['content-type'] || 'image/png';
            if (!cType.includes('text/html') && buf[0] !== 0x3c && buf.length > 5000) {
              resolved.push(`data:${cType};base64,${buf.toString('base64')}`);
              continue;
            }
          }
        } catch (err) {
          console.warn('[flow-adapter] resolveMediaUrls error:', err.message);
        }
      }
      resolved.push(u);
    }
    return resolved;
  }

  async waitForResult(page, job, projectId, checkpoint, checkNetworkError = null) {
    const maxWaitMs = job.type === 'image' ? 45_000 : this.config.jobTimeoutMs;
    const deadline = Date.now() + maxWaitMs;
    const sourcePath = `/project/${projectId}`;
    const beforeHash = checkpoint.baselineHash;
    const beforeIds = new Set(checkpoint.baselineIds ?? []);
    const oldUrls = new Set(checkpoint.baselineUrls ?? []);
    const pollInterval = Math.min(this.config.pollIntervalMs, 2500);
    const label = checkpoint?.accountLabel || job.checkpoint?.accountLabel || 'flow';

    while (Date.now() < deadline) {
      if (checkNetworkError) {
        const netErr = checkNetworkError();
        if (netErr) {
          const deleteBtn = page.locator('button[aria-label="Delete"], button:has-text("delete_forever"), button:has-text("delete")').first();
          if (await deleteBtn.isVisible().catch(() => false)) {
            await deleteBtn.click().catch(() => {});
            await page.waitForTimeout(300);
          }
          throw netErr;
        }
      }

      await sleep(pollInterval);

      // Auto-approve agent prompt if it appears during execution
      const approveBtn = page.locator('button:has-text("Selalu setujui"), button:has-text("Setujui"), button:has-text("Always approve"), button:has-text("Approve")').first();
      if (await approveBtn.isVisible().catch(() => false)) {
        await approveBtn.click().catch(() => {});
      }

      // Immediate detection of Flow error toasts or safety policy rejections in CDK overlay
      const errorToastSelector = '.cdk-overlay-container mat-snack-bar-container, .cdk-overlay-container .mat-mdc-snack-bar-container, .cdk-overlay-container simple-snack-bar, .cdk-overlay-container [role="alert"], mat-dialog-container, .mat-mdc-dialog-container';
      const errorToast = page.locator(errorToastSelector).first();
      if (await errorToast.isVisible().catch(() => false)) {
        const errorText = (await errorToast.innerText().catch(() => '')).trim();
        if (/failed|error|violate|policy|couldn't|tidak dapat|gagal|batas penggunaan|limit|unusual activity|aktivitas yang tidak biasa|usage limit|try again later/i.test(errorText)) {
          const dismissBtn = errorToast.locator('button').first();
          if (await dismissBtn.isVisible().catch(() => false)) {
            await dismissBtn.click().catch(() => {});
          } else {
            await page.keyboard.press('Escape').catch(() => {});
          }
          await page.screenshot({ path: '/Users/reihanpraja/.gemini/antigravity-ide/brain/cff15285-550f-4c93-a2a4-ef71dcfe3172/scratch/latest_flow_error.png' }).catch(() => {});
          const isLimit = /batas penggunaan|limit|try again later|usage limit|unusual activity|aktivitas yang tidak biasa/i.test(errorText);
          throw new AppError(isLimit ? 429 : 422, isLimit ? 'rate_limit_exceeded' : 'generation_failed_by_flow', `Google Flow menolak/gagal: ${errorText}`);
        }
      }

      // Direct detection of unusual activity, bot check, or usage limit anywhere on the page
      const flagText = page.getByText(/aktivitas yang tidak biasa|unusual activity|batas penggunaan|usage limit|reached your usage limit/i).first();
      if (await flagText.isVisible().catch(() => false)) {
        await page.screenshot({ path: '/Users/reihanpraja/.gemini/antigravity-ide/brain/cff15285-550f-4c93-a2a4-ef71dcfe3172/scratch/latest_flow_error.png' }).catch(() => {});
        const errText = (await flagText.innerText().catch(() => '')).trim();
        console.warn(`[FlowAdapter] ⚠️ Deteksi aktivitas tidak biasa / limit pada kanvas Flow: "${errText.slice(0, 100)}"`);
        const deleteBtn = page.locator('button[aria-label="Delete"], button:has-text("delete_forever"), button:has-text("delete")').first();
        if (await deleteBtn.isVisible().catch(() => false)) {
          await deleteBtn.click().catch(() => {});
          await page.waitForTimeout(300);
        }
        throw new AppError(429, 'rate_limit_exceeded', `Google Flow: ${errText.slice(0, 150)}`);
      }

      // Detection of newly appeared generic error cards
      const errorCardSelector = 'flow-error-tile, .error-tile, [role="alert"]';
      const errorCard = page.locator(errorCardSelector).first();
      if (await errorCard.isVisible().catch(() => false)) {
        const errText = (await errorCard.innerText().catch(() => '')).trim();
        if (/failed|error|violate|policy|couldn't|tidak dapat|gagal|batas penggunaan|limit|unusual activity|aktivitas yang tidak biasa|usage limit/i.test(errText)) {
          await page.screenshot({ path: '/Users/reihanpraja/.gemini/antigravity-ide/brain/cff15285-550f-4c93-a2a4-ef71dcfe3172/scratch/latest_flow_error.png' }).catch(() => {});
          const isLimit = /batas penggunaan|limit|try again later|usage limit|unusual activity|aktivitas yang tidak biasa/i.test(errText);
          const deleteBtn = errorCard.locator('button[aria-label="Delete"], button:has-text("delete_forever"), button:has-text("delete")').first();
          if (await deleteBtn.isVisible().catch(() => false)) {
            await deleteBtn.click().catch(() => {});
            await page.waitForTimeout(300);
          }
          throw new AppError(isLimit ? 429 : 422, isLimit ? 'rate_limit_exceeded' : 'generation_failed_by_flow', `Google Flow gagal: ${errText.slice(0, 150)}`);
        }
      }

      // Dismiss expiration opt-in banner if present
      const optInBanner = page.locator('button:has-text("Opt in")').first();
      if (await optInBanner.isVisible().catch(() => false)) {
        const dismissBtn = page.locator('button:has-text("Opt in") ~ button, button[aria-label="Dismiss"], button[aria-label="Tutup"]').first();
        if (await dismissBtn.isVisible().catch(() => false)) {
          await dismissBtn.click().catch(() => {});
        }
      }



      let current;
      try {
        current = await callRpc(page, RPC.contents, [`projects/${projectId}`, null, null, null, [1]], sourcePath);
      } catch (err) {
        if (Date.now() % 5000 < 2500) console.warn(`[FlowAdapter] [${label}] RPC.contents error: ${err.message}`);
        continue;
      }
      if (!current) continue;

      const currentItems = extractMediaItems(current);
      const newItems = currentItems.filter((it) => !beforeIds.has(it.itemId) && !beforeIds.has(it.mediaId));
      const currentIds = extractMediaIds(current);
      const newIds = [...currentIds].filter((id) => !beforeIds.has(id));

      if (newItems.length > 0 || newIds.length > 0) {
        console.log(`[FlowAdapter] 🎯 [${label}] Mendapatkan item baru! newItems=${newItems.length}, newIds=${newIds.length}`);
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
            const foundUrls = allUrls.filter((u) => isFlowMediaUrl(u));
            const candidateUrls = foundUrls.length ? foundUrls : allUrls.filter((u) => isFlowMediaUrl(u));
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



        if (publicUrls.length > 0) {
          const uniqueUrls = [...new Set(publicUrls)];
          const resolvedUrls = await this.resolveMediaUrls(page, uniqueUrls, isVideo);
          const finalItems = mediaItems.map((item, idx) => ({
            ...item,
            url: resolvedUrls[idx] || resolvedUrls[0] || item.url,
            imageUrl: resolvedUrls[idx] || resolvedUrls[0] || item.imageUrl,
          }));
          return {
            projectId,
            type: job.type,
            url: resolvedUrls[0] || uniqueUrls[0],
            media: resolvedUrls,
            items: finalItems.length ? finalItems : resolvedUrls.map((u, idx) => ({ id: `media-${Date.now()}-${idx}`, type: isVideo ? 'video' : 'image', url: u, imageUrl: u })),
            mediaIds: newIds,
          };
        }
      }

    }
    await page.screenshot({ path: '/Users/reihanpraja/.gemini/antigravity-ide/brain/cff15285-550f-4c93-a2a4-ef71dcfe3172/scratch/timeout_screen.png' }).catch(() => {});
    const uiAlert = (await page.locator('.cdk-overlay-container, mat-dialog-container, [role="alert"], flow-error-tile, .error-message').first().innerText().catch(() => '')).trim();
    const promptText = (await page.locator('.ProseMirror, [contenteditable="true"], textarea').first().innerText().catch(() => '')).trim();
    let timeoutDetail = `Generation belum selesai sebelum timeout (${maxWaitMs / 1000}s)`;
    if (uiAlert) timeoutDetail += ` [Alert: ${uiAlert.replace(/\s+/g, ' ').slice(0, 150)}]`;
    throw new AppError(504, 'generation_timeout', timeoutDetail);
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

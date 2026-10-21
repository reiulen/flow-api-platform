import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';
import { AppError } from './errors.js';
import { parseCookieInput } from './cookies.js';

function cleanStaleSingleton(profile) {
  for (const name of ['SingletonLock', 'SingletonCookie', 'SingletonSocket']) {
    const lockPath = path.join(profile, name);
    try {
      const stats = fs.lstatSync(lockPath);
      if (stats.isSymbolicLink() || stats.isFile()) {
        if (name === 'SingletonLock') {
          try {
            const target = fs.readlinkSync(lockPath);
            const pid = parseInt(target.split('-').pop(), 10);
            if (pid && !isNaN(pid)) {
              try {
                process.kill(pid, 0);
                continue;
              } catch (e) {
                if (e.code === 'ESRCH') fs.unlinkSync(lockPath);
              }
            } else {
              fs.unlinkSync(lockPath);
            }
          } catch {
            try { fs.unlinkSync(lockPath); } catch {}
          }
        } else {
          try { fs.unlinkSync(lockPath); } catch {}
        }
      }
    } catch {}
  }
}

export class BrowserPool {
  constructor(config) {
    this.config = config;
    this.entries = new Map();
    this.launching = new Map();
  }

  async pageFor(account) {
    const existing = this.entries.get(account.id);
    if (existing) {
      try {
        if (!existing.page.isClosed() && existing.context.pages().length > 0) {
          return existing.page;
        }
      } catch {}
      this.entries.delete(account.id);
      try { await existing.context.close(); } catch {}
    }

    if (this.launching.has(account.id)) {
      return this.launching.get(account.id);
    }

    const launchPromise = (async () => {
      const profileName = account.profile_name ?? account.profileName ?? account.id;
      const profile = path.join(this.config.profileDir, profileName);
      fs.mkdirSync(profile, { recursive: true, mode: 0o700 });
      cleanStaleSingleton(profile);
      try {
        const isHeadless = !!this.config.headless;
        const context = await chromium.launchPersistentContext(profile, {
          executablePath: this.config.chromePath,
          headless: isHeadless,
          viewport: { width: 1440, height: 900 },
          locale: 'en-US',
          args: [
            '--disable-blink-features=AutomationControlled',
            '--disable-crash-reporter',
            ...(isHeadless ? ['--headless=new', '--hide-scrollbars', '--mute-audio'] : []),
          ],
        });
        context.setDefaultTimeout(45_000);
        context.on('page', (p) => {
          p.on('dialog', async (dialog) => {
            await dialog.accept().catch(() => {});
          });
        });
        const page = context.pages()[0] ?? await context.newPage();
        page.on('dialog', async (dialog) => {
          await dialog.accept().catch(() => {});
        });

        // Auto-load backup cookies.json if present
        const cookieBackupPath = path.join(profile, 'cookies.json');
        if (fs.existsSync(cookieBackupPath)) {
          try {
            const raw = fs.readFileSync(cookieBackupPath, 'utf8');
            const parsed = parseCookieInput(raw);
            if (parsed.length > 0) {
              await context.addCookies(parsed);
            }
          } catch (err) {
            console.warn('[BrowserPool] Failed to auto-load cookies.json for', profileName, err.message);
          }
        }

        const entry = { context, page };
        this.entries.set(account.id, entry);
        context.on('close', () => this.entries.delete(account.id));
        return page;
      } catch (error) {
        console.error('[BrowserPool] Failed to launch browser for', account.profile_name, error);
        throw new AppError(503, 'browser_launch_failed', error.message || 'Browser worker gagal dibuka');
      }
    })();

    this.launching.set(account.id, launchPromise);
    try {
      return await launchPromise;
    } finally {
      this.launching.delete(account.id);
    }
  }

  async importCookies(account, cookiesInput) {
    const cookies = parseCookieInput(cookiesInput);
    if (cookies.length === 0) {
      throw new AppError(400, 'invalid_cookies', 'Tidak ada cookies valid yang dapat diparsing. Pastikan format JSON array atau header string.');
    }
    await this.pageFor(account);
    const entry = this.entries.get(account.id);
    if (!entry?.context) {
      throw new AppError(503, 'browser_unavailable', 'Browser context tidak tersedia untuk akun ini');
    }

    // Inject into active context
    await entry.context.addCookies(cookies);

    // Save backup to profile folder
    const profileName = account.profile_name ?? account.profileName ?? account.id;
    const profile = path.join(this.config.profileDir, profileName);
    fs.mkdirSync(profile, { recursive: true, mode: 0o700 });
    fs.writeFileSync(path.join(profile, 'cookies.json'), JSON.stringify(cookies, null, 2), { mode: 0o600 });

    return cookies.length;
  }

  async resetProfile(account) {
    const existing = this.entries.get(account.id);
    if (existing) {
      this.entries.delete(account.id);
      try { await existing.context.close(); } catch {}
    }
    const profileName = account.profile_name ?? account.profileName ?? account.id;
    const profile = path.join(this.config.profileDir, profileName);
    try {
      if (fs.existsSync(profile)) {
        fs.rmSync(profile, { recursive: true, force: true });
      }
    } catch (err) {
      console.warn('[BrowserPool] Failed to remove profile dir:', err.message);
    }
  }

  async contextFor(account) {
    await this.pageFor(account);
    const entry = this.entries.get(account.id);
    return entry?.context ?? null;
  }

  async auxiliaryPage(account, url = null) {
    await this.pageFor(account);
    const entry = this.entries.get(account.id);
    if (!entry?.context) {
      throw new AppError(503, 'browser_unavailable', 'Browser context tidak tersedia untuk akun ini');
    }
    const page = await entry.context.newPage();
    if (url) {
      await page.goto(url, { waitUntil: 'domcontentloaded' });
    }
    return page;
  }

  async close() {
    await Promise.allSettled([...this.entries.values()].map((entry) => entry.context.close()));
    this.entries.clear();
  }
}



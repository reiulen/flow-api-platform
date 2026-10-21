import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { loadConfig } from '../src/config.js';
import { Store } from '../src/db.js';
import { BrowserPool } from '../src/browser-pool.js';
import { FlowAdapter } from '../src/flow-adapter.js';

const config = loadConfig();
const store = new Store(config.dataDir);
const browsers = new BrowserPool(config);
const adapter = new FlowAdapter(config, store, browsers);

let accountId = process.argv[2];
let cookieSource = process.argv[3];

// If no account specified, find or create default primary account
if (!accountId) {
  const accounts = store.listAccounts();
  if (accounts.length > 0) {
    accountId = accounts[0].id;
    console.log(`Menggunakan akun yang ada: ${accounts[0].label} (${accountId})`);
  } else {
    const created = store.createAccount({ label: 'Primary Account', profileName: 'primary', priority: 10 });
    accountId = created.id;
    console.log(`Dibuat akun baru: ${created.label} (${accountId})`);
  }
}

const account = store.getAccountInternal(accountId);
if (!account) {
  console.error(`Account dengan ID '${accountId}' tidak ditemukan di database.`);
  await browsers.close();
  process.exit(1);
}

let rawCookies = '';

// Check if cookieSource is a file path
if (cookieSource && fs.existsSync(cookieSource)) {
  console.log(`Membaca cookies dari file: ${cookieSource}`);
  rawCookies = fs.readFileSync(cookieSource, 'utf8');
} else if (fs.existsSync('cookies.json')) {
  console.log('Membaca cookies dari file cookies.json di root directory...');
  rawCookies = fs.readFileSync('cookies.json', 'utf8');
} else if (cookieSource) {
  rawCookies = cookieSource;
} else {
  console.log('\n======================================================');
  console.log('IMPORT COOKIES GOOGLE FLOW (Ala UseAPI)');
  console.log('======================================================');
  console.log('1. Buka https://flow.google.com/ di browser Anda.');
  console.log('2. Buka ekstensi Cookie-Editor lalu klik "Export" -> "Export as JSON"');
  console.log('   (atau copy cookie header string).');
  console.log('3. Paste cookies di bawah ini, lalu tekan Enter:\n');

  const rl = readline.createInterface({ input, output });
  rawCookies = await rl.question('Paste cookies: ');
  rl.close();
}

if (!rawCookies || !rawCookies.trim()) {
  console.error('Cookies kosong. Dibatalkan.');
  await browsers.close();
  process.exit(1);
}

console.log('\nMengimpor cookies ke browser headless dan memverifikasi ke flow.google.com...');
try {
  const result = await adapter.importCookiesAndVerify(account, rawCookies.trim());
  if (result.success) {
    console.log('BERHASIL!');
    console.log(`Status Akun   : ${result.state}`);
    console.log(`Cookies Masuk : ${result.importedCount} cookie`);
    console.log(`Project ID    : ${result.projectId || '-'}`);
    console.log(`Kredit Flow   : ${result.credits ?? 'Tidak terbaca / unlimited'}`);
    console.log(`\nAkun [${account.label}] sekarang SIAP digunakan untuk generate video & foto!`);
  } else {
    console.error('GAGAL VERIFIKASI:');
    console.error(result.message);
    if (result.url) console.error(`URL tujuan: ${result.url}`);
  }
} catch (err) {
  console.error('Terjadi error saat import cookies:', err.message);
} finally {
  await browsers.close();
}

import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { loadConfig } from '../src/config.js';
import { Store } from '../src/db.js';
import { BrowserPool } from '../src/browser-pool.js';

const id = process.argv[2];
if (!id) { console.error('Usage: npm run login -- acc_xxx'); process.exit(1); }
const config = loadConfig();
const store = new Store(config.dataDir);
const account = store.getAccountInternal(id);
if (!account) { console.error('Account tidak ditemukan'); process.exit(1); }
const pool = new BrowserPool({ ...config, headless: false });
const page = await pool.pageFor(account);
await page.goto('https://flow.google.com/', { waitUntil: 'domcontentloaded' });
console.log('Login ke Google Flow di jendela Chrome. Jangan menyalin cookie atau token.');
const rl = readline.createInterface({ input, output });
await rl.question('Setelah halaman Flow terbuka dan akun aktif, tekan Enter di sini... ');
rl.close();
if (page.url().includes('accounts.google.com')) {
  console.error('Login belum selesai.'); await pool.close(); process.exit(2);
}
store.markAccount(id, 'ready', 100);
await pool.close();
console.log(`Account ${id} siap.`);

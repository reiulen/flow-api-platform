import { loadConfig } from '../src/config.js';
import { Store } from '../src/db.js';

const config = loadConfig();
const store = new Store(config.dataDir);
const existingProfiles = new Set(store.listAccounts().map((account) => account.profileName));
const accounts = [];
for (let index = 1; index <= 5; index += 1) {
  const profileName = `account-${index}`;
  if (existingProfiles.has(profileName)) {
    accounts.push(store.listAccounts().find((account) => account.profileName === profileName));
    continue;
  }
  accounts.push(store.createAccount({ label: `Flow Account ${index}`, profileName, priority: index * 10, maxConcurrency: 1 }));
}
store.setRouting({ strategy: 'exhaust_first', minCredits: 1, autoFailover: true });
console.log('Five-account pool ready. Login each profile:');
for (const account of accounts) console.log(`npm run login -- ${account.id}  # ${account.label}`);

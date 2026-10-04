import { loadConfig } from './config.js';
import { Store } from './db.js';
import { BrowserPool } from './browser-pool.js';
import { FlowAdapter } from './flow-adapter.js';
import { JobWorker } from './job-worker.js';

const config = loadConfig();
const store = new Store(config.dataDir);
const browsers = new BrowserPool(config);
const worker = new JobWorker(config, store, new FlowAdapter(config, store, browsers));
worker.start();
console.log(`Worker ${worker.id} started with concurrency ${config.concurrency}`);
for (const signal of ['SIGINT','SIGTERM']) process.once(signal, async () => {
  await worker.stop(); await browsers.close(); process.exit(0);
});

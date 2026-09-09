// Writes static news snapshots into dist/data/<category>.json for GitHub
// Pages. Run AFTER `vite build` (CI does: build → generate-data → deploy),
// or on its own to refresh data for `npm start`.

import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CATEGORIES, fetchCategory } from '../server/news.js';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const distData = path.join(root, 'dist', 'data');

await fs.mkdir(distData, { recursive: true });

// Stamp the service worker with a hash of the built shell so clients pick up
// a fresh SW (and thus fresh caches) on every deploy.
try {
  const assetsDir = path.join(root, 'dist', 'assets');
  const fingerprint = (await fs.readdir(assetsDir)).sort().join('|');
  const hash = crypto.createHash('sha256').update(fingerprint).digest('hex').slice(0, 10);
  const swPath = path.join(root, 'dist', 'sw.js');
  await fs.writeFile(swPath, (await fs.readFile(swPath, 'utf8')).replace('__BUILD_HASH__', hash));
} catch {
  console.warn('sw.js stamping skipped (not built yet?)');
}

const started = Date.now();
let ok = 0;

for (const key of Object.keys(CATEGORIES)) {
  try {
    const items = await fetchCategory(key, { budgetMs: 60_000, concurrency: 10 });
    await fs.writeFile(
      path.join(distData, `${key}.json`),
      JSON.stringify({ category: key, fetchedAt: Date.now(), items })
    );
    if (items.length) ok++;
    console.log(`${key}: ${items.length} items`);
  } catch (err) {
    console.error(`${key}: FAILED — ${err.message}`);
  }
}

if (ok === 0) {
  console.error('every category failed to generate');
  process.exit(1);
}

console.log(`dist/data ready with ${ok}/${Object.keys(CATEGORIES).length} categories in ${((Date.now() - started) / 1000).toFixed(1)}s`);
// rss-parser / undici can keep sockets alive; exit explicitly once written.
process.exit(0);

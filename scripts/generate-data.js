// Writes static news snapshots into dist/data/<category>.json for GitHub
// Pages. Run AFTER `vite build` (CI does: build → generate-data → deploy),
// or on its own to refresh data for `npm start`.

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CATEGORIES, fetchCategory } from '../server/news.js';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const distData = path.join(root, 'dist', 'data');

await fs.mkdir(distData, { recursive: true });

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

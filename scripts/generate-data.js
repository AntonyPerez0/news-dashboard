// Builds a static deployable site into dist/ for GitHub Pages:
// copies public/ and writes dist/data/<category>.json snapshots that the
// frontend falls back to when no Node API is available.

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CATEGORIES, fetchCategory } from '../lib/news.js';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const dist = path.join(root, 'dist');

await fs.rm(dist, { recursive: true, force: true });
await fs.cp(path.join(root, 'public'), dist, { recursive: true });
await fs.mkdir(path.join(dist, 'data'), { recursive: true });

const started = Date.now();
let ok = 0;

for (const key of Object.keys(CATEGORIES)) {
  try {
    const items = await fetchCategory(key, { budgetMs: 60_000, concurrency: 10 });
    await fs.writeFile(
      path.join(dist, 'data', `${key}.json`),
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

console.log(`dist/ ready with ${ok}/${Object.keys(CATEGORIES).length} categories in ${((Date.now() - started) / 1000).toFixed(1)}s`);
// rss-parser keeps sockets alive; exit explicitly once the build is written.
process.exit(0);

// Writes static news snapshots into dist/data/<category>.json for GitHub
// Pages. Run AFTER `vite build` (CI does: build → generate-data → deploy),
// or on its own to refresh data for `npm start`.

import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CATEGORIES, exportPageCache, fetchCategory, importPageCache, scrapeStats } from '../server/news.js';

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

// The category list for static hosting, where there is no /api/categories.
await fs.writeFile(
  path.join(distData, 'categories.json'),
  JSON.stringify(Object.entries(CATEGORIES).map(([key, cat]) => ({ key, label: cat.label })))
);

// Start from what the previous build learned about each article page, so a
// run fetches only the stories that are new since then. The cache is
// published with the site (data/page-cache.json); NEWS_PAGE_CACHE_URL
// overrides where to read it, and "off" skips it.
async function previousPageCacheUrl() {
  const override = process.env.NEWS_PAGE_CACHE_URL;
  if (override) return override === 'off' ? null : override;
  try {
    const domain = (await fs.readFile(path.join(root, 'public', 'CNAME'), 'utf8')).trim();
    if (domain) return `https://${domain}/data/page-cache.json`;
  } catch {
    /* no custom domain */
  }
  const [owner, repo] = (process.env.GITHUB_REPOSITORY || '').split('/');
  return owner && repo ? `https://${owner.toLowerCase()}.github.io/${repo}/data/page-cache.json` : null;
}

const cacheUrl = await previousPageCacheUrl();
if (cacheUrl) {
  try {
    const res = await fetch(cacheUrl, { signal: AbortSignal.timeout(15_000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    console.log(`page cache: ${importPageCache(await res.json())} entries from ${cacheUrl}`);
  } catch (err) {
    console.warn(`page cache: starting empty (${cacheUrl}: ${err.message})`);
  }
}

const started = Date.now();
const links = [];
let ok = 0;

for (const key of Object.keys(CATEGORIES)) {
  try {
    const items = await fetchCategory(key, { budgetMs: 60_000, concurrency: 10 });
    await fs.writeFile(
      path.join(distData, `${key}.json`),
      JSON.stringify({ category: key, fetchedAt: Date.now(), items })
    );
    if (items.length) ok++;
    for (const item of items) links.push(item.link);
    console.log(`${key}: ${items.length} items`);
  } catch (err) {
    console.error(`${key}: FAILED — ${err.message}`);
  }
}

if (ok === 0) {
  console.error('every category failed to generate');
  process.exit(1);
}

// Only the stories on the site now: entries for stories that have aged out
// are dropped, which keeps the file from growing.
await fs.writeFile(path.join(distData, 'page-cache.json'), JSON.stringify(exportPageCache(links)));
console.log(`article pages: ${scrapeStats.fetched} fetched, ${scrapeStats.cached} answered from the cache`);
console.log(`photo searches: ${scrapeStats.searched} made, ${scrapeStats.found} found a photo`);

console.log(`dist/data ready with ${ok}/${Object.keys(CATEGORIES).length} categories in ${((Date.now() - started) / 1000).toFixed(1)}s`);
// rss-parser / undici can keep sockets alive; exit explicitly once written.
process.exit(0);

import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Parser from 'rss-parser';
import { CATEGORIES } from './feeds.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3000;
const CACHE_TTL_MS = 10 * 60 * 1000; // refresh a category at most every 10 minutes
const MAX_ITEMS = 150;
const FETCH_TIMEOUT_MS = 10_000;

const parser = new Parser({
  timeout: FETCH_TIMEOUT_MS,
  headers: {
    'User-Agent': 'news-dashboard/1.0 (+https://github.com/AntonyPerez0/news-dashboard)'
  }
});

// ---------------------------------------------------------------------------
// Fetching / normalizing
// ---------------------------------------------------------------------------

// Google News appends " - Outlet" to every headline, sometimes twice
// ("Headline - Outlet news - Outlet"). Strip repeatedly; the last suffix
// stripped is the most reliable source label.
function stripAggregatorSuffix(title) {
  let titleOut = title;
  let source = null;
  for (let i = 0; i < 3; i++) {
    const match = /^(.*) - ([^-]{2,40})$/.exec(titleOut);
    if (!match) break;
    const suffix = match[2].trim();
    // A publication name, not a sentence fragment: allow capitalized names
    // or domain-like endings ("eurogamer.net"), reject "what we know?" etc.
    const looksLikeSource = /[A-Z]/.test(suffix) || /\.(com|net|org|co|tv|news)$/i.test(suffix);
    if (!looksLikeSource || /[!?…:]$/.test(suffix)) break;
    titleOut = match[1].trim();
    source = suffix;
  }
  return { title: titleOut, source };
}

function normalizeItem(item, feed) {
  let title = (item.title || '').trim();
  let source = feed.name;

  if (feed.aggregate) {
    const stripped = stripAggregatorSuffix(title);
    if (stripped.source) {
      title = stripped.title;
      source = stripped.source;
    }
  }

  return {
    title,
    source,
    link: item.link || '',
    publishedAt: item.isoDate ? Date.parse(item.isoDate) : item.pubDate ? Date.parse(item.pubDate) : 0
  };
}

async function fetchCategory(key) {
  const { feeds } = CATEGORIES[key];
  const results = await Promise.allSettled(
    feeds.map((feed) => parser.parseURL(feed.url).then((parsed) => ({ feed, parsed })))
  );

  const byTitle = new Map();
  let ok = 0;

  for (const result of results) {
    if (result.status === 'rejected') {
      console.warn(`[feeds] failed: ${result.reason?.message || result.reason}`);
      continue;
    }
    ok++;
    const { feed, parsed } = result.value;
    for (const item of parsed.items || []) {
      const normalized = normalizeItem(item, feed);
      if (!normalized.title || !normalized.link) continue;
      const dedupeKey = normalized.title.toLowerCase().replace(/\s+/g, ' ');
      const existing = byTitle.get(dedupeKey);
      if (!existing || normalized.publishedAt > existing.publishedAt) {
        byTitle.set(dedupeKey, normalized);
      }
    }
  }

  if (ok === 0) throw new Error(`all feeds failed for category "${key}"`);

  const items = [...byTitle.values()]
    .sort((a, b) => b.publishedAt - a.publishedAt)
    .slice(0, MAX_ITEMS);

  console.log(`[feeds] ${key}: ${items.length} items from ${ok}/${feeds.length} feeds`);
  return items;
}

// ---------------------------------------------------------------------------
// Cache (stale-while-revalidate)
// ---------------------------------------------------------------------------

const cache = new Map();

function getCacheEntry(key) {
  let entry = cache.get(key);
  if (!entry) {
    entry = { items: [], fetchedAt: 0, refreshing: null };
    cache.set(key, entry);
  }
  const expired = Date.now() - entry.fetchedAt > CACHE_TTL_MS;
  if (!entry.refreshing && (expired || entry.items.length === 0)) {
    entry.refreshing = fetchCategory(key)
      .then((items) => {
        entry.items = items;
        entry.fetchedAt = Date.now();
      })
      .catch((err) => {
        // Back off briefly so a total outage doesn't hammer upstream feeds.
        entry.fetchedAt = Date.now() - CACHE_TTL_MS + 60_000;
        console.error(`[feeds] ${err.message}`);
      })
      .finally(() => {
        entry.refreshing = null;
      });
  }
  return entry;
}

// ---------------------------------------------------------------------------
// Server
// ---------------------------------------------------------------------------

const app = express();
app.disable('x-powered-by');
app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, uptime: process.uptime() });
});

app.get('/api/categories', (_req, res) => {
  res.json(
    Object.entries(CATEGORIES).map(([key, cat]) => ({ key, label: cat.label }))
  );
});

app.get('/api/news', async (req, res) => {
  const key = String(req.query.category || 'headlines');
  if (!CATEGORIES[key]) {
    return res.status(400).json({ error: `unknown category: ${key}` });
  }
  const entry = getCacheEntry(key);
  if (entry.items.length === 0) {
    await entry.refreshing; // cold cache: wait for the first successful load
  }
  res.json({
    category: key,
    fetchedAt: entry.fetchedAt,
    items: entry.items
  });
});

app.listen(PORT, () => {
  console.log(`news-dashboard listening on http://localhost:${PORT}`);
});

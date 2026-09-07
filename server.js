import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CATEGORIES, fetchCategory } from './lib/news.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3000;
const CACHE_TTL_MS = 10 * 60 * 1000; // refresh a category at most every 10 minutes

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

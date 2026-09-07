// Shared RSS aggregation logic, used by both server.js (live API) and
// scripts/generate-data.js (static build for GitHub Pages).

import Parser from 'rss-parser';
import { CATEGORIES } from '../feeds.js';

export { CATEGORIES };

const parser = new Parser({
  headers: {
    'User-Agent': 'news-dashboard/1.0 (+https://github.com/AntonyPerez0/news-dashboard)'
  }
});

/** Fetch a feed with a hard timeout, then parse. */
async function parseFeed(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'news-dashboard/1.0 (+https://github.com/AntonyPerez0/news-dashboard)',
        Accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml, */*'
      }
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const xml = await res.text();
    return parser.parseString(sanitizeXml(xml));
  } finally {
    clearTimeout(timer);
  }
}

/** Escape bare "&" characters that sloppy feeds emit and strict XML rejects
 *  ("S&P 500" → "S&amp;P 500"). Real entities (named or numeric) survive. */
function sanitizeXml(xml) {
  return xml.replace(/&(?!(?:amp|lt|gt|quot|apos|#\d+|#x[0-9a-fA-F]+);)/g, '&amp;');
}

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

/** Fetch every feed in a category, merge, dedupe and sort. Never throws for
 *  a single dead feed — throws only if all feeds fail. */
export async function fetchCategory(key) {
  const { feeds } = CATEGORIES[key];
  const results = await Promise.allSettled(
    feeds.map((feed) =>
      parseFeed(feed.url).then(
        (parsed) => ({ feed, parsed }),
        (err) => {
          throw new Error(`${feed.name} (${feed.url}): ${err.message}`);
        }
      )
    )
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

  return [...byTitle.values()]
    .sort((a, b) => b.publishedAt - a.publishedAt)
    .slice(0, 150);
}

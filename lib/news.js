// Shared RSS aggregation logic, used by both server.js (live API) and
// scripts/generate-data.js (static build for GitHub Pages).

import Parser from 'rss-parser';
import { CATEGORIES } from '../feeds.js';

export { CATEGORIES };

const parser = new Parser({
  customFields: {
    item: [
      ['media:thumbnail', 'mediaThumbnails', { keepArray: true }],
      ['media:content', 'mediaContents', { keepArray: true }],
      ['content:encoded', 'contentEncoded']
    ]
  },
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

// ---------------------------------------------------------------------------
// Media / snippet extraction
// ---------------------------------------------------------------------------

function attrNum(value) {
  const n = parseInt(value, 10);
  return Number.isFinite(n) ? n : 0;
}

function collectMedia(node, out) {
  if (!node) return;
  for (const entry of Array.isArray(node) ? node : [node]) {
    const attrs = (entry && entry.$) || entry || {};
    const url = attrs.url || attrs.href;
    if (url && /^https?:\/\//i.test(url)) {
      out.push({ url, width: attrNum(attrs.width), type: attrs.type || attrs.medium || '' });
    }
  }
}

/** BBC's image CDN resizes on demand but its RSS only advertises 240px wide
 *  thumbnails — rewrite to a larger variant for crisp tiles. */
function upgradeImage(url) {
  return url
    .replace(/(ichef\.bbci\.co\.uk\/[^/]+\/)(standard|n)\/\d+\//, '$1standard/976/')
    .replace(/(ichef\.bbci\.co\.uk\/news)\/\d+\//, '$1/976/');
}

function extractImage(item) {
  const candidates = [];
  if (item.enclosure?.url) collectMedia([item.enclosure], candidates);
  collectMedia(item.mediaThumbnails, candidates);
  collectMedia(item.mediaContents, candidates);
  const html = item.contentEncoded || item.content || item.description || '';
  const imgMatch = /<img[^>]+src=["']?(https?:\/\/[^"'\s>]+)/i.exec(html);
  if (imgMatch) candidates.push({ url: imgMatch[1], width: 0, type: '' });

  const images = candidates.filter(
    (c) =>
      !c.type ||
      /^image\//i.test(c.type) ||
      /\.(jpe?g|png|webp|avif)([?#]|$)/i.test(c.url)
  );
  if (!images.length) return null;
  images.sort((a, b) => b.width - a.width);
  return upgradeImage(images[0].url);
}

const ENTITIES = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
  hellip: '…', mdash: '—', ndash: '–', middot: '·',
  rsquo: '\u2019', lsquo: '\u2018', ldquo: '\u201c', rdquo: '\u201d'
};

function decodeEntities(text) {
  return text.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (match, entity) => {
    if (entity[0] === '#') {
      const code =
        entity[1] === 'x' || entity[1] === 'X'
          ? parseInt(entity.slice(2), 16)
          : parseInt(entity.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : match;
    }
    const value = ENTITIES[entity.toLowerCase()];
    return value ?? match;
  });
}

function extractSnippet(item) {
  const raw = item.contentSnippet || item.contentEncoded || item.content || item.description || '';
  const text = decodeEntities(String(raw).replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();
  if (text.length < 40) return null;
  return text.length > 240 ? text.slice(0, 237).trimEnd() + '…' : text;
}

// ---------------------------------------------------------------------------
// Normalizing
// ---------------------------------------------------------------------------

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

  // Google News summaries are link-lists, not real excerpts.
  let snippet = feed.aggregate ? null : extractSnippet(item);
  const titlePrefix = title.toLowerCase().slice(0, 60);
  if (snippet && snippet.toLowerCase().slice(0, 60).startsWith(titlePrefix.slice(0, 40))) {
    snippet = null;
  }

  return {
    title,
    source,
    link: item.link || '',
    publishedAt: item.isoDate ? Date.parse(item.isoDate) : item.pubDate ? Date.parse(item.pubDate) : 0,
    image: extractImage(item),
    snippet
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

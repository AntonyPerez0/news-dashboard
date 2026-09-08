// Shared RSS aggregation logic, used by both server.js (live API) and
// scripts/generate-data.js (static build for GitHub Pages).

import Parser from 'rss-parser';
import { GoogleDecoder } from 'google-news-url-decoder';
import { CATEGORIES } from './feeds.js';

export { CATEGORIES };

const parser = new Parser({
  customFields: {
    item: [
      ['media:thumbnail', 'mediaThumbnails', { keepArray: true }],
      ['media:content', 'mediaContents', { keepArray: true }],
      ['media:group', 'mediaGroups', { keepArray: true }],
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
    // Suffix may contain internal hyphens ("WSB-TV"), but not more than two.
    const match = /^(.*) - ([^-]+(?:-[^-]+){0,2})$/.exec(titleOut);
    if (!match) break;
    const suffix = match[2].trim();
    // A publication name, not a sentence fragment: accept capitalized names
    // ("Reuters") or anything domain-like — no whitespace plus a dot
    // ("eurogamer.net", "dust2.us", "japantimes.co.jp"); reject sentences.
    const looksLikeSource = /[A-Z]/.test(suffix) ||
      (/\./.test(suffix) && !/\s/.test(suffix));
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

/** Mixed content (http:// images on an https:// page) is blocked by browsers. */
function httpsify(url) {
  return url.startsWith('http://') ? 'https://' + url.slice(7) : url;
}

function collectMedia(node, out) {
  if (!node) return;
  for (const entry of Array.isArray(node) ? node : [node]) {
    const attrs = (entry && entry.$) || entry || {};
    const url = attrs.url || attrs.href;
    if (url && /^https?:\/\//i.test(url)) {
      out.push({ url: httpsify(url), width: attrNum(attrs.width), type: attrs.type || attrs.medium || '' });
    }
  }
}

function collectGroupMedia(groups, out) {
  if (!groups) return;
  for (const group of Array.isArray(groups) ? groups : [groups]) {
    if (!group) continue;
    collectMedia(group['media:thumbnail'] || group.mediaThumbnail, out);
    collectMedia(group['media:content'], out);
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
  collectGroupMedia(item.mediaGroups, candidates);
  const html = item.contentEncoded || item.content || item.description || '';
  const imgMatch = /<img[^>]+src=["']?(https?:\/\/[^"'\s>]+)/i.exec(html);
  if (imgMatch) candidates.push({ url: httpsify(imgMatch[1]), width: 0, type: '' });

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

// Match-preview / score-widget spam that pollutes esports search feeds.
const JUNK_TITLE_RE =
  /prediction\s*&?\s*betting tip|betting tip|live score and match stats|match preview & odds/i;

function isJunk(title) {
  return JUNK_TITLE_RE.test(title);
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

// ---------------------------------------------------------------------------
// og:image scraping — most RSS feeds carry no photo, but almost every article
// page declares one for social sharing. Scrape it as a fallback.
// ---------------------------------------------------------------------------

const SCRAPE_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

// link -> { url: string|null, at: number }; negative results expire so sites
// that add photos later get picked up on a future refresh.
const IMAGE_CACHE = new Map();
const NEGATIVE_TTL_MS = 6 * 60 * 60 * 1000;

// Google News links point at a JS-redirect gateway that hides og:image from
// server-side fetchers — resolve them back to the real publisher URL first.
const googleDecoder = new GoogleDecoder();
const GOOGLE_NEWS_HOST = /(^|\.)news\.google\.com$/i;

async function resolveArticleUrl(link) {
  let hostname;
  try {
    hostname = new URL(link).hostname;
  } catch {
    return null;
  }
  if (!GOOGLE_NEWS_HOST.test(hostname)) return link;
  try {
    const out = await googleDecoder.decode(link);
    if (out?.status && out.decoded_url) return out.decoded_url;
  } catch {
    /* fall through */
  }
  return null;
}

const META_IMAGE_RE =
  /<meta[^>]*(?:property|name)=["'](?:og:image(?::secure_url)?|twitter:image(?::src)?)["'][^>]*>/gi;
const CONTENT_RE = /content=["']([^"']+)["']/i;

function extractMetaImage(html, baseUrl) {
  for (const tag of html.match(META_IMAGE_RE) || []) {
    const content = CONTENT_RE.exec(tag)?.[1];
    if (!content) continue;
    let url = decodeEntities(content.trim());
    try {
      url = new URL(url, baseUrl).href; // resolves relative og:image paths
    } catch {
      continue;
    }
    if (!/^https:\/\//i.test(url)) continue;
    if (/\.(svg|gif)([?#]|$)/i.test(url)) continue;
    return url;
  }
  return null;
}

async function scrapeOgImage(link) {
  const cached = IMAGE_CACHE.get(link);
  if (cached) {
    if (cached.url || Date.now() - cached.at < NEGATIVE_TTL_MS) return cached.url;
  }

  const articleUrl = await resolveArticleUrl(link);
  let url = null;
  if (articleUrl) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 7000);
    try {
      const res = await fetch(articleUrl, {
        signal: controller.signal,
        redirect: 'follow',
        headers: { 'User-Agent': SCRAPE_UA, Accept: 'text/html,application/xhtml+xml,*/*' }
      });
      const contentType = res.headers.get('content-type') || '';
      if (res.ok && contentType.includes('html')) {
        // og:image lives in <head>; no need to download the whole page
        const reader = res.body.getReader();
        const chunks = [];
        let size = 0;
        while (size < 150_000) {
          const { done, value } = await reader.read();
          if (done) break;
          chunks.push(value);
          size += value.length;
        }
        await reader.cancel().catch(() => {});
        const head = Buffer.concat(chunks).toString('utf8');
        url = extractMetaImage(head, res.url || articleUrl);
      }
    } catch {
      /* timeout, 403, redirect loop — leave null */
    } finally {
      clearTimeout(timer);
    }
  }

  IMAGE_CACHE.set(link, { url, at: Date.now() });
  return url;
}

async function mapLimit(items, limit, fn) {
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const index = next++;
      await fn(items[index], index);
    }
  });
  await Promise.all(workers);
}

/** Fill in missing item photos by scraping the article pages. */
export async function enrichImages(items, { limit = 150, budgetMs = 30_000, concurrency = 10 } = {}) {
  const deadline = Date.now() + budgetMs;
  const targets = items.filter((item) => !item.image && item.link).slice(0, limit);
  if (!targets.length) return items;

  await mapLimit(targets, concurrency, async (item) => {
    if (Date.now() > deadline) return;
    const url = await scrapeOgImage(item.link);
    if (url) item.image = url;
  });
  return items;
}

/** Fetch every feed in a category, merge, dedupe and sort. Never throws for
 *  a single dead feed — throws only if all feeds fail. */
export async function fetchCategoryFeeds(key) {
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
      if (isJunk(normalized.title)) continue;
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

/** Feeds + blocking image enrichment. Used by the static build, which has
 *  time to scrape every article before deploying. */
export async function fetchCategory(key, enrichOpts) {
  const items = await fetchCategoryFeeds(key);
  await enrichImages(items, enrichOpts);
  return items;
}

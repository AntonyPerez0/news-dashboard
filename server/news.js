// Shared RSS aggregation logic, used by both server.js (live API) and
// scripts/generate-data.js (static build for GitHub Pages).

import Parser from 'rss-parser';
import { GoogleDecoder } from 'google-news-url-decoder';
import { CATEGORIES, DEFAULT_MAX_AGE_DAYS } from './feeds.js';

export { CATEGORIES };

const BOT_UA = 'news-dashboard/1.0 (+https://github.com/AntonyPerez0/news-dashboard)';

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
    'User-Agent': BOT_UA
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
        'User-Agent': BOT_UA,
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
export function sanitizeXml(xml) {
  return xml.replace(/&(?!(?:amp|lt|gt|quot|apos|#\d+|#x[0-9a-fA-F]+);)/g, '&amp;');
}

const nameWords = (name) => name.toLowerCase().split(/[^a-z0-9.]+/).filter((word) => word.length > 2);

// Google News appends " - Outlet" to every headline, sometimes twice
// ("Headline - Outlet news - Outlet"). Strip repeatedly; the last suffix
// stripped is the most reliable source label.
export function stripAggregatorSuffix(title) {
  let titleOut = title;
  let source = null;
  for (let i = 0; i < 3; i++) {
    // Suffix may contain internal hyphens ("WSB-TV"), but not more than two.
    const match = /^(.*) - ([^-]+(?:-[^-]+){0,2})$/.exec(titleOut);
    if (!match) break;
    const suffix = match[2].trim();
    // A publication name, not a sentence fragment: accept capitalized names
    // ("Reuters"), anything domain-like — no whitespace plus a dot
    // ("eurogamer.net", "dust2.us", "japantimes.co.jp") — or a single
    // lowercase word ("space4games"); reject sentences.
    const looksLikeSource = /[A-Z]/.test(suffix) || /^[\w.]+$/.test(suffix);
    if (!looksLikeSource || /[!?…:]$/.test(suffix)) break;
    // Past the first suffix, only the same outlet again counts. Anything else
    // is part of the headline ("Hotfixes - November 11, 2026 - Blizzard News",
    // "Druid Guide - Talents, Rotations & More - Wowhead").
    if (source !== null) {
      const known = nameWords(source);
      if (!nameWords(suffix).some((word) => known.includes(word))) break;
    }
    titleOut = match[1].trim();
    source = suffix;
    // The outlet's own page title can repeat its name behind a dash of its
    // own ("Headline — Blizzard News - Blizzard News").
    for (const dash of [' — ', ' – ', ' | ']) {
      if (titleOut.endsWith(dash + source)) titleOut = titleOut.slice(0, -(dash + source).length).trim();
    }
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

export function isJunk(title) {
  return JUNK_TITLE_RE.test(title);
}

/** Whether a normalized story belongs in its feed's category. A feed can
 *  narrow itself with `match` (a general feed kept to one topic) and
 *  `exclude`; an outlet's own index page ("Blizzard News") is never a story. */
export function wanted(item, feed) {
  if (item.title.toLowerCase() === item.source.toLowerCase()) return false;
  if (feed.match && !feed.match.test(item.title)) return false;
  if (feed.exclude && feed.exclude.test(item.title)) return false;
  return true;
}

export function normalizeItem(item, feed) {
  // Some feeds escape twice ("Hope &amp;amp; Fear"), leaving a literal
  // "&amp;" after XML parsing.
  let title = decodeEntities(item.title || '').trim();
  let source = feed.name;

  if (feed.aggregate) {
    const stripped = stripAggregatorSuffix(title);
    if (stripped.source) {
      title = stripped.title;
      source = stripped.source;
    }
  }

  // Section names a site tacks onto its page titles (feed.trim).
  for (const tail of feed.trim || []) {
    if (title.endsWith(tail)) title = title.slice(0, -tail.length).trim();
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
// Page-meta scraping — most RSS feeds carry no photo and Google News never
// does, but almost every article page declares an og:image (photo) and an
// og:description (summary) for social sharing. Scrape both in one request.
// ---------------------------------------------------------------------------

const BROWSER_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

// Identify honestly first: some publishers (ESPN, Phys.org) serve a declared
// bot but challenge anything posing as a browser. Others answer only
// browsers, so that is the second attempt.
const SCRAPE_UAS = [BOT_UA, BROWSER_UA];

// link -> { image, description, at }; fully-negative results expire so sites
// that change their pages get picked up on a future refresh.
const PAGE_CACHE = new Map();
const PAGE_CACHE_MAX = 5000; // ~3x the stories live at once; the server runs for weeks
const NEGATIVE_TTL_MS = 6 * 60 * 60 * 1000;

// How much scraping a run actually did, for the build log.
export const scrapeStats = { cached: 0, fetched: 0, searched: 0, found: 0 };

/** What the scraper knows about `links`, as plain data. The static build
 *  publishes this next to the news so the next run starts from it instead
 *  of fetching every article page again. */
export function exportPageCache(links) {
  const out = {};
  for (const link of links) {
    const entry = PAGE_CACHE.get(link);
    if (entry) out[link] = entry;
  }
  return out;
}

/** Loads entries written by exportPageCache. Anything not shaped like one
 *  is skipped; returns how many were taken. */
export function importPageCache(entries) {
  if (!entries || typeof entries !== 'object' || Array.isArray(entries)) return 0;
  const text = (value) => (typeof value === 'string' && value ? value : null);
  let taken = 0;
  for (const [link, entry] of Object.entries(entries)) {
    if (taken >= PAGE_CACHE_MAX) break;
    if (!/^https?:\/\//i.test(link) || !entry || typeof entry !== 'object') continue;
    if (!Number.isFinite(entry.at) || entry.at > Date.now()) continue;
    const image = text(entry.image);
    setBounded(
      PAGE_CACHE,
      link,
      {
        image: image && /^https:\/\//i.test(image) ? image : null,
        description: text(entry.description),
        site: text(entry.site),
        at: entry.at,
        ...(Number.isFinite(entry.searches) ? { searches: entry.searches, searchedAt: Number(entry.searchedAt) || 0 } : {})
      },
      PAGE_CACHE_MAX
    );
    taken++;
  }
  return taken;
}

/** Map.set that keeps the map at `max` entries by dropping the ones written
 *  longest ago. */
export function setBounded(map, key, value, max) {
  map.delete(key); // re-inserting moves the key to the young end
  map.set(key, value);
  while (map.size > max) map.delete(map.keys().next().value);
}

// Google News links point at a JS-redirect gateway that hides meta tags from
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

/** The attributes of an HTML tag, names lower-cased. Read left to right so
 *  that text inside one value is never taken for another attribute. Values
 *  may be double-quoted, single-quoted or bare (`<meta property=og:image
 *  content="…">`, as Gannett's sites write it). */
function tagAttrs(tag) {
  const attrs = {};
  const inner = tag.replace(/^<\w+/, '').replace(/\/?>$/, '');
  for (const [, name, dq, sq, bare] of inner.matchAll(
    /([^\s"'<>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g
  )) {
    attrs[name.toLowerCase()] ??= dq ?? sq ?? bare ?? '';
  }
  return attrs;
}

/** `<meta>` tags as [key, content] pairs, key lower-cased. */
function metaTags(html) {
  const out = [];
  for (const tag of html.match(/<meta\s[^>]*>/gi) || []) {
    const attrs = tagAttrs(tag);
    const key = attrs.property ?? attrs.name;
    if (key && attrs.content) out.push([key.toLowerCase(), attrs.content]);
  }
  return out;
}

const META_IMAGE_KEY = /^(?:og:image(?::secure_url)?|twitter:image(?::src)?)$/;

export function extractMetaImage(html, baseUrl) {
  for (const [key, content] of metaTags(html)) {
    if (!META_IMAGE_KEY.test(key)) continue;
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

/** og:description wins, then the plain description, then twitter:description,
 *  then JSON-LD "description" (many sites only declare it there). */
export function extractMetaDescription(html) {
  const byKey = {};
  for (const [key, content] of metaTags(html)) {
    if (key === 'og:description' && !byKey.og) byKey.og = content;
    else if (key === 'description' && !byKey.plain) byKey.plain = content;
    else if (key === 'twitter:description' && !byKey.twitter) byKey.twitter = content;
  }
  if (byKey.og ?? byKey.plain ?? byKey.twitter) {
    return byKey.og ?? byKey.plain ?? byKey.twitter;
  }
  // JSON-LD: "description":"..." (first newsArticle-like block wins)
  const jsonLd = /"description"\s*:\s*"((?:[^"\\]|\\.){40,})"/.exec(html);
  if (jsonLd) {
    try {
      return JSON.parse(`"${jsonLd[1]}"`);
    } catch {
      return jsonLd[1].replace(/\\"/g, '"');
    }
  }
  return null;
}

export function tidySnippet(text) {
  if (!text) return null;
  const cleaned = decodeEntities(text.replace(/\s+/g, ' ')).trim();
  if (cleaned.length < 40) return null;
  return cleaned.length > 240 ? cleaned.slice(0, 237).trimEnd() + '…' : cleaned;
}

// Meta tags live in <head>, so the page is not downloaded whole. The first
// 150 KB is always read (JSON-LD often sits early in <body>); past that,
// reading continues only until </head>, because some heads carry 300 KB of
// inline script before their og:image.
const HEAD_MIN_BYTES = 150_000;
const HEAD_MAX_BYTES = 600_000;

/** Reads the start of an HTML response body as text: at least `min` bytes,
 *  then on to the closing </head>, never past `max`. */
export async function readHead(body, { min = HEAD_MIN_BYTES, max = HEAD_MAX_BYTES } = {}) {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let html = '';
  let size = 0;
  let headClosed = false;
  while (size < max && !(size >= min && headClosed)) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    const from = Math.max(0, html.length - 8); // "</head>" may straddle two chunks
    html += decoder.decode(value, { stream: true });
    headClosed ||= /<\/head\s*>/i.test(html.slice(from));
  }
  await reader.cancel().catch(() => {});
  return html;
}

async function fetchPageHead(url, userAgent) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 7000);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      redirect: 'follow',
      headers: { 'User-Agent': userAgent, Accept: 'text/html,application/xhtml+xml,*/*' }
    });
    const contentType = res.headers.get('content-type') || '';
    // Not `res.ok`: some sites send the article with a 3xx status and no
    // Location (Blizzard's hotfix posts arrive as 307).
    if (res.status >= 400 || !contentType.includes('html')) return null;
    return { html: await readHead(res.body), url: res.url || url };
  } catch {
    return null; // timeout, 403, redirect loop
  } finally {
    clearTimeout(timer);
  }
}

// ---------------------------------------------------------------------------
// Photo search — the last resort for a story whose own page gave no photo.
// Some publishers (AP, Reuters, WSJ…) refuse every automated request, but
// their stories are syndicated, and Bing's news feed lists those copies with
// a thumbnail. A result counts only if its headline is the same story's.
// ---------------------------------------------------------------------------

const PHOTO_SEARCH = 'https://www.bing.com/news/search';
// A syndicated copy can take a while to appear, so a miss is retried: after
// 30 min, 1 h, 2 h, 4 h, then no more.
const SEARCH_RETRY_MS = 30 * 60 * 1000;
const SEARCH_MAX_TRIES = 5;

/** The photo a news-search feed offers for the story titled `title`, or
 *  null. Exported for tests; `xml` is the feed as text. */
export function pickSearchPhoto(xml, title) {
  for (const [, block] of xml.matchAll(/<item>([\s\S]*?)<\/item>/g)) {
    const found = /<title>([\s\S]*?)<\/title>/.exec(block)?.[1];
    const image = /<News:Image>([\s\S]*?)<\/News:Image>/.exec(block)?.[1];
    if (!found || !image) continue;
    if (!areNearDuplicates(decodeEntities(found), title)) continue;
    const url = httpsify(decodeEntities(image.trim()));
    if (/^https:\/\/www\.bing\.com\/th\?/.test(url)) return url;
  }
  return null;
}

async function searchPhoto(title) {
  scrapeStats.searched++;
  try {
    const res = await fetch(`${PHOTO_SEARCH}?q=${encodeURIComponent(title)}&format=rss`, {
      signal: AbortSignal.timeout(7000),
      headers: { 'User-Agent': BOT_UA, Accept: 'application/rss+xml, application/xml, text/xml, */*' }
    });
    if (!res.ok) return null;
    const photo = pickSearchPhoto(await res.text(), title);
    if (photo) scrapeStats.found++;
    return photo;
  } catch {
    return null; // timeout, blocked — the story simply stays without a photo
  }
}

/** Whether a cached entry without a photo is due another search. */
export function searchDue(entry, now = Date.now()) {
  const tries = entry.searches || 0;
  if (tries >= SEARCH_MAX_TRIES) return false;
  return tries === 0 || now - (entry.searchedAt || 0) >= SEARCH_RETRY_MS * 2 ** (tries - 1);
}

async function scrapePageMeta(link, title) {
  const cached = PAGE_CACHE.get(link);
  if (cached) {
    const pageFresh = cached.image || cached.description || Date.now() - cached.at < NEGATIVE_TTL_MS;
    if (pageFresh) {
      scrapeStats.cached++;
      // The page has been read; only the photo may still be worth looking for.
      if (!cached.image && title && searchDue(cached)) {
        cached.image = await searchPhoto(title);
        cached.searches = (cached.searches || 0) + 1;
        cached.searchedAt = Date.now();
      }
      return cached;
    }
  }
  scrapeStats.fetched++;

  const articleUrl = await resolveArticleUrl(link);
  let image = null;
  let description = null;
  let site = null;
  if (articleUrl) {
    try {
      site = new URL(articleUrl).hostname.replace(/^www\./, '');
    } catch {
      site = null;
    }
    for (const userAgent of SCRAPE_UAS) {
      const page = await fetchPageHead(articleUrl, userAgent);
      if (!page) continue;
      image ??= extractMetaImage(page.html, page.url);
      description ??= tidySnippet(extractMetaDescription(page.html));
      if (image && description) break;
    }
  }

  const out = { image, description, site, at: Date.now() };
  if (cached?.searches) Object.assign(out, { searches: cached.searches, searchedAt: cached.searchedAt });
  if (!out.image && title && searchDue(out)) {
    out.image = await searchPhoto(title);
    out.searches = (out.searches || 0) + 1;
    out.searchedAt = Date.now();
  }
  setBounded(PAGE_CACHE, link, out, PAGE_CACHE_MAX);
  return out;
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

/** Fill in missing photos and excerpts by scraping the article pages —
 *  both come from the same single request per story. */
export async function enrichImages(items, { limit = 150, budgetMs = 30_000, concurrency = 10 } = {}) {
  const deadline = Date.now() + budgetMs;
  const targets = items
    .filter((item) => (!item.image || !item.snippet) && item.link)
    .slice(0, limit);
  if (!targets.length) return items;

  await mapLimit(targets, concurrency, async (item) => {
    // Out of time: no more requests, but what is already known still applies.
    const meta =
      Date.now() > deadline
        ? PAGE_CACHE.get(item.link)
        : // Only a story still without a photo is worth a search.
          await scrapePageMeta(item.link, item.image ? null : item.title);
    if (!meta) return;
    if (!item.image && meta.image) item.image = meta.image;
    if (!item.snippet && meta.description) item.snippet = meta.description;
    if (!item.site && meta.site) item.site = meta.site;
  });
  return items;
}

// ---------------------------------------------------------------------------
// Near-duplicate collapsing — different feeds word the same story slightly
// differently ("with $45m owed" vs "with over $45m owed"), which exact-title
// deduping lets through and the grid then shows twice.
// ---------------------------------------------------------------------------

export function titleTokens(title) {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
}

/** True when two headlines describe the same story: ≥85% token containment
 *  and no conflicting numbers — different scores or amounts ($45m vs $120m)
 *  never merge, but a headline that omits the year entirely still can. */
export function areNearDuplicates(aTitle, bTitle) {
  const a = titleTokens(aTitle);
  const b = titleTokens(bTitle);
  if (a.length < 5 || b.length < 5) return false;

  const setA = new Set(a);
  const setB = new Set(b);
  const numsA = [...setA].filter((token) => /\d/.test(token));
  const numsB = [...setB].filter((token) => /\d/.test(token));
  if (numsA.length && numsB.length && !numsA.some((token) => setB.has(token))) {
    return false;
  }

  let shared = 0;
  for (const token of setA) {
    if (setB.has(token)) shared++;
  }
  return shared / Math.min(setA.size, setB.size) >= 0.85;
}

/** Keep the first of each near-duplicate run (input is newest-first, so the
 *  freshest wording survives) — unless a later copy `isPreferred` and the
 *  kept one is not, in which case it takes the kept one's place. */
export function dedupeNearDuplicates(items, isPreferred = () => false) {
  const kept = [];
  for (const item of items) {
    const at = kept.findIndex((other) => areNearDuplicates(other.title, item.title));
    if (at < 0) kept.push(item);
    else if (isPreferred(item) && !isPreferred(kept[at])) kept[at] = item;
  }
  return kept;
}

// ---------------------------------------------------------------------------
// Age cut-off — feeds carry evergreen items and long tails ("Download now",
// published 563 days ago), which do not belong on a live news board.
// ---------------------------------------------------------------------------

const DAY_MS = 24 * 60 * 60 * 1000;
const MIN_STORIES = 24; // enough to fill the largest grid twice over

/** Drops stories older than `maxAgeMs`. Undated stories are kept: their age
 *  is unknown and they already sort last. A slow category is topped back up
 *  to `minItems` with its newest older stories rather than left near-empty. */
export function dropOldStories(items, { maxAgeMs, minItems = MIN_STORIES, now = Date.now() }) {
  const isCurrent = (item) => !item.publishedAt || now - item.publishedAt <= maxAgeMs;
  const current = items.filter(isCurrent);
  if (current.length >= minItems) return current;
  const older = items
    .filter((item) => !isCurrent(item))
    .sort((a, b) => b.publishedAt - a.publishedAt)
    .slice(0, minItems - current.length);
  return [...current, ...older].sort((a, b) => b.publishedAt - a.publishedAt);
}

/** `official: true` marks a publisher's own feed; in a search feed that
 *  mixes outlets, a pattern picks the publisher out by source name. */
export function isOfficial(item, feed) {
  return feed.official instanceof RegExp ? feed.official.test(item.source) : Boolean(feed.official);
}

/** One candidate per headline. Between copies, the one from a feed marked
 *  `official` wins (the publisher's own post over a repost of it); otherwise
 *  the most recently published. */
export function pickByTitle(candidates) {
  const byTitle = new Map();
  for (const candidate of candidates) {
    const key = candidate.item.title.toLowerCase().replace(/\s+/g, ' ');
    const held = byTitle.get(key);
    const better =
      !held ||
      (candidate.official && !held.official) ||
      (candidate.official === held.official && candidate.item.publishedAt > held.item.publishedAt);
    if (better) byTitle.set(key, candidate);
  }
  return [...byTitle.values()];
}

/** Fetch every feed in a category, merge, dedupe and sort. Never throws for
 *  a single dead feed — throws only if all feeds fail. */
export async function fetchCategoryFeeds(key) {
  const { feeds, maxAgeDays = DEFAULT_MAX_AGE_DAYS } = CATEGORIES[key];
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

  const candidates = [];
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
      if (isJunk(normalized.title) || !wanted(normalized, feed)) continue;
      candidates.push({ item: normalized, official: isOfficial(normalized, feed) });
    }
  }

  if (ok === 0) throw new Error(`all feeds failed for category "${key}"`);

  const picked = pickByTitle(candidates);
  const official = new Set(picked.filter((candidate) => candidate.official).map((candidate) => candidate.item));
  const sorted = picked.map((candidate) => candidate.item).sort((a, b) => b.publishedAt - a.publishedAt);
  const current = dropOldStories(sorted, { maxAgeMs: maxAgeDays * DAY_MS });
  return dedupeNearDuplicates(current, (item) => official.has(item))
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

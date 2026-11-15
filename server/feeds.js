// News feed registry. Each category aggregates several RSS feeds so a single
// dead outlet never leaves the dashboard empty.
//
// `aggregate: true` marks Google News feeds, whose titles are suffixed with
// " - Outlet" — news.js strips the suffix and uses it as the source name.
//
// Optional per feed:
//   match / exclude  keep or drop stories by headline (RegExp)
//   trim             endings to remove from headlines (string[])
//   official         the publisher's own feed: its copy of a story wins over
//                    a repost with the same headline. `true`, or a RegExp
//                    naming the publisher's sources in a mixed search feed
//
// Two environment variables reconfigure the registry without editing code:
//
//   NEWS_EDITION     Google News edition as "<COUNTRY>:<language>", e.g.
//                    "GB:en", "DE:de", "MX:es-419". Default "US:en".
//   NEWS_FEEDS_FILE  Path to a JSON file that replaces the categories below
//                    (see README → "Your own feeds and region").

import fs from 'node:fs';

const GOOGLE_NEWS = 'https://news.google.com/rss';

/** Stories older than this are dropped, unless a category sets its own
 *  `maxAgeDays`. */
export const DEFAULT_MAX_AGE_DAYS = 3;

/** "GB:en" → { country: 'GB', language: 'en' }. Throws on anything else. */
export function parseEdition(value) {
  const match = /^([A-Za-z]{2}):([A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,4})?)$/.exec((value || 'US:en').trim());
  if (!match) {
    throw new Error(`NEWS_EDITION must look like "US:en" or "MX:es-419", got "${value}"`);
  }
  return { country: match[1].toUpperCase(), language: match[2] };
}

function editionQuery({ country, language }) {
  // English editions are addressed as en-US, en-GB…; others by bare language.
  const hl = language === 'en' ? `en-${country}` : language;
  return `hl=${hl}&gl=${country}&ceid=${country}:${language}`;
}

function googleFeed(path, edition, query = '') {
  return {
    url: `${GOOGLE_NEWS}${path}?${query}${editionQuery(edition)}`,
    name: 'Google News',
    aggregate: true
  };
}

const googleTop = (edition) => googleFeed('', edition);
const googleTopic = (topic, edition) => googleFeed(`/headlines/section/topic/${topic}`, edition);
const googleSearch = (search, edition) =>
  googleFeed('/search', edition, `q=${encodeURIComponent(search).replace(/%20/g, '+').replace(/%3A/gi, ':')}&`);

const FOREVER = /\bforever\b/i;
const BLIZZARD = /^(Blizzard( News| Entertainment)?|World of Warcraft)$/i;
// Blizzard's page titles end in the game's name, sometimes the site's too.
const BLIZZARD_TAILS = [' — World of Warcraft', ' — WoW'];

/** Topics Google News publishes a feed for. */
const GOOGLE_TOPICS = [
  'WORLD', 'NATION', 'BUSINESS', 'TECHNOLOGY', 'ENTERTAINMENT', 'SPORTS', 'SCIENCE', 'HEALTH'
];

export function defaultCategories(edition = parseEdition()) {
  return {
    headlines: {
      label: 'Headlines',
      feeds: [
        googleTop(edition),
        { url: 'http://feeds.bbci.co.uk/news/rss.xml', name: 'BBC News' },
        { url: 'https://feeds.npr.org/1001/rss.xml', name: 'NPR' },
        { url: 'https://www.aljazeera.com/xml/rss/all.xml', name: 'Al Jazeera' }
      ]
    },
    world: {
      label: 'World',
      feeds: [
        googleTopic('WORLD', edition),
        { url: 'http://feeds.bbci.co.uk/news/world/rss.xml', name: 'BBC News' },
        { url: 'https://feeds.npr.org/1004/rss.xml', name: 'NPR' },
        { url: 'https://www.aljazeera.com/xml/rss/all.xml', name: 'Al Jazeera' }
      ]
    },
    technology: {
      label: 'Technology',
      feeds: [
        googleTopic('TECHNOLOGY', edition),
        { url: 'https://www.theverge.com/rss/index.xml', name: 'The Verge' },
        { url: 'https://feeds.arstechnica.com/arstechnica/index', name: 'Ars Technica' },
        { url: 'https://techcrunch.com/feed/', name: 'TechCrunch' },
        { url: 'http://feeds.bbci.co.uk/news/technology/rss.xml', name: 'BBC News' }
      ]
    },
    gaming: {
      label: 'Gaming',
      feeds: [
        { url: 'https://www.theverge.com/rss/games/index.xml', name: 'The Verge' },
        { url: 'https://www.polygon.com/rss/index.xml', name: 'Polygon' },
        { url: 'https://feeds.ign.com/ign/games-all', name: 'IGN' },
        { url: 'https://www.gamespot.com/feeds/news/', name: 'GameSpot' },
        { url: 'https://www.eurogamer.net/feed', name: 'Eurogamer' }
      ]
    },
    esports: {
      label: 'CS Esports',
      feeds: [
        { url: 'https://www.hltv.org/rss/news', name: 'HLTV' },
        // Google News search RSS: fresh Counter-Strike stories from all outlets
        googleSearch('counter-strike when:7d', edition)
      ]
    },
    wowforever: {
      label: 'WoW: Forever',
      maxAgeDays: 7,
      feeds: [
        // Official posts. Blizzard publishes no RSS, so its news site is
        // read through Google News.
        {
          ...googleSearch('site:news.blizzard.com "WoW: Forever" when:14d', edition),
          trim: BLIZZARD_TAILS,
          official: true
        },
        { url: 'https://www.wowhead.com/news/rss/forever', name: 'Wowhead' },
        // General WoW feeds (and one tag feed that also carries round-ups),
        // kept to this game by their headlines.
        { url: 'https://massivelyop.com/tag/wow-forever/feed/', name: 'Massively Overpowered', match: FOREVER },
        {
          url: 'https://www.mmo-champion.com/external.php?do=rss&type=newcontent&sectionid=1&days=120&count=20',
          name: 'MMO-Champion',
          match: FOREVER
        },
        { url: 'https://blizzardwatch.com/feed/', name: 'Blizzard Watch', match: FOREVER },
        // Everyone else. Class and profession guides are reference pages
        // that would crowd out the news.
        {
          ...googleSearch('"WoW Forever" OR "World of Warcraft: Forever" when:7d', edition),
          trim: BLIZZARD_TAILS,
          exclude: /\bguide\b/i,
          official: BLIZZARD
        }
      ]
    }
  };
}

// ---------------------------------------------------------------------------
// Custom registry (NEWS_FEEDS_FILE)
// ---------------------------------------------------------------------------

function customSource(entry, where, edition) {
  if (entry.googleTop) return googleTop(edition);
  if (entry.googleTopic !== undefined) {
    const topic = String(entry.googleTopic).toUpperCase();
    if (!GOOGLE_TOPICS.includes(topic)) {
      throw new Error(`${where}: googleTopic must be one of ${GOOGLE_TOPICS.join(', ')}`);
    }
    return googleTopic(topic, edition);
  }
  if (entry.googleSearch !== undefined) {
    if (typeof entry.googleSearch !== 'string' || !entry.googleSearch.trim()) {
      throw new Error(`${where}: googleSearch must be a search phrase`);
    }
    return googleSearch(entry.googleSearch.trim(), edition);
  }
  if (typeof entry.url !== 'string' || !/^https?:\/\//i.test(entry.url)) {
    throw new Error(`${where}: needs an http(s) "url", or one of googleTop / googleTopic / googleSearch`);
  }
  if (typeof entry.name !== 'string' || !entry.name.trim()) {
    throw new Error(`${where}: needs a "name" (shown as the source on each tile)`);
  }
  return { url: entry.url, name: entry.name.trim(), ...(entry.aggregate ? { aggregate: true } : {}) };
}

/** "match" / "exclude": a case-insensitive pattern tested against headlines. */
function customPattern(value, where) {
  if (typeof value !== 'string' || !value) throw new Error(`${where}: must be a non-empty pattern`);
  try {
    return new RegExp(value, 'i');
  } catch (err) {
    throw new Error(`${where}: not a valid pattern (${err.message})`);
  }
}

function customFeed(entry, where, edition) {
  if (!entry || typeof entry !== 'object') throw new Error(`${where}: must be an object`);
  const feed = customSource(entry, where, edition);
  if (entry.match !== undefined) feed.match = customPattern(entry.match, `${where}.match`);
  if (entry.exclude !== undefined) feed.exclude = customPattern(entry.exclude, `${where}.exclude`);
  if (entry.trim !== undefined) {
    if (!Array.isArray(entry.trim) || !entry.trim.every((tail) => typeof tail === 'string' && tail)) {
      throw new Error(`${where}.trim: must be a list of title endings to remove`);
    }
    feed.trim = entry.trim;
  }
  if (typeof entry.official === 'string') feed.official = customPattern(entry.official, `${where}.official`);
  else if (entry.official) feed.official = true;
  return feed;
}

/** Validates a custom registry and expands its Google News shorthands for
 *  the edition. Every problem is reported with the path to the bad entry. */
export function customCategories(config, edition = parseEdition()) {
  const categories = config?.categories;
  if (!categories || typeof categories !== 'object' || Array.isArray(categories)) {
    throw new Error('feeds file: needs a top-level "categories" object');
  }
  const keys = Object.keys(categories);
  if (!keys.length) throw new Error('feeds file: "categories" is empty');

  const out = {};
  for (const key of keys) {
    const where = `categories.${key}`;
    // The key becomes a file name (data/<key>.json) and a URL parameter.
    if (!/^[a-z0-9][a-z0-9-]*$/.test(key)) {
      throw new Error(`${where}: keys are lowercase letters, digits and dashes`);
    }
    const category = categories[key];
    if (typeof category?.label !== 'string' || !category.label.trim()) {
      throw new Error(`${where}: needs a "label"`);
    }
    if (!Array.isArray(category.feeds) || !category.feeds.length) {
      throw new Error(`${where}: needs a non-empty "feeds" list`);
    }
    out[key] = {
      label: category.label.trim(),
      feeds: category.feeds.map((entry, i) => customFeed(entry, `${where}.feeds[${i}]`, edition))
    };
    if (category.maxAgeDays !== undefined) {
      const days = Number(category.maxAgeDays);
      if (!(days > 0)) throw new Error(`${where}: maxAgeDays must be a positive number`);
      out[key].maxAgeDays = days;
    }
  }
  return out;
}

/** The registry for an environment: the built-in categories, or the file
 *  NEWS_FEEDS_FILE points at. */
export function loadCategories(env = process.env) {
  const edition = parseEdition(env.NEWS_EDITION);
  const file = env.NEWS_FEEDS_FILE;
  if (!file) return defaultCategories(edition);
  let config;
  try {
    config = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (err) {
    throw new Error(`NEWS_FEEDS_FILE "${file}": ${err.message}`);
  }
  return customCategories(config, edition);
}

export const CATEGORIES = loadCategories();

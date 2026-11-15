// News feed registry. Each category aggregates several RSS feeds so a single
// dead outlet never leaves the dashboard empty.
//
// `aggregate: true` marks Google News feeds, whose titles are suffixed with
// " - Outlet" — news.js strips the suffix and uses it as the source name.
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
    business: {
      label: 'Business',
      feeds: [
        googleTopic('BUSINESS', edition),
        { url: 'http://feeds.bbci.co.uk/news/business/rss.xml', name: 'BBC News' },
        { url: 'https://feeds.content.dowjones.io/public/rss/mw_topstories', name: 'MarketWatch' },
        { url: 'https://feeds.npr.org/1006/rss.xml', name: 'NPR' }
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
    sports: {
      label: 'Sports',
      feeds: [
        googleTopic('SPORTS', edition),
        { url: 'https://www.espn.com/espn/rss/news', name: 'ESPN' },
        { url: 'https://feeds.bbci.co.uk/sport/rss.xml', name: 'BBC Sport' },
        { url: 'https://www.skysports.com/rss/12040', name: 'Sky Sports' }
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
    science: {
      label: 'Science',
      feeds: [
        googleTopic('SCIENCE', edition),
        { url: 'http://feeds.bbci.co.uk/news/science_and_environment/rss.xml', name: 'BBC News' },
        { url: 'https://phys.org/rss-feed/', name: 'Phys.org' },
        { url: 'https://www.sciencedaily.com/rss/all.xml', name: 'ScienceDaily' }
      ]
    },
    health: {
      label: 'Health',
      feeds: [
        googleTopic('HEALTH', edition),
        { url: 'http://feeds.bbci.co.uk/news/health/rss.xml', name: 'BBC News' },
        { url: 'https://feeds.npr.org/1007/rss.xml', name: 'NPR' },
        { url: 'https://www.statnews.com/feed/', name: 'STAT' }
      ]
    },
    entertainment: {
      label: 'Entertainment',
      feeds: [
        googleTopic('ENTERTAINMENT', edition),
        { url: 'http://feeds.bbci.co.uk/news/entertainment_and_arts/rss.xml', name: 'BBC News' },
        { url: 'https://variety.com/feed/', name: 'Variety' },
        { url: 'https://www.hollywoodreporter.com/feed/', name: 'The Hollywood Reporter' }
      ]
    }
  };
}

// ---------------------------------------------------------------------------
// Custom registry (NEWS_FEEDS_FILE)
// ---------------------------------------------------------------------------

function customFeed(entry, where, edition) {
  if (!entry || typeof entry !== 'object') throw new Error(`${where}: must be an object`);
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

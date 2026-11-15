import { describe, expect, it } from 'vitest';
import {
  areNearDuplicates,
  dedupeNearDuplicates,
  dropOldStories,
  exportPageCache,
  extractMetaDescription,
  extractMetaImage,
  importPageCache,
  isJunk,
  isOfficial,
  normalizeItem,
  pickSearchPhoto,
  readHead,
  sanitizeXml,
  searchDue,
  setBounded,
  stripAggregatorSuffix,
  tidySnippet,
  pickByTitle,
  wanted
} from '../server/news.js';

describe('near-duplicate collapsing', () => {
  const livA = 'LIV files for bankruptcy protection with $45m owed to players';
  const livB = 'LIV files for bankruptcy protection with over $45m owed to players';

  it('flags lightly-reworded versions of the same story', () => {
    expect(areNearDuplicates(livA, livB)).toBe(true);
  });

  it('never merges stories with conflicting numbers (scores, amounts)', () => {
    const other = 'LIV files for bankruptcy protection with over $120m owed to players';
    expect(areNearDuplicates(livA, other)).toBe(false);
  });

  it('merges when one headline omits the number entirely (year in slug)', () => {
    const a = 'US Open 2026 results: Sabalenka fights back against Noskova to keep title defence alive';
    const b = 'Sabalenka fights back to keep US Open defence alive';
    expect(areNearDuplicates(a, b)).toBe(true);
  });

  it('keeps genuinely different headlines', () => {
    expect(areNearDuplicates(livA, 'Real Madrid beat Inter Milan as Mbappe goal sets the tone')).toBe(false);
  });

  it('skips the fuzzy check on very short headlines', () => {
    expect(areNearDuplicates('Fed cuts rates', 'Fed raises rates')).toBe(false);
  });

  it('keeps the first of each duplicate run', () => {
    const items = [
      { title: livB, source: 'A' },
      { title: livA, source: 'B' },
      { title: 'Real Madrid beat Inter Milan as Mbappe goal sets the tone', source: 'C' }
    ];
    const out = dedupeNearDuplicates(items);
    expect(out).toHaveLength(2);
    expect(out[0]?.source).toBe('A');
  });
});

describe('stripAggregatorSuffix', () => {
  it('strips a single source suffix', () => {
    expect(stripAggregatorSuffix('Fed cuts rates - Reuters')).toEqual({
      title: 'Fed cuts rates',
      source: 'Reuters'
    });
  });

  it('strips doubled suffixes and keeps the outlet', () => {
    const out = stripAggregatorSuffix('Xiaomi 18 Fold is here - GSMArena.com news - GSMArena.com');
    expect(out.title).toBe('Xiaomi 18 Fold is here');
    expect(out.source).toBe('GSMArena.com news');
  });

  it('keeps sentence-like tails that are clearly not outlets', () => {
    const title = 'Champions League returns - who are favourites and players to watch?';
    expect(stripAggregatorSuffix(title)).toEqual({ title, source: null });
  });

  it('handles hyphenated outlet names like WSB-TV', () => {
    const out = stripAggregatorSuffix('Beltline light-rail plan unveiled - WSB-TV');
    expect(out.title).toBe('Beltline light-rail plan unveiled');
    expect(out.source).toBe('WSB-TV');
  });

  it('does not mistake part of the headline for a second outlet', () => {
    expect(stripAggregatorSuffix('WoW: Forever Hotfixes - November 11, 2026 - Blizzard News')).toEqual({
      title: 'WoW: Forever Hotfixes - November 11, 2026',
      source: 'Blizzard News'
    });
    expect(stripAggregatorSuffix('Frost Mage Guide - Talents, Rotations & More - WoW Forever - Wowhead')).toEqual({
      title: 'Frost Mage Guide - Talents, Rotations & More - WoW Forever',
      source: 'Wowhead'
    });
  });

  it('removes the outlet\'s own "— Site" tail', () => {
    const raw = 'WoW: Forever Hotfixes - November 9, 2026 — World of Warcraft — Blizzard News - Blizzard News';
    expect(stripAggregatorSuffix(raw)).toEqual({
      title: 'WoW: Forever Hotfixes - November 9, 2026 — World of Warcraft',
      source: 'Blizzard News'
    });
  });

  it('accepts a one-word lowercase outlet', () => {
    expect(stripAggregatorSuffix('WoW Forever Legacy Points explained - space4games')).toEqual({
      title: 'WoW Forever Legacy Points explained',
      source: 'space4games'
    });
  });

  it('respects lowercase domain outlets', () => {
    const out = stripAggregatorSuffix('Japan likely sold Treasurys - japantimes.co.jp');
    expect(out.source).toBe('japantimes.co.jp');
  });
});

describe('sanitizeXml', () => {
  it('escapes bare ampersands', () => {
    expect(sanitizeXml('S&P 500 rallies')).toBe('S&amp;P 500 rallies');
  });

  it('leaves real entities untouched', () => {
    expect(sanitizeXml('a &amp; b &#8217; c &lt; d')).toBe('a &amp; b &#8217; c &lt; d');
  });
});

describe('isJunk', () => {
  it('flags betting-preview spam', () => {
    expect(isJunk('9z vs 5star Prediction & Betting Tip | Counter-Strike')).toBe(true);
    expect(isJunk('KUUSAMO.gg VS Rounds live score and match stats')).toBe(true);
  });

  it('keeps real headlines', () => {
    expect(isJunk('Liquid wins the Major in overtime thriller')).toBe(false);
  });
});

describe('tidySnippet', () => {
  it('rejects strings that are too short', () => {
    expect(tidySnippet('Too short.')).toBeNull();
  });

  it('truncates long text with an ellipsis', () => {
    const out = tidySnippet('a'.repeat(300));
    expect(out?.length).toBeLessThanOrEqual(240);
    expect(out?.endsWith('…')).toBe(true);
  });

  it('decodes entities', () => {
    const out = tidySnippet('The head of Arm &amp; Hammer Industries said &ldquo;go&rdquo; to the press corps today');
    expect(out).toContain('Arm & Hammer');
    expect(out).toContain('“go”');
  });
});

describe('normalizeItem', () => {
  const feed = { name: 'Google News', aggregate: true };

  it('extracts outlet from aggregated titles', () => {
    const item = normalizeItem(
      { title: 'Big quake hits Tokyo - Japan Times', link: 'https://x/1' },
      feed
    );
    expect(item.source).toBe('Japan Times');
    expect(item.title).toBe('Big quake hits Tokyo');
    expect(item.snippet).toBeNull(); // aggregate feeds carry no real excerpt
  });

  it('keeps RSS snippets for direct feeds', () => {
    const item = normalizeItem(
      {
        title: 'Direct story with details',
        link: 'https://x/2',
        contentSnippet: 'A genuinely long summary of the direct story that is well over forty characters long.'
      },
      { name: 'BBC News', aggregate: false }
    );
    expect(item.snippet).toContain('genuinely long summary');
  });

  it('drops snippets that merely repeat the title', () => {
    const item = normalizeItem(
      {
        title: 'Rybakina sweeps past Osaka to close in on number one ranking',
        link: 'https://x/3',
        contentSnippet: 'Rybakina sweeps past Osaka to close in on number one ranking'
      },
      { name: 'BBC News', aggregate: false }
    );
    expect(item.snippet).toBeNull();
  });

  it('trims the section names a feed lists', () => {
    const item = normalizeItem(
      { title: 'Explore WoW: Forever with a Gamepad — World of Warcraft - Blizzard News', link: 'https://x/5' },
      { name: 'Google News', aggregate: true, trim: [' — World of Warcraft'] }
    );
    expect(item.title).toBe('Explore WoW: Forever with a Gamepad');
    expect(item.source).toBe('Blizzard News');
  });

  it('decodes entities a feed escaped twice', () => {
    // What the XML parser hands over for IGN's "Hope &amp;amp; Fear".
    const item = normalizeItem(
      { title: 'Daggerheart: Hope &amp; Fear Expansion Review', link: 'https://x/4' },
      { name: 'IGN', aggregate: false }
    );
    expect(item.title).toBe('Daggerheart: Hope & Fear Expansion Review');
  });
});

describe('extractMetaImage', () => {
  it('reads og:image and resolves relative paths', () => {
    const html = '<meta property="og:image" content="/img/cover.jpg">';
    expect(extractMetaImage(html, 'https://example.com/a/b')).toBe('https://example.com/img/cover.jpg');
  });

  it('falls back through og → twitter', () => {
    const html = '<meta name="twitter:image" content="https://example.com/t.png">';
    expect(extractMetaImage(html, 'https://example.com/')).toBe('https://example.com/t.png');
  });

  it('rejects non-https and gif images', () => {
    expect(extractMetaImage('<meta property="og:image" content="http://x/y.jpg">')).toBeNull();
    expect(extractMetaImage('<meta property="og:image" content="https://x/y.gif">')).toBeNull();
  });
});

describe('extractMetaDescription', () => {
  it('prefers og:description over the plain description', () => {
    const html =
      '<meta name="description" content="plain"><meta property="og:description" content="og version">';
    expect(extractMetaDescription(html)).toBe('og version');
  });

  it('falls back to twitter:description', () => {
    const html = '<meta name="twitter:description" content="tw version">';
    expect(extractMetaDescription(html)).toBe('tw version');
  });

  it('returns null when no description meta exists', () => {
    expect(extractMetaDescription('<p>nothing here</p>')).toBeNull();
  });
});

describe('age cut-off', () => {
  const now = Date.UTC(2026, 10, 14, 12);
  const HOUR = 60 * 60 * 1000;
  const DAY = 24 * HOUR;
  const story = (title: string, ageMs: number | null) => ({
    title,
    publishedAt: ageMs === null ? 0 : now - ageMs
  });
  const titles = (items: { title: string }[]) => items.map((item) => item.title);

  it('drops evergreen items and long tails', () => {
    const items = [
      story('fresh', HOUR),
      story('yesterday', 30 * HOUR),
      story('last week', 8 * DAY),
      story('Download now', 563 * DAY)
    ];
    expect(titles(dropOldStories(items, { maxAgeMs: 3 * DAY, minItems: 2, now }))).toEqual(['fresh', 'yesterday']);
  });

  it('keeps undated stories, whose age is unknown', () => {
    const items = [story('fresh', HOUR), story('old', 10 * DAY), story('undated', null)];
    expect(titles(dropOldStories(items, { maxAgeMs: 3 * DAY, minItems: 1, now }))).toEqual(['fresh', 'undated']);
  });

  it('tops a slow category back up with its newest older stories', () => {
    const items = [story('fresh', HOUR), story('5 days', 5 * DAY), story('9 days', 9 * DAY), story('40 days', 40 * DAY)];
    expect(titles(dropOldStories(items, { maxAgeMs: 3 * DAY, minItems: 3, now }))).toEqual(['fresh', '5 days', '9 days']);
  });
});

describe('reading a page head', () => {
  // Delivered in 16 KB chunks, the way a network response arrives.
  const page = (parts: string[]) => {
    const bytes = new TextEncoder().encode(parts.join(''));
    return new ReadableStream<Uint8Array>({
      start(controller) {
        for (let at = 0; at < bytes.length; at += 16_384) controller.enqueue(bytes.slice(at, at + 16_384));
        controller.close();
      }
    });
  };
  const filler = (bytes: number) => 'x'.repeat(bytes);

  it('stops at the minimum once the head has closed', async () => {
    const html = await readHead(page(['<head><meta name="a"></head>', filler(90_000)]), { min: 1000, max: 100_000 });
    expect(html.length).toBeLessThan(40_000);
    expect(html).toContain('</head>');
  });

  it('reads past the minimum to reach a late og:image', async () => {
    // Shaped like hollywoodreporter.com: ~300 KB of inline script before the tag.
    const body = page([
      '<head><script>', filler(310_000), '</script>',
      '<meta property="og:image" content="https://cdn.example.com/photo.jpg"></head><body>', filler(400_000)
    ]);
    const html = await readHead(body);
    expect(extractMetaImage(html, 'https://example.com/')).toBe('https://cdn.example.com/photo.jpg');
    expect(html.length).toBeLessThan(600_000);
  });

  it('gives up at the maximum when the head never closes', async () => {
    const html = await readHead(page([filler(50_000)]), { min: 100, max: 2000 });
    expect(html.length).toBeLessThan(2000 + 16_384);
    expect(html).not.toContain('</head>');
  });
});

describe('bounded cache', () => {
  it('drops the entries written longest ago', () => {
    const map = new Map<string, number>();
    for (const key of ['a', 'b', 'c', 'd']) setBounded(map, key, 1, 3);
    expect([...map.keys()]).toEqual(['b', 'c', 'd']);
  });

  it('treats a rewrite as fresh', () => {
    const map = new Map<string, number>();
    for (const key of ['a', 'b', 'c']) setBounded(map, key, 1, 3);
    setBounded(map, 'a', 2, 3);
    setBounded(map, 'e', 1, 3);
    expect([...map.keys()]).toEqual(['c', 'a', 'e']);
    expect(map.get('a')).toBe(2);
  });
});

describe('single-subject feeds', () => {
  const story = (title: string, source = 'MMO-Champion') => ({ title, source });

  it('keeps a general feed to its subject with match', () => {
    const feed = { match: /\bforever\b/i };
    expect(wanted(story('WoW: Forever Hotfixes - November 13, 2026'), feed)).toBe(true);
    expect(wanted(story('Midnight Season 2 Mythic+ Rotation'), feed)).toBe(false);
    expect(wanted(story('Foreverglades zone preview'), feed)).toBe(false);
  });

  it('drops what exclude names', () => {
    const feed = { exclude: /\bguide\b/i };
    expect(wanted(story('Restoration Druid Guide'), feed)).toBe(false);
    expect(wanted(story('Players guided to the wrong zone'), feed)).toBe(true);
  });

  it('never takes an outlet\'s index page for a story', () => {
    expect(wanted(story('Blizzard News', 'Blizzard News'), {})).toBe(false);
  });

  it('prefers the official copy of a headline over a later repost', () => {
    const official = { title: 'WoW: Forever Hotfixes', source: 'Blizzard News', publishedAt: 100 };
    const repost = { title: 'WoW:  Forever hotfixes', source: 'MMO-Champion', publishedAt: 900 };
    const picked = (list: { item: typeof official; official: boolean }[]) => pickByTitle(list).map((c) => c.item.source);
    expect(picked([{ item: repost, official: false }, { item: official, official: true }])).toEqual(['Blizzard News']);
    expect(picked([{ item: official, official: true }, { item: repost, official: false }])).toEqual(['Blizzard News']);
  });

  it('recognises the publisher inside a mixed search feed', () => {
    const feed = { official: /^Blizzard( News)?$/i };
    expect(isOfficial({ source: 'Blizzard News' }, feed)).toBe(true);
    expect(isOfficial({ source: 'Blizzard Watch' }, feed)).toBe(false);
    expect(isOfficial({ source: 'Anyone' }, { official: true })).toBe(true);
    expect(isOfficial({ source: 'Blizzard News' }, {})).toBe(false);
  });

  it('otherwise keeps the most recent copy of a headline', () => {
    const older = { title: 'Same headline', source: 'A', publishedAt: 100 };
    const newer = { title: 'Same headline', source: 'B', publishedAt: 900 };
    expect(pickByTitle([{ item: older, official: false }, { item: newer, official: false }])[0]?.item.source).toBe('B');
  });

  it('lets a preferred story replace its near-duplicate', () => {
    const wowhead = { title: 'The WoW: Forever Podcast Episode 7 Now Available - Lore Episode', source: 'Wowhead' };
    const blizzard = { title: 'Watch the WoW: Forever Podcast Episode 7 - Lore Episode', source: 'Blizzard News' };
    expect(dedupeNearDuplicates([wowhead, blizzard]).map((i) => i.source)).toEqual(['Wowhead']);
    expect(dedupeNearDuplicates([wowhead, blizzard], (i) => i === blizzard).map((i) => i.source)).toEqual([
      'Blizzard News'
    ]);
  });
});

describe('page cache carried between builds', () => {
  const now = Date.now();
  const found = { image: 'https://cdn.example.com/a.jpg', description: 'An excerpt.', site: 'example.com', at: now - 1000 };
  const nothing = { image: null, description: null, site: 'blocked.example', at: now - 2000 };

  it('round-trips what the scraper knew, including pages that had nothing', () => {
    expect(importPageCache({ 'https://example.com/a': found, 'https://blocked.example/b': nothing })).toBe(2);
    expect(exportPageCache(['https://example.com/a', 'https://blocked.example/b'])).toEqual({
      'https://example.com/a': found,
      'https://blocked.example/b': nothing
    });
  });

  it('exports only the stories asked for, so old ones drop out', () => {
    importPageCache({ 'https://example.com/old': found, 'https://example.com/new': found });
    expect(Object.keys(exportPageCache(['https://example.com/new', 'https://example.com/unknown']))).toEqual([
      'https://example.com/new'
    ]);
  });

  it('skips entries that are not what it wrote', () => {
    expect(importPageCache(null)).toBe(0);
    expect(importPageCache([found])).toBe(0);
    expect(
      importPageCache({
        'not a url': found,
        'https://example.com/no-time': { image: null, description: null },
        'https://example.com/future': { ...found, at: now + 86_400_000 },
        'https://example.com/string': 'nope'
      })
    ).toBe(0);
  });

  it('keeps only https photos and text fields', () => {
    importPageCache({
      'https://example.com/odd': { image: 'http://insecure.example/a.jpg', description: 42, site: ['x'], at: now }
    });
    expect(exportPageCache(['https://example.com/odd'])['https://example.com/odd']).toEqual({
      image: null,
      description: null,
      site: null,
      at: now
    });
  });
});

describe('meta tags as real sites write them', () => {
  it('reads unquoted attributes (Gannett: USA Today, Detroit Free Press)', () => {
    const html =
      '<meta property=og:image content="https://www.usatoday.com/gcdn/a.jpg?width=3200&format=pjpg"/>' +
      '<meta property=og:image:width content=3200 />' +
      '<meta name=description content="A long enough description of the story to be kept as its excerpt.">';
    expect(extractMetaImage(html, 'https://www.usatoday.com/story/x/')).toBe(
      'https://www.usatoday.com/gcdn/a.jpg?width=3200&format=pjpg'
    );
    expect(extractMetaDescription(html)).toContain('long enough description');
  });

  it('keeps an apostrophe inside a double-quoted value', () => {
    const html = `<meta property="og:description" content="Trump's plan for the summit is the week's main story, aides say.">`;
    expect(extractMetaDescription(html)).toBe("Trump's plan for the summit is the week's main story, aides say.");
  });

  it('keeps a double quote inside a single-quoted value', () => {
    const html = `<meta name='description' content='The "biggest launch in history", according to the studio behind it.'>`;
    expect(extractMetaDescription(html)).toBe('The "biggest launch in history", according to the studio behind it.');
  });

  it('is not fooled by an attribute name inside another value', () => {
    const html = '<meta name="description" content="Set property=og:image and content=nothing in your own tags."><meta property="og:image" content="https://cdn.example.com/real.jpg">';
    expect(extractMetaImage(html, 'https://example.com/')).toBe('https://cdn.example.com/real.jpg');
  });
});

describe('photo search fallback', () => {
  const feed = (items: { title: string; image?: string }[]) =>
    `<rss><channel>${items
      .map(
        (i) =>
          `<item><title>${i.title}</title><News:Source>Someone on MSN</News:Source>${
            i.image ? `<News:Image>${i.image}</News:Image>` : ''
          }</item>`
      )
      .join('')}</channel></rss>`;
  const photo = 'http://www.bing.com/th?id=ONUT.abc123&amp;pid=News';
  const title = 'Cape Verde election could deliver first woman president since independence in 1975';

  it('takes the photo from a copy of the same story', () => {
    const xml = feed([
      { title: 'Something else entirely happened in the markets today, analysts say', image: photo },
      { title: 'Cape Verde election could deliver first woman president since independence', image: photo }
    ]);
    expect(pickSearchPhoto(xml, title)).toBe('https://www.bing.com/th?id=ONUT.abc123&pid=News');
  });

  it('ignores photos of other stories, however prominent', () => {
    const xml = feed([{ title: 'Pope crosses Peru in the finale of a trip home to visit his flock', image: photo }]);
    expect(pickSearchPhoto(xml, title)).toBeNull();
  });

  it('ignores a matching result that has no photo, or one from elsewhere', () => {
    expect(pickSearchPhoto(feed([{ title }]), title)).toBeNull();
    expect(pickSearchPhoto(feed([{ title, image: 'https://evil.example/th?id=1' }]), title)).toBeNull();
    expect(pickSearchPhoto('not a feed', title)).toBeNull();
  });

  it('retries a miss after 30 min, 1 h, 2 h and 4 h, then stops', () => {
    const MIN = 60_000;
    const now = Date.UTC(2026, 10, 15, 12);
    const after = (searches: number, minutes: number) => searchDue({ searches, searchedAt: now - minutes * MIN }, now);
    expect(searchDue({}, now)).toBe(true);
    expect(after(1, 29)).toBe(false);
    expect(after(1, 31)).toBe(true);
    expect(after(2, 59)).toBe(false);
    expect(after(2, 61)).toBe(true);
    expect(after(4, 239)).toBe(false);
    expect(after(4, 241)).toBe(true);
    expect(after(5, 100_000)).toBe(false);
  });

  it('remembers its tries across builds', () => {
    const at = Date.now() - 1000;
    importPageCache({ 'https://example.com/tried': { image: null, description: null, site: null, at, searches: 2, searchedAt: at } });
    expect(exportPageCache(['https://example.com/tried'])['https://example.com/tried']).toMatchObject({
      searches: 2,
      searchedAt: at
    });
  });
});

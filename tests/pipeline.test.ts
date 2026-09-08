import { describe, expect, it } from 'vitest';
import {
  extractMetaDescription,
  extractMetaImage,
  isJunk,
  normalizeItem,
  sanitizeXml,
  stripAggregatorSuffix,
  tidySnippet
} from '../server/news.js';

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

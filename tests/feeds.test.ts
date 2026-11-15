import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { customCategories, defaultCategories, loadCategories, parseEdition } from '../server/feeds.js';

const urlsOf = (category: { feeds: { url: string }[] }) => category.feeds.map((feed) => feed.url);

describe('Google News edition', () => {
  it('defaults to the US English edition', () => {
    expect(parseEdition(undefined)).toEqual({ country: 'US', language: 'en' });
    expect(parseEdition('')).toEqual({ country: 'US', language: 'en' });
    expect(urlsOf(defaultCategories().headlines)[0]).toBe('https://news.google.com/rss?hl=en-US&gl=US&ceid=US:en');
  });

  it('addresses other editions the way Google News expects', () => {
    const feedFor = (edition: string) => urlsOf(defaultCategories(parseEdition(edition)).world)[0];
    expect(feedFor('gb:en')).toBe(
      'https://news.google.com/rss/headlines/section/topic/WORLD?hl=en-GB&gl=GB&ceid=GB:en'
    );
    expect(feedFor('DE:de')).toContain('hl=de&gl=DE&ceid=DE:de');
    expect(feedFor('MX:es-419')).toContain('hl=es-419&gl=MX&ceid=MX:es-419');
  });

  it('rejects a malformed edition instead of guessing', () => {
    expect(() => parseEdition('english')).toThrow(/NEWS_EDITION/);
    expect(() => parseEdition('USA:en')).toThrow(/NEWS_EDITION/);
  });

  it('keeps the search feed query intact', () => {
    expect(urlsOf(defaultCategories().esports)).toContain(
      'https://news.google.com/rss/search?q=counter-strike+when:7d&hl=en-US&gl=US&ceid=US:en'
    );
  });
});

describe('custom feeds file', () => {
  const config = {
    categories: {
      local: {
        label: 'Berlin',
        maxAgeDays: 7,
        feeds: [
          { url: 'https://example.de/rss', name: 'Example' },
          { googleTopic: 'world' },
          { googleSearch: 'berlin wetter' },
          { googleTop: true }
        ]
      }
    }
  };

  it('expands Google shorthands for the edition', () => {
    const { local } = customCategories(config, parseEdition('DE:de'));
    expect(local.label).toBe('Berlin');
    expect(local.maxAgeDays).toBe(7);
    expect(local.feeds[0]).toEqual({ url: 'https://example.de/rss', name: 'Example' });
    expect(local.feeds[1]).toMatchObject({ aggregate: true, name: 'Google News' });
    expect(urlsOf(local).slice(1)).toEqual([
      'https://news.google.com/rss/headlines/section/topic/WORLD?hl=de&gl=DE&ceid=DE:de',
      'https://news.google.com/rss/search?q=berlin+wetter&hl=de&gl=DE&ceid=DE:de',
      'https://news.google.com/rss?hl=de&gl=DE&ceid=DE:de'
    ]);
  });

  it('names the entry that is wrong', () => {
    const broken = (categories: unknown) => () => customCategories({ categories });
    expect(broken(undefined)).toThrow(/top-level "categories"/);
    expect(broken({})).toThrow(/empty/);
    expect(broken({ 'Bad Key': { label: 'x', feeds: [{ googleTop: true }] } })).toThrow(/categories\.Bad Key: keys/);
    expect(broken({ a: { feeds: [{ googleTop: true }] } })).toThrow(/categories\.a: needs a "label"/);
    expect(broken({ a: { label: 'A', feeds: [] } })).toThrow(/categories\.a: needs a non-empty "feeds"/);
    expect(broken({ a: { label: 'A', feeds: [{ url: 'ftp://x', name: 'X' }] } })).toThrow(/categories\.a\.feeds\[0\]/);
    expect(broken({ a: { label: 'A', feeds: [{ url: 'https://x.test/rss' }] } })).toThrow(/needs a "name"/);
    expect(broken({ a: { label: 'A', feeds: [{ googleTopic: 'GAMING' }] } })).toThrow(/googleTopic must be one of/);
    expect(broken({ a: { label: 'A', maxAgeDays: 0, feeds: [{ googleTop: true }] } })).toThrow(/maxAgeDays/);
  });

  it('is loaded from NEWS_FEEDS_FILE', () => {
    const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'nd-feeds-')), 'feeds.json');
    fs.writeFileSync(file, JSON.stringify(config));
    const categories = loadCategories({ NEWS_FEEDS_FILE: file, NEWS_EDITION: 'DE:de' });
    expect(Object.keys(categories)).toEqual(['local']);
  });

  it('reports an unreadable file by name', () => {
    expect(() => loadCategories({ NEWS_FEEDS_FILE: '/nonexistent/feeds.json' })).toThrow(/NEWS_FEEDS_FILE/);
  });

  it('falls back to the built-in categories', () => {
    expect(Object.keys(loadCategories({}))).toHaveLength(10);
  });
});

import { describe, expect, it } from 'vitest';
import { STALE_MS } from '../src/config.js';
import { categoryFromUrl, settingsFromUrl } from '../src/settings.js';
import { computeLayout, isStale, nextCategory, timeAgo, withPhotos } from '../src/utils.js';
import { isDaytime, resolveTheme } from '../src/theme.js';

describe('computeLayout', () => {
  it('uses a 5x3 grid for a 16:9 second monitor', () => {
    expect(computeLayout(1920, 1080)).toEqual({ rows: 3, cols: 5 });
  });

  it('wraps to a 3x4 grid in portrait', () => {
    expect(computeLayout(800, 1000)).toEqual({ rows: 4, cols: 3 });
  });

  it('never produces empty rows or columns', () => {
    for (const [w, h] of [[3840, 2160], [1440, 900], [1024, 768], [500, 900]]) {
      const { rows, cols } = computeLayout(w, h);
      expect(rows).toBeGreaterThanOrEqual(2);
      expect(cols).toBeGreaterThanOrEqual(2);
      expect(rows * cols).toBeGreaterThanOrEqual(12);
    }
  });
});

describe('timeAgo', () => {
  it('formats compact relative times', () => {
    const now = Date.now();
    expect(timeAgo(now - 20_000)).toBe('now');
    expect(timeAgo(now - 5 * 60_000)).toBe('5m');
    expect(timeAgo(now - 3 * 60 * 60_000)).toBe('3h');
    expect(timeAgo(now - 2 * 24 * 60 * 60_000)).toBe('2d');
  });

  it('handles missing timestamps', () => {
    expect(timeAgo(0)).toBe('');
  });
});

describe('isStale', () => {
  const now = Date.UTC(2026, 10, 14, 12);

  it('goes by the age of the data', () => {
    expect(isStale(now - 5 * 60_000, now)).toBe(false);
    expect(isStale(now - STALE_MS + 1000, now)).toBe(false);
    expect(isStale(now - STALE_MS - 1000, now)).toBe(true);
    expect(isStale(now - 7 * 24 * 60 * 60_000, now)).toBe(true);
  });

  it('treats a missing timestamp as stale', () => {
    expect(isStale(0, now)).toBe(true);
  });
});

describe('withPhotos', () => {
  const story = (id: number, pictured: boolean) => ({ id, image: pictured ? `https://img.example/${id}.jpg` : null });
  const ids = (items: { id: number }[]) => items.map((item) => item.id);

  it('leaves out stories that have no photo', () => {
    const items = [story(1, true), story(2, false), story(3, true)];
    expect(ids(withPhotos(items, 2))).toEqual([1, 3]);
  });

  it('tops a thin category back up, newest first, in the feed\'s order', () => {
    const items = [story(1, false), story(2, true), story(3, false), story(4, true), story(5, false)];
    expect(ids(withPhotos(items, 4))).toEqual([1, 2, 3, 4]);
  });

  it('returns everything when there is not enough to choose from', () => {
    const items = [story(1, false), story(2, true)];
    expect(ids(withPhotos(items, 24))).toEqual([1, 2]);
    expect(withPhotos([], 24)).toEqual([]);
  });
});

describe('nextCategory', () => {
  const cats = [{ key: 'a' }, { key: 'b' }, { key: 'c' }];

  it('steps through the list and wraps', () => {
    expect(nextCategory(cats, 'a')).toBe('b');
    expect(nextCategory(cats, 'c')).toBe('a');
  });

  it('starts from the top when the current one is gone', () => {
    expect(nextCategory(cats, 'zzz')).toBe('a');
  });

  it('stays put with nothing to rotate through', () => {
    expect(nextCategory([], 'a')).toBe('a');
    expect(nextCategory([{ key: 'a' }], 'a')).toBe('a');
  });
});

describe('settings from the URL', () => {
  it('reads a kiosk setup', () => {
    expect(settingsFromUrl('?photosonly=0')).toEqual({ photosOnly: false });
    expect(settingsFromUrl('?speed=30&rotate=5&excerpts=0&photos=off&awake=1')).toEqual({
      cycleMs: 30_000,
      rotateMin: 5,
      showSnippets: false,
      showImages: false,
      keepAwake: true
    });
  });

  it('pins nothing that was not asked for', () => {
    expect(settingsFromUrl('')).toEqual({});
    expect(settingsFromUrl('?theme=dark&utm_source=x')).toEqual({});
  });

  it('ignores values it cannot use', () => {
    expect(settingsFromUrl('?speed=fast&rotate=-3&photos=maybe&awake=')).toEqual({});
    expect(settingsFromUrl('?speed=1')).toEqual({});
    expect(settingsFromUrl('?speed=9000')).toEqual({});
  });

  it('turns rotation off with 0 or "off"', () => {
    expect(settingsFromUrl('?rotate=0')).toEqual({ rotateMin: 0 });
    expect(settingsFromUrl('?rotate=off')).toEqual({ rotateMin: 0 });
  });

  it('reads the opening category', () => {
    expect(categoryFromUrl('?category=Technology')).toBe('technology');
    expect(categoryFromUrl('?category=../etc')).toBeNull();
    expect(categoryFromUrl('')).toBeNull();
  });
});

describe('theme resolution', () => {
  // "auto" follows the daytime window (light 07:00–19:00 local).
  const at = (hour: number) => new Date(2026, 8, 8, hour, 0, 0);

  it('auto resolves light inside the daytime window', () => {
    expect(isDaytime(at(7))).toBe(true);
    expect(isDaytime(at(18))).toBe(true);
    expect(resolveTheme('auto', at(12))).toBe('light');
  });

  it('auto resolves dark at night', () => {
    expect(isDaytime(at(6))).toBe(false);
    expect(isDaytime(at(19))).toBe(false);
    expect(resolveTheme('auto', at(2))).toBe('dark');
  });

  it('explicit themes pin regardless of clock', () => {
    expect(resolveTheme('light', at(2))).toBe('light');
    expect(resolveTheme('dark', at(12))).toBe('dark');
  });
});

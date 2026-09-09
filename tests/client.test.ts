import { describe, expect, it } from 'vitest';
import { computeLayout, timeAgo } from '../src/utils.js';
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

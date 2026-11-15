// @vitest-environment jsdom
import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Tile } from '../src/components/Tile';
import { PRELOAD_CAP_MS, SWAP_MS } from '../src/config';
import type { NewsItem } from '../src/types';

function story(id: string, extra: Partial<NewsItem> = {}): NewsItem {
  return {
    title: `Story ${id}`,
    source: 'Example',
    link: `https://example.com/${id}`,
    publishedAt: Date.now() - 60 * 60_000,
    image: `https://img.example.com/${id}.jpg`,
    snippet: null,
    ...extra
  };
}

/** Mounts one tile and hands back the heartbeat callback it registered. */
function mountTile(list: NewsItem[]) {
  let tick: (now: number) => void = () => {};
  const register = (_index: number, fn: ((now: number) => void) | null) => {
    if (fn) tick = fn;
  };
  const props = {
    index: 0, total: 12, accent: '#4f8cff', gridPaused: false, timeTick: 0,
    loading: false, cycleMs: 18_000, register
  };
  const view = render(<Tile {...props} list={list} />);
  return {
    ...view,
    setList: (next: NewsItem[]) => view.rerender(<Tile {...props} list={next} />),
    /** Runs the heartbeat far enough ahead to trigger and finish one swap. */
    swap: () =>
      act(() => {
        tick(performance.now() + 60_000);
        vi.advanceTimersByTime(PRELOAD_CAP_MS + SWAP_MS + 50);
      }),
    headline: () => view.container.querySelector('.tile-headline')?.textContent,
    photo: () => view.container.querySelector<HTMLImageElement>('.tile-img')
  };
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('Tile photos', () => {
  it('shows the next story\'s photo after one photo fails to load', () => {
    const tile = mountTile([story('a'), story('b')]);
    expect(tile.photo()?.src).toBe('https://img.example.com/a.jpg');

    fireEvent.error(tile.photo()!);
    expect(tile.photo()).toBeNull();

    tile.swap();
    expect(tile.headline()).toBe('Story b');
    expect(tile.photo()?.src).toBe('https://img.example.com/b.jpg');
  });
});

describe('Tile refresh', () => {
  it('keeps the story on screen when a poll delivers the same feed again', () => {
    const tile = mountTile([story('a'), story('b'), story('c')]);
    tile.setList([story('a'), story('b'), story('c')]);
    expect(tile.headline()).toBe('Story a');

    // ...and the cycle carries on from where it was.
    tile.swap();
    expect(tile.headline()).toBe('Story b');
  });

  it('adopts the enriched copy of the story it is showing', () => {
    const tile = mountTile([story('a', { image: null }), story('b')]);
    expect(tile.photo()).toBeNull();

    tile.setList([story('a', { snippet: 'A long enough excerpt.' }), story('b')]);
    expect(tile.headline()).toBe('Story a');
    expect(tile.photo()?.src).toBe('https://img.example.com/a.jpg');
    expect(tile.container.querySelector('.tile-snippet')?.textContent).toBe('A long enough excerpt.');
  });

  it('keeps a story that left the feed until its own swap comes round', () => {
    const tile = mountTile([story('a'), story('b')]);
    tile.setList([story('x'), story('y')]);
    expect(tile.headline()).toBe('Story a');

    tile.swap();
    expect(['Story x', 'Story y']).toContain(tile.headline());
  });
});

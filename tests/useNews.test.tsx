// @vitest-environment jsdom
import { act, cleanup, render, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadNews } from '../src/api';
import { Header } from '../src/components/Header';
import { REFRESH_MS, STALE_MS } from '../src/config';
import { useNews } from '../src/hooks/useNews';
import type { NewsData } from '../src/types';

vi.mock('../src/api', () => ({ loadNews: vi.fn() }));
const loadNewsMock = vi.mocked(loadNews);

const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;

function snapshot(ageMs: number): NewsData {
  return {
    category: 'headlines',
    fetchedAt: Date.now() - ageMs,
    items: [
      {
        title: 'Story', source: 'Example', link: 'https://example.com/a',
        publishedAt: Date.now() - ageMs, image: null, snippet: null
      }
    ]
  };
}

/** Lets the pending load() promise settle. */
const settle = () => act(() => vi.advanceTimersByTimeAsync(0));

beforeEach(() => {
  vi.useFakeTimers();
  loadNewsMock.mockReset();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('useNews status', () => {
  it('is ok for a fresh snapshot', async () => {
    loadNewsMock.mockResolvedValue(snapshot(5 * MINUTE));
    const { result } = renderHook(() => useNews('headlines'));
    expect(result.current.status).toBe('loading');
    await settle();
    expect(result.current.status).toBe('ok');
    expect(result.current.items).toHaveLength(1);
  });

  it('is stale for a week-old snapshot even though the fetch succeeded', async () => {
    loadNewsMock.mockResolvedValue(snapshot(7 * DAY));
    const { result } = renderHook(() => useNews('headlines'));
    await settle();
    expect(result.current.status).toBe('stale');
    expect(result.current.items).toHaveLength(1);
    expect(result.current.error).toBe('');
  });

  it('turns stale while the same snapshot keeps being served', async () => {
    const frozen = snapshot(STALE_MS - 10 * MINUTE);
    loadNewsMock.mockResolvedValue(frozen);
    const { result } = renderHook(() => useNews('headlines'));
    await settle();
    expect(result.current.status).toBe('ok');

    // Every poll still succeeds, but the data never gets any newer.
    await act(() => vi.advanceTimersByTimeAsync(4 * REFRESH_MS));
    expect(loadNewsMock.mock.calls.length).toBeGreaterThan(2);
    expect(result.current.status).toBe('stale');
  });

  it('recovers to ok when a fresh snapshot arrives', async () => {
    loadNewsMock.mockResolvedValue(snapshot(7 * DAY));
    const { result } = renderHook(() => useNews('headlines'));
    await settle();
    expect(result.current.status).toBe('stale');

    loadNewsMock.mockResolvedValue(snapshot(MINUTE));
    await act(() => vi.advanceTimersByTimeAsync(REFRESH_MS));
    expect(result.current.status).toBe('ok');
  });

  it('reports an error when the feed cannot be loaded', async () => {
    loadNewsMock.mockRejectedValue(new Error('HTTP 503'));
    const { result } = renderHook(() => useNews('headlines'));
    await settle();
    expect(result.current.status).toBe('error');
    expect(result.current.error).toBe('HTTP 503');
  });
});

describe('Header status label', () => {
  const props = {
    categories: [], active: 'headlines', onSelect: () => {}, paused: false,
    time: '', date: '', onToggleFullscreen: () => {}, onOpenSettings: () => {}
  };
  const label = (container: HTMLElement) => container.querySelector('#updated')?.textContent;

  it('shows the data age when current', () => {
    const { container } = render(<Header {...props} status="ok" fetchedAt={Date.now() - 5 * MINUTE} />);
    expect(label(container)).toBe('updated 5m');
  });

  it('says stale and how old the data is', () => {
    const { container } = render(<Header {...props} status="stale" fetchedAt={Date.now() - 6 * DAY} />);
    expect(label(container)).toBe('stale · updated 6d');
    expect(container.querySelector('#updated')?.className).toBe('stale');
  });
});

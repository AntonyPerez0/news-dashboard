// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from '../src/App';
import { loadCategories, loadNews } from '../src/api';
import { SettingsDrawer } from '../src/components/SettingsDrawer';
import { DEFAULT_SETTINGS } from '../src/settings';
import type { NewsData } from '../src/types';

vi.mock('../src/api', async (original) => ({
  ...(await original<typeof import('../src/api')>()),
  loadNews: vi.fn(),
  loadCategories: vi.fn()
}));

const CATEGORIES = [
  { key: 'headlines', label: 'Headlines' },
  { key: 'world', label: 'World' },
  { key: 'sports', label: 'Sports' }
];

function feed(category: string): NewsData {
  return {
    category,
    fetchedAt: Date.now(),
    items: [
      {
        title: `${category} story`, source: 'Example', link: `https://example.com/${category}`,
        publishedAt: Date.now() - 60_000, image: null, snippet: null
      }
    ]
  };
}

const active = () => document.querySelector('.cat-btn.active')?.textContent;
const settle = () => act(() => vi.advanceTimersByTimeAsync(0));

async function mountAt(search: string) {
  window.history.replaceState(null, '', `/${search}`);
  const view = render(<App />);
  await settle();
  return view;
}

beforeEach(() => {
  vi.useFakeTimers();
  localStorage.clear();
  vi.mocked(loadCategories).mockResolvedValue(CATEGORIES);
  vi.mocked(loadNews).mockImplementation(async (category) => feed(category));
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  window.history.replaceState(null, '', '/');
});

describe('URL parameters', () => {
  it('opens on ?category=', async () => {
    await mountAt('?category=sports');
    expect(active()).toBe('Sports');
    expect(loadNews).toHaveBeenLastCalledWith('sports');
  });

  it('falls back to the first category when the one asked for does not exist', async () => {
    await mountAt('?category=cricket');
    expect(active()).toBe('Headlines');
  });

  it('pins settings without saving them, until the user changes that setting', async () => {
    await mountAt('?speed=30&photos=0');
    expect(document.querySelector('#grid')?.className).toContain('no-images');
    fireEvent.click(screen.getByRole('button', { name: 'Open settings' }));
    expect(screen.getByRole('radio', { name: '30s' }).getAttribute('aria-checked')).toBe('true');
    expect(localStorage.getItem('nd.settings')).toBeNull();

    fireEvent.click(screen.getByRole('radio', { name: '12s' }));
    expect(screen.getByRole('radio', { name: '12s' }).getAttribute('aria-checked')).toBe('true');
    // The hand-made change is saved; the other pinned value still is not.
    expect(JSON.parse(localStorage.getItem('nd.settings')!)).toMatchObject({ cycleMs: 12_000, showImages: true });
    expect(document.querySelector('#grid')?.className).toContain('no-images');
  });
});

describe('switching category', () => {
  it('never shows the previous category\'s stories in the new one', async () => {
    await mountAt('');
    expect(document.querySelector('#grid')?.textContent).toContain('headlines story');

    // World is slow to arrive; the grid must show nothing of Headlines meanwhile.
    let deliver: (data: NewsData) => void = () => {};
    vi.mocked(loadNews).mockImplementation((category) =>
      category === 'world' ? new Promise((resolve) => (deliver = resolve)) : Promise.resolve(feed(category))
    );
    fireEvent.click(screen.getByRole('button', { name: 'World' }));
    expect(document.querySelector('#grid')?.textContent).not.toContain('headlines story');
    await settle();
    expect(document.querySelector('#grid')?.textContent).not.toContain('headlines story');

    await act(async () => deliver(feed('world')));
    expect(document.querySelector('#grid')?.textContent).toContain('world story');
    expect(document.querySelector('#grid a.tile')?.getAttribute('href')).toBe('https://example.com/world');
  });
});

describe('category rotation', () => {
  it('moves to the next category on schedule and wraps round', async () => {
    await mountAt('?rotate=2');
    expect(active()).toBe('Headlines');

    await act(() => vi.advanceTimersByTimeAsync(2 * 60_000 + 1500));
    expect(active()).toBe('World');
    await act(() => vi.advanceTimersByTimeAsync(2 * 60_000 + 1500));
    expect(active()).toBe('Sports');
    await act(() => vi.advanceTimersByTimeAsync(2 * 60_000 + 1500));
    expect(active()).toBe('Headlines');
  });

  it('does not overwrite the category the user chose as their own', async () => {
    await mountAt('?rotate=2');
    fireEvent.click(screen.getByRole('button', { name: 'Sports' }));
    await act(() => vi.advanceTimersByTimeAsync(2 * 60_000 + 1500));
    expect(active()).toBe('Headlines');
    expect(localStorage.getItem('nd.category')).toBe('sports');
  });

  it('holds while paused and starts a full interval on resume', async () => {
    await mountAt('?rotate=2');
    fireEvent.keyDown(document, { key: ' ', code: 'Space' });
    await act(() => vi.advanceTimersByTimeAsync(10 * 60_000));
    expect(active()).toBe('Headlines');

    fireEvent.keyDown(document, { key: ' ', code: 'Space' });
    await act(() => vi.advanceTimersByTimeAsync(60_000));
    expect(active()).toBe('Headlines');
    await act(() => vi.advanceTimersByTimeAsync(60_000 + 1500));
    expect(active()).toBe('World');
  });

  it('stays put when rotation is off', async () => {
    await mountAt('');
    await act(() => vi.advanceTimersByTimeAsync(30 * 60_000));
    expect(active()).toBe('Headlines');
  });
});

describe('keyboard shortcuts', () => {
  it('reach an 11th category with the key after 0', async () => {
    const eleven = Array.from({ length: 11 }, (_, i) => ({ key: `cat${i + 1}`, label: `Cat ${i + 1}` }));
    vi.mocked(loadCategories).mockResolvedValue(eleven);
    await mountAt('?category=cat1');
    fireEvent.keyDown(document, { key: '0' });
    expect(active()).toBe('Cat 10');
    fireEvent.keyDown(document, { key: '-' });
    expect(active()).toBe('Cat 11');
  });

  it('leave the dashboard alone while the settings are open', async () => {
    await mountAt('');
    fireEvent.click(screen.getByRole('button', { name: 'Open settings' }));
    fireEvent.keyDown(document, { key: '2' });
    expect(active()).toBe('Headlines');

    fireEvent.keyDown(document, { key: 'Escape' });
    fireEvent.keyDown(document, { key: '2' });
    expect(active()).toBe('World');
  });
});

describe('settings drawer focus', () => {
  const props = { settings: DEFAULT_SETTINGS, onChange: () => {}, onReset: () => {}, onClose: () => {} };

  it('takes focus when opened and returns it when closed', () => {
    const opener = document.body.appendChild(document.createElement('button'));
    opener.focus();
    const view = render(<SettingsDrawer {...props} open={false} />);
    expect(document.activeElement).toBe(opener);

    view.rerender(<SettingsDrawer {...props} open />);
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Close settings' }));

    view.rerender(<SettingsDrawer {...props} open={false} />);
    expect(document.activeElement).toBe(opener);
    opener.remove();
  });

  it('keeps Tab inside, wrapping at both ends', () => {
    render(<SettingsDrawer {...props} open />);
    const drawer = screen.getByRole('dialog');
    const first = screen.getByRole('button', { name: 'Close settings' });
    const last = screen.getByRole('button', { name: 'Reset to defaults' });

    last.focus();
    fireEvent.keyDown(drawer, { key: 'Tab' });
    expect(document.activeElement).toBe(first);

    fireEvent.keyDown(drawer, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(last);
  });
});

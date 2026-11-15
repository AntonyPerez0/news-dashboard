import type { Category, NewsData } from './types';

export const DEFAULT_CATEGORIES: Category[] = [
  { key: 'headlines', label: 'Headlines' },
  { key: 'world', label: 'World' },
  { key: 'business', label: 'Business' },
  { key: 'technology', label: 'Technology' },
  { key: 'sports', label: 'Sports' },
  { key: 'esports', label: 'CS Esports' },
  { key: 'gaming', label: 'Gaming' },
  { key: 'science', label: 'Science' },
  { key: 'health', label: 'Health' },
  { key: 'entertainment', label: 'Entertainment' }
];

/**
 * Live Node API first (`npm start`); when that's absent — e.g. on GitHub
 * Pages — fall back to the static JSON snapshots the deploy action builds.
 */
export async function loadNews(category: string): Promise<NewsData> {
  try {
    const res = await fetch(`api/news?category=${encodeURIComponent(category)}`);
    if (res.ok) return (await res.json()) as NewsData;
  } catch {
    /* no API available */
  }
  const res = await fetch(`data/${encodeURIComponent(category)}.json`, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.json()) as NewsData;
}

/** The server's category list: the live API, else the list the static build
 *  wrote next to the snapshots, else the built-in defaults. */
export async function loadCategories(): Promise<Category[]> {
  for (const url of ['api/categories', 'data/categories.json']) {
    try {
      const res = await fetch(url);
      if (!res.ok) continue;
      const data: unknown = await res.json();
      if (Array.isArray(data) && data.length && data.every(isCategory)) return data;
    } catch {
      /* not there (or not JSON) — try the next source */
    }
  }
  return DEFAULT_CATEGORIES;
}

function isCategory(value: unknown): value is Category {
  const cat = value as Category | null;
  return typeof cat?.key === 'string' && typeof cat.label === 'string';
}

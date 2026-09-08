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

export async function loadCategories(): Promise<Category[]> {
  try {
    const res = await fetch('api/categories');
    if (!res.ok) return DEFAULT_CATEGORIES;
    const data = (await res.json()) as Category[];
    return Array.isArray(data) && data.length ? data : DEFAULT_CATEGORIES;
  } catch {
    return DEFAULT_CATEGORIES; // GitHub Pages mode
  }
}

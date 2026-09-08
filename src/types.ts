export interface NewsItem {
  title: string;
  source: string;
  link: string;
  publishedAt: number;
  image: string | null;
  snippet: string | null;
}

export interface NewsData {
  category: string;
  fetchedAt: number;
  items: NewsItem[];
  /** True when photo enrichment is still running server-side. */
  enriching?: boolean;
}

export interface Category {
  key: string;
  label: string;
}

export type FeedStatus = 'loading' | 'ok' | 'stale' | 'error';

export interface Settings {
  /** Headline swap interval per tile, in milliseconds. */
  cycleMs: number;
  showSnippets: boolean;
  showImages: boolean;
}

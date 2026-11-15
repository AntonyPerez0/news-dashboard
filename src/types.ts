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

export type ThemeSetting = 'auto' | 'light' | 'dark';

export interface Settings {
  /** Headline swap interval per tile, in milliseconds. */
  cycleMs: number;
  showSnippets: boolean;
  showImages: boolean;
  theme: ThemeSetting;
  /** Minutes on each category before moving to the next; 0 = stay put. */
  rotateMin: number;
  /** Ask the browser to keep the screen from sleeping while visible. */
  keepAwake: boolean;
}

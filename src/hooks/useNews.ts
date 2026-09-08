import { useCallback, useEffect, useRef, useState } from 'react';
import { loadNews } from '../api';
import { REFRESH_MS, STALE_MS } from '../config';
import type { FeedStatus, NewsItem } from '../types';

interface NewsState {
  items: NewsItem[];
  status: FeedStatus;
  fetchedAt: number;
  error: string;
}

/**
 * Polls the news feed for a category. Uses the live API when reachable and
 * the static GitHub Pages snapshots otherwise; re-polls on category change
 * and on tab re-focus after going stale.
 */
export function useNews(category: string): NewsState & { refresh: () => void } {
  const [items, setItems] = useState<NewsItem[]>([]);
  const [status, setStatus] = useState<FeedStatus>('loading');
  const [fetchedAt, setFetchedAt] = useState(0);
  const [error, setError] = useState('');
  const lastOkRef = useRef(0);
  const categoryRef = useRef(category);
  categoryRef.current = category;
  const enrichTimerRef = useRef(0);

  const load = useCallback(async () => {
    const cat = categoryRef.current;
    try {
      const data = await loadNews(cat);
      if (categoryRef.current !== cat) return; // user switched meanwhile
      lastOkRef.current = Date.now();
      setItems(data.items);
      setFetchedAt(data.fetchedAt);
      setStatus(data.items.length ? 'ok' : 'error');
      setError(data.items.length ? '' : 'no stories available');
      // Photos are scraped in the background after headlines arrive — grab
      // them with one quick follow-up poll instead of waiting 5 minutes.
      if (data.enriching) {
        window.clearTimeout(enrichTimerRef.current);
        enrichTimerRef.current = window.setTimeout(() => {
          if (categoryRef.current === cat) load();
        }, 45_000);
      }
    } catch (err) {
      if (categoryRef.current !== cat) return;
      setStatus('error');
      setError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  useEffect(() => {
    setItems([]);
    setStatus('loading');
    load();
    const id = setInterval(load, REFRESH_MS);
    return () => {
      window.clearTimeout(enrichTimerRef.current);
      clearInterval(id);
    };
  }, [category, load]);

  useEffect(() => {
    const id = setInterval(() => {
      if (status === 'ok' && lastOkRef.current && Date.now() - lastOkRef.current > STALE_MS) {
        setStatus('stale');
      }
    }, 30_000);
    return () => clearInterval(id);
  }, [status]);

  useEffect(() => {
    const onVisible = () => {
      if (!document.hidden && lastOkRef.current && Date.now() - lastOkRef.current > REFRESH_MS) {
        load();
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [load]);

  return { items, status, fetchedAt, error, refresh: load };
}

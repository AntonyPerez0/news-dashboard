import { useCallback, useEffect, useMemo, useRef } from 'react';
import { PALETTE } from '../config';
import { useWindowSize } from '../hooks/useWindowSize';
import { computeLayout } from '../utils';
import type { NewsItem, Settings } from '../types';
import { Tile } from './Tile';

interface TileGridProps {
  category: string;
  items: NewsItem[];
  allPaused: boolean;
  timeTick: number;
  settings: Settings;
}

export function TileGrid({ category, items, allPaused, timeTick, settings }: TileGridProps) {
  const { width, height } = useWindowSize();
  const { rows, cols } = useMemo(() => computeLayout(width, height), [width, height]);
  const count = rows * cols;
  const loading = items.length === 0;

  // Tile i owns every count-th item, so all tiles show distinct headlines.
  const lists = useMemo<NewsItem[][]>(() => {
    const buckets: NewsItem[][] = Array.from({ length: count }, () => []);
    items.forEach((item, idx) => {
      buckets[idx % count]?.push(item);
    });
    return buckets;
  }, [items, count]);

  const engines = useRef(new Map<number, (now: number) => void>());
  const register = useCallback((index: number, tick: ((now: number) => void) | null) => {
    if (tick) engines.current.set(index, tick);
    else engines.current.delete(index);
  }, []);

  // Shared heartbeat: drives countdown bars and swap checks for every tile.
  useEffect(() => {
    const id = setInterval(() => {
      const now = performance.now();
      engines.current.forEach((tick) => tick(now));
    }, 250);
    return () => clearInterval(id);
  }, []);

  return (
    <main
      key={category}
      id="grid"
      role="main"
      className={[!settings.showSnippets ? 'no-snippets' : '', !settings.showImages ? 'no-images' : '']
        .filter(Boolean)
        .join(' ')}
      style={{
        gridTemplateColumns: `repeat(${cols}, 1fr)`,
        gridTemplateRows: `repeat(${rows}, 1fr)`
      }}
    >
      {Array.from({ length: count }, (_, i) => (
        <Tile
          key={`${category}-${i}`}
          index={i}
          total={count}
          accent={PALETTE[i % PALETTE.length] ?? '#4f8cff'}
          list={lists[i] ?? []}
          gridPaused={allPaused}
          timeTick={timeTick}
          loading={loading}
          cycleMs={settings.cycleMs}
          register={register}
        />
      ))}
    </main>
  );
}

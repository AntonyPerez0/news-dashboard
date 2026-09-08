import { useEffect, useRef, useState } from 'react';
import { CYCLE_MS, FRESH_MS, PRELOAD_CAP_MS, SWAP_MS } from '../config';
import { faviconUrl, once, siteHostOf, timeAgo } from '../utils';
import type { NewsItem } from '../types';

interface TileProps {
  index: number;
  total: number;
  accent: string;
  list: NewsItem[];
  gridPaused: boolean;
  timeTick: number;
  loading: boolean;
  cycleMs: number;
  register: (index: number, tick: ((now: number) => void) | null) => void;
}

interface TileRuntime {
  pointer: number;
  nextSwapAt: number;
  paused: boolean;
  cycleMs: number;
}

/**
 * One dashboard card. Content swaps are driven by a shared heartbeat
 * (`tick`) rather than per-tile timer chains: each tile simply knows the
 * timestamp of its next swap, so a missed timer can never permanently
 * stall it and the countdown bar is a pure function of time.
 */
export function Tile({
  index, total, accent, list, gridPaused, timeTick, loading, cycleMs, register
}: TileProps) {
  const [current, setCurrent] = useState<NewsItem | null>(null);
  const [swapping, setSwapping] = useState(false);
  const [imgState, setImgState] = useState<'idle' | 'loaded' | 'failed'>('idle');
  const runtime = useRef<TileRuntime>({ pointer: 0, nextSwapAt: 0, paused: false, cycleMs });
  const assignedList = useRef<NewsItem[] | null>(null);
  const listRef = useRef(list);
  const currentRef = useRef(current);
  const gridPausedRef = useRef(gridPaused);
  const barRef = useRef<HTMLDivElement>(null);
  const tileRef = useRef<HTMLElement>(null);
  const tickRef = useRef<(now: number) => void>(() => {});

  listRef.current = list;
  currentRef.current = current;
  gridPausedRef.current = gridPaused;
  runtime.current.cycleMs = cycleMs;

  // New stride list (first load or refresh): commit content without the
  // swap animation, keeping the pointer so fresh stories flow in naturally.
  useEffect(() => {
    if (assignedList.current === list) return; // StrictMode double-invoke guard
    assignedList.current = list;
    const state = runtime.current;
    if (!list.length) return;
    if (state.pointer >= list.length || state.pointer < 0) state.pointer = 0;
    const had = currentRef.current !== null;
    const item = had ? list[state.pointer % list.length] : list[0];
    if (!item) return;
    state.pointer = had ? state.pointer + 1 : 1;
    setCurrent(item);
    state.nextSwapAt = performance.now() + index * (CYCLE_MS / total);
  }, [list, index, total]);

  // Coming out of a global pause, re-stagger so tiles don't swap in unison.
  useEffect(() => {
    if (gridPaused) return;
    runtime.current.nextSwapAt = Math.max(
      runtime.current.nextSwapAt,
      performance.now() + 300 + (index % 5) * 150
    );
  }, [gridPaused, index]);

  const advance = (now: number) => {
    const state = runtime.current;
    state.nextSwapAt = now + state.cycleMs;
    const item = listRef.current[state.pointer % Math.max(1, listRef.current.length)];
    state.pointer++;
    if (!item || item === currentRef.current) return;

    const commit = once(() => {
      setSwapping(true);
      window.setTimeout(() => {
        setCurrent(item);
        setSwapping(false);
      }, SWAP_MS);
    });

    // Preload the next photo so the crossfade never shows a half-loaded one.
    if (item.image) {
      const probe = new Image();
      probe.onload = commit;
      probe.onerror = commit;
      probe.src = item.image;
      window.setTimeout(commit, PRELOAD_CAP_MS);
    } else {
      commit();
    }
  };

  tickRef.current = (now: number) => {
    const state = runtime.current;
    const hovered = tileRef.current?.matches(':hover') ?? false;

    if (gridPausedRef.current) return;

    // Heal a stuck pause: mouseenter fired but the cursor left without an
    // event (or the element was replaced underneath it).
    if (state.paused && !hovered) {
      state.paused = false;
      state.nextSwapAt = Math.max(state.nextSwapAt, now + 800);
    }
    if (state.paused || hovered) return; // user is reading — freeze the tile

    if (barRef.current) {
      const startedAt = state.nextSwapAt - state.cycleMs;
      const pct = Math.min(1, Math.max(0, (now - startedAt) / state.cycleMs));
      barRef.current.style.width = (pct * 100).toFixed(1) + '%';
    }

    if (now >= state.nextSwapAt && listRef.current.length) advance(now);
  };

  useEffect(() => {
    register(index, (now) => tickRef.current(now));
    return () => register(index, null);
  }, [index, register]);

  const item = current;
  const hasImage = !!item?.image && imgState !== 'failed';
  const monogram = (item?.source || '?').trim().charAt(0).toUpperCase() || '?';
  const host = item ? siteHostOf(item) : null;
  const isNew = !!item && Date.now() - item.publishedAt < FRESH_MS;

  const classes = [
    'tile',
    loading || !item ? 'loading' : '',
    hasImage ? '' : 'no-img',
    item?.snippet ? '' : 'no-snippet',
    isNew ? 'fresh' : ''
  ]
    .filter(Boolean)
    .join(' ');

  const open = () => {
    if (current?.link) window.open(current.link, '_blank', 'noopener');
  };

  return (
    <article
      ref={tileRef}
      className={classes}
      style={{ '--accent': accent } as React.CSSProperties}
      role="button"
      tabIndex={0}
      aria-label={item ? `${item.source}: ${item.title}` : 'Loading story'}
      data-tick={timeTick}
      onMouseEnter={() => {
        runtime.current.paused = true;
      }}
      onMouseLeave={() => {
        runtime.current.paused = false;
        runtime.current.nextSwapAt = performance.now() + 1200;
      }}
      onClick={open}
      onKeyDown={(e) => {
        if (e.key === 'Enter') open();
      }}
    >
      <div className={swapping ? 'tile-inner swap' : 'tile-inner'}>
        <div className="tile-media">
          {hasImage && item?.image && (
            <img
              className={imgState === 'loaded' ? 'tile-img loaded' : 'tile-img'}
              src={item.image}
              alt=""
              loading="lazy"
              decoding="async"
              referrerPolicy="no-referrer"
              onLoad={() => setImgState('loaded')}
              onError={() => setImgState('failed')}
            />
          )}
          <span className="tile-mono">{monogram}</span>
        </div>
        <div className="tile-body">
          <div className="tile-meta">
            <div className="tile-source-wrap">
              {host && (
                <img
                  className="tile-favicon"
                  src={faviconUrl(host)}
                  alt=""
                  loading="lazy"
                  onError={(e) => {
                    e.currentTarget.style.display = 'none';
                  }}
                />
              )}
              <span className="tile-source">{item?.source}</span>
              {isNew && <span className="badge-new">NEW</span>}
            </div>
            <div className="tile-time">{item ? timeAgo(item.publishedAt) : ''}</div>
          </div>
          <div className="tile-headline">
            <span>{item?.title ?? 'Loading live headlines…'}</span>
          </div>
          <div className="tile-snippet">
            <span>{item?.snippet ?? ''}</span>
          </div>
        </div>
      </div>
      <div className="tile-progress" ref={barRef} />
    </article>
  );
}

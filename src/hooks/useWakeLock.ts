import { useEffect } from 'react';

export const WAKE_LOCK_SUPPORTED = typeof navigator !== 'undefined' && 'wakeLock' in navigator;

/**
 * Keeps the screen from sleeping while the dashboard is visible. The browser
 * drops the lock whenever the tab is hidden (and may drop it at any time), so
 * it is re-requested on return and re-checked once a minute rather than held
 * by a single request that can silently lapse.
 */
export function useWakeLock(enabled: boolean): void {
  useEffect(() => {
    if (!enabled || !WAKE_LOCK_SUPPORTED) return;
    let sentinel: WakeLockSentinel | null = null;
    let stopped = false;

    const acquire = async () => {
      if (stopped || document.visibilityState !== 'visible') return;
      if (sentinel && !sentinel.released) return;
      try {
        const lock = await navigator.wakeLock.request('screen');
        if (stopped) void lock.release();
        else sentinel = lock;
      } catch {
        /* refused (battery saver, permissions policy) — try again later */
      }
    };

    void acquire();
    const id = window.setInterval(acquire, 60_000);
    document.addEventListener('visibilitychange', acquire);
    return () => {
      stopped = true;
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', acquire);
      void sentinel?.release().catch(() => {});
    };
  }, [enabled]);
}

export function timeAgo(ts: number): string {
  if (!ts) return '';
  const seconds = Math.max(0, (Date.now() - ts) / 1000);
  if (seconds < 60) return 'now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

export function once(fn: () => void): () => void {
  let called = false;
  return () => {
    if (called) return;
    called = true;
    fn();
  };
}

/** Grid dimensions for a viewport: picks columns from the aspect ratio so
 *  every tile stays roughly square-ish, then fills rows to hold 12+ tiles. */
export function computeLayout(width: number, height: number): { rows: number; cols: number } {
  const aspect = width / Math.max(1, height);
  const cols = Math.min(6, Math.max(2, Math.round(Math.sqrt(12 * aspect))));
  const rows = Math.min(6, Math.max(2, Math.ceil(12 / cols)));
  return { rows, cols };
}

/** Publisher hostname for favicon/logos — prefers the resolved publisher
 *  site recorded during enrichment, falls back to the link's own host. */
export function siteHostOf(item: { link: string; site?: string }): string | null {
  const raw = item.site ? `https://${item.site}` : item.link;
  try {
    return new URL(raw).hostname.replace(/^www\./, '');
  } catch {
    return null;
  }
}

export function faviconUrl(host: string): string {
  return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=64`;
}

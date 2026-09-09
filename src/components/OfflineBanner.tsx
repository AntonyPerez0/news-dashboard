import { useOnline } from '../hooks/useOnline';

/** Slim banner shown when the browser reports no connectivity — data keeps
 *  flowing from the service worker's cached snapshots. */
export function OfflineBanner() {
  const online = useOnline();
  if (online) return null;

  return (
    <div className="offline-banner" role="status">
      <span className="offline-dot" aria-hidden="true" />
      You're offline — showing cached headlines. Reconnecting automatically…
    </div>
  );
}

import { BUILD_ID, BUILD_TIME } from './version';

/**
 * Picks up new deploys on a tab nobody reloads. The build publishes its
 * identity as version.json; when that names a newer build than the one
 * running, the tab reloads itself.
 */

const CHECK_MS = 15 * 60 * 1000;
const TRIED_KEY = 'nd.updatedTo';

interface BuildInfo {
  build: string;
  time: number;
}

/** True when `remote` describes a build newer than the running one. A copy
 *  that is merely different (an older one from a lagging CDN edge) is not a
 *  reason to reload. */
export function isNewerBuild(remote: unknown, current: BuildInfo): remote is BuildInfo {
  const info = remote as Partial<BuildInfo> | null;
  return (
    typeof info?.build === 'string' &&
    typeof info.time === 'number' &&
    info.build !== current.build &&
    info.time > current.time
  );
}

export async function checkForUpdate(reload: () => void = () => window.location.reload()): Promise<void> {
  let remote: unknown;
  try {
    const res = await fetch('version.json', { cache: 'no-store' });
    if (!res.ok) return;
    remote = await res.json();
  } catch {
    return; // offline, or served by something without a version.json
  }
  if (!isNewerBuild(remote, { build: BUILD_ID, time: BUILD_TIME })) return;

  // One reload per build: if it didn't bring the new bundle (a cache in
  // between still holds the old page), wait for the next build, don't loop.
  if (sessionStorage.getItem(TRIED_KEY) === remote.build) return;
  // Not under someone's cursor or while they are in the settings.
  if (document.querySelector('.tile:hover, .drawer.open')) return;
  sessionStorage.setItem(TRIED_KEY, remote.build);

  // Let a new service worker install first, so the reload is served by it.
  try {
    await (await navigator.serviceWorker?.getRegistration())?.update();
  } catch {
    /* best-effort */
  }
  reload();
}

/** Checks on an interval and whenever the tab becomes visible again. */
export function startUpdateChecks(): () => void {
  const check = () => {
    if (!document.hidden) void checkForUpdate();
  };
  const id = window.setInterval(check, CHECK_MS);
  document.addEventListener('visibilitychange', check);
  return () => {
    window.clearInterval(id);
    document.removeEventListener('visibilitychange', check);
  };
}

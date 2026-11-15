import type { Settings } from './types';

export const DEFAULT_SETTINGS: Settings = {
  cycleMs: 18_000,
  showSnippets: true,
  showImages: true,
  photosOnly: true,
  theme: 'auto',
  rotateMin: 0,
  keepAwake: false
};

export const CYCLE_OPTIONS: { label: string; value: number }[] = [
  { label: '12s', value: 12_000 },
  { label: '18s', value: 18_000 },
  { label: '30s', value: 30_000 }
];

export const ROTATE_OPTIONS: { label: string; value: number }[] = [
  { label: 'Off', value: 0 },
  { label: '2 min', value: 2 },
  { label: '5 min', value: 5 },
  { label: '10 min', value: 10 }
];

const KEY = 'nd.settings';

export function loadSettings(): Settings {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || '{}') as Partial<Settings>;
    return { ...DEFAULT_SETTINGS, ...raw };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(settings: Settings): void {
  localStorage.setItem(KEY, JSON.stringify(settings));
}

function flag(value: string | null): boolean | null {
  if (value === null) return null;
  if (/^(1|true|on|yes)$/i.test(value)) return true;
  if (/^(0|false|off|no)$/i.test(value)) return false;
  return null;
}

function numberIn(value: string | null, min: number, max: number): number | null {
  if (value === null || value.trim() === '') return null;
  const n = Number(value);
  return Number.isFinite(n) && n >= min && n <= max ? n : null;
}

/**
 * Settings pinned by the page URL, for kiosk displays and shareable setups:
 *
 *   ?speed=30      seconds per headline (5–300)
 *   ?rotate=5      minutes per category (0 or "off" stops rotation)
 *   ?excerpts=0    hide excerpts          ?photos=0   hide photos
 *   ?photosonly=0  also show stories that have no photo
 *   ?awake=1       keep the screen awake
 *
 * They win over the saved settings on every load and are never saved
 * themselves. Values that don't parse are ignored. (`?theme=` is handled by
 * resolveTheme, `?category=` by categoryFromUrl.)
 */
export function settingsFromUrl(search: string): Partial<Settings> {
  const params = new URLSearchParams(search);
  const pinned: Partial<Settings> = {};

  const speed = numberIn(params.get('speed'), 5, 300);
  if (speed !== null) pinned.cycleMs = Math.round(speed * 1000);

  const rotate = params.get('rotate');
  const rotateMin = flag(rotate) === false ? 0 : numberIn(rotate, 0, 120);
  if (rotateMin !== null) pinned.rotateMin = rotateMin;

  const excerpts = flag(params.get('excerpts'));
  if (excerpts !== null) pinned.showSnippets = excerpts;
  const photos = flag(params.get('photos'));
  if (photos !== null) pinned.showImages = photos;
  const photosOnly = flag(params.get('photosonly'));
  if (photosOnly !== null) pinned.photosOnly = photosOnly;
  const awake = flag(params.get('awake'));
  if (awake !== null) pinned.keepAwake = awake;

  return pinned;
}

/** `?category=technology` opens on that category. */
export function categoryFromUrl(search: string): string | null {
  const key = new URLSearchParams(search).get('category')?.trim().toLowerCase();
  return key && /^[a-z0-9][a-z0-9-]*$/.test(key) ? key : null;
}

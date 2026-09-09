import type { Settings } from './types';

export const DEFAULT_SETTINGS: Settings = {
  cycleMs: 18_000,
  showSnippets: true,
  showImages: true,
  theme: 'auto'
};

export const CYCLE_OPTIONS: { label: string; value: number }[] = [
  { label: '12s', value: 12_000 },
  { label: '18s', value: 18_000 },
  { label: '30s', value: 30_000 }
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

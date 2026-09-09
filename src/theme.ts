import type { Settings } from './types';

export type ResolvedTheme = 'light' | 'dark';
export type ThemeSetting = Settings['theme'];

/** Browser-chrome color per theme — keep in sync with index.html pre-paint. */
export const THEME_COLORS: Record<ResolvedTheme, string> = {
  light: '#f2f4f8',
  dark: '#0b0e14'
};

/** Daytime window for the "auto" theme: light between 7:00 and 19:00 local. */
export function isDaytime(date = new Date()): boolean {
  const hour = date.getHours();
  return hour >= 7 && hour < 19;
}

/** Resolves a theme setting to a concrete theme. A `?theme=light|dark` URL
 *  param wins over the saved setting — handy for sharing theme previews.
 *  Safe outside the browser (tests, SSR). */
export function resolveTheme(setting: ThemeSetting, date = new Date()): ResolvedTheme {
  let url: string | null = null;
  if (typeof window !== 'undefined') {
    url = new URLSearchParams(window.location.search).get('theme');
  }
  const effective = url === 'light' || url === 'dark' ? url : setting;
  if (effective === 'auto') return isDaytime(date) ? 'light' : 'dark';
  return effective;
}

/** Applies the theme to <html> and the browser-chrome color. */
export function applyTheme(resolved: ResolvedTheme): void {
  document.documentElement.dataset.theme = resolved;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', THEME_COLORS[resolved]);
}

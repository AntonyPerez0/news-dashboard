/** Build identity, surfaced in the About panel. The version comes from
 *  package.json at build time via Vite's define (see vite.config.ts). */

declare const __APP_VERSION__: string;
declare const __BUILD_DATE__: string;

export const APP_VERSION = __APP_VERSION__;
export const BUILD_DATE = __BUILD_DATE__;

export const APP_NAME = 'News Dashboard';
export const REPO_URL = 'https://github.com/AntonyPerez0/news-dashboard';
export const LIVE_URL = 'https://antonyperez0.github.io/news-dashboard/';

/** Build identity, surfaced in the About panel. The version comes from
 *  package.json at build time via Vite's define (see vite.config.ts). */

declare const __APP_VERSION__: string;
declare const __BUILD_DATE__: string;
declare const __BUILD_ID__: string;
declare const __BUILD_TIME__: number;

export const APP_VERSION = __APP_VERSION__;
export const BUILD_DATE = __BUILD_DATE__;
/** The commit this bundle was built from, and when it was committed. The
 *  same pair is published as version.json, which is how a running tab
 *  notices a newer build (see update.ts). */
export const BUILD_ID = __BUILD_ID__;
export const BUILD_TIME = __BUILD_TIME__;

export const APP_NAME = 'News Dashboard';
export const REPO_URL = 'https://github.com/AntonyPerez0/news-dashboard';
export const LIVE_URL = 'https://newsdash.page/';

# Changelog

## [2.5.0] — 2026-11-15

### Added

- **Refresh trigger** — a Cloudflare Worker (`cloudflare/refresh-trigger`)
  starts the deploy workflow every 15 minutes, with a setup script that
  checks both tokens before deploying. The hosted site goes from a few
  refreshes a day to data at most about half an hour old
- **Page cache carried between builds** — the scraper's results are
  published as `data/page-cache.json` and seed the next run, which then
  fetches only new stories' pages: 57 instead of 690 between the first two
  live runs, 15 minutes apart, with the data step down from 81 s to 42 s

### Changed

- The deploy workflow no longer has a `schedule:` trigger: GitHub ran it
  every 3 to 10 hours and disables scheduled workflows after 60 days
  without repository activity

## [2.4.0] — 2026-11-14

### Added

- **WoW: Forever category** — Blizzard's own posts (read through Google
  News, since Blizzard publishes no RSS), Wowhead's Forever feed, Massively
  Overpowered, MMO-Champion, Blizzard Watch and a Google News search for the
  wider press. Seven-day window; `-` is its shortcut key
- **Feed options** `match`, `exclude`, `trim` and `official` for
  single-subject categories, in `server/feeds.js` and in `NEWS_FEEDS_FILE`
- `-` and `=` switch to an 11th and 12th category

### Fixed

- **Headlines cut short and credited to a date or a subtitle** — "Hotfixes -
  November 11, 2026 - Blizzard News" became the headline "Hotfixes" from the
  source "November 11, 2026". Only a repeat of the same outlet is now
  stripped as a second suffix; an outlet's own "— Site Name" tail is removed
- **Lowercase one-word outlets** ("space4games") left in the headline with
  the source shown as "Google News"
- **Photos missing for pages served with a 3xx status** — Blizzard's hotfix
  posts arrive as HTTP 307 with the full page
- An outlet's index page appearing as a story ("Blizzard News")

## [2.3.0] — 2026-11-14

### Added

- **Category rotation** — optional timer (2, 5 or 10 minutes) that moves to
  the next category; holds while paused, in the settings or while a tile is
  under the cursor
- **URL parameters** — `?category=`, `?rotate=`, `?speed=`, `?excerpts=`,
  `?photos=`, `?awake=` pin a setup for kiosk displays without saving it
- **Keep screen awake** — opt-in setting using the Screen Wake Lock API
- **Self-updating tabs** — the build publishes `version.json`; a running tab
  reloads itself when a newer build is deployed
- **Configurable feeds and region** — `NEWS_EDITION` picks the Google News
  edition, `NEWS_FEEDS_FILE` replaces the categories with your own; the
  static build publishes its category list for the client

### Fixed

- **Previous category's stories lingering after a switch** (regression in
  2.2.1) — later tiles showed the old category for up to ~16 s. The news
  hook no longer hands out another category's stories
- **Stories months old on a live board** — anything older than three days is
  dropped (per-category override, slow categories are topped back up)
- **Missing photos** — the scraper identifies itself before falling back to
  a browser identity (ESPN, Phys.org) and reads past 150 KB to `</head>`
  (Hollywood Reporter, Variety). Measured photo coverage 80 % → 91 %
- **Two dead feeds removed** — the Google News "Gaming" topic and Yahoo
  Finance returned no stories
- **A reload after a deploy showing the old version** — the service worker
  now serves the page network-first
- **Closed settings drawer reachable by keyboard**; the open drawer takes
  focus, keeps Tab inside and gives focus back, and dashboard shortcuts no
  longer fire while it is open
- Titles escaped twice by their feed (`Hope &amp; Fear`)
- Unbounded page-metadata cache on a long-running server

### Changed

- **Tiles are real links** — middle-click, "open in new tab" and "copy
  link" work
- About panel says where images come from: photos from publishers, source
  icons from Google's icon service (now requested without a referrer)

## [2.2.1] — 2026-11-14

### Fixed

- **Old data shown as current** — the status dot went by when the browser
  last fetched successfully, so a frozen week-old snapshot read as a healthy
  "updated 6d". Staleness now goes by the data's own timestamp (older than
  45 minutes), the label reads "stale · updated 6d", and on narrow windows
  a stale or failing feed keeps its dot instead of disappearing
- **One broken photo disabled photos for the whole tile** — the failure was
  remembered per tile, not per photo, so the tile showed monograms until a
  category switch or reload. It now applies only to the photo that failed
- **Whole grid cutting at once on every poll** — each refresh re-committed
  every tile without a fade and restarted the stagger, even when the feed
  was unchanged. Tiles now keep the story on screen and their own schedule,
  and pick up a newly scraped photo or excerpt in place
- `npm ci` failing on npm 11 (lockfile was missing an optional esbuild entry)
- README and deploy workflow claimed 15-minute refreshes; GitHub actually
  runs the schedule a few times a day and disables it after 60 days without
  repository activity. Both now say so
- Duplicate OpenGraph/Twitter tags in `index.html`

### Changed

- Toolchain: Vite 5 → 8, Vitest 2 → 5, Express patched to 4.22.3;
  `npm audit` is clean. Development now needs Node 22.12 or newer
- Component tests (jsdom + Testing Library) for the tile engine, the polling
  hook and the header status

## [2.2.0] — 2026-09-08

### Added

- **PWA** — installable (manifest, maskable icons), offline-capable:
  cache-first app shell, network-first news data with stale flag, so the
  dashboard boots and runs with the last known headlines even when offline
- **Offline banner** — slim pill when the browser reports no connectivity
- **About panel** — version, build date, privacy note ("no analytics, no
  tracking"), source + live-site links in the settings drawer
- Brand icons (192/512/maskable/apple-touch) generated from the logo

All notable changes to this project are documented here.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/).

## [2.1.0] — 2026-09-08

### Fixed

- **Page reloading itself every ~8s** — the recovery screen's auto-reload
  countdown started on mount instead of on error, so the dashboard
  full-page-reloaded in normal operation. The countdown now only starts when
  a render error actually occurs
- **Light mode flashing dark on every reload** — the saved theme is now
  applied by a pre-paint script in `index.html` before first paint (the dark
  `:root` default used to flash first). The browser-chrome `theme-color`
  follows the active theme too
- **Infinite recovery loop** — after 3 auto-reloads within a minute (a
  deterministic error), recovery pauses and waits for a manual reload

### Added

- **Gaming category** — Polygon, The Verge Games, IGN, GameSpot, Eurogamer
  plus a Google News firehose
- **Day/night themes** — light "newsprint" edition and dark edition, with an
  `auto` mode that follows the clock (07:00–19:00 light). `?theme=light|dark`
  URL param pins a theme for shareable previews
- **Settings drawer** — cycle speed (12s/18s/30s), excerpt/photo density
  toggles, theme picker, shortcut cheat-sheet; persisted to `localStorage`
- **Error boundary** — branded recovery screen with auto-reload countdown
  instead of a blank page when a render error hits an unattended tab
- **Branded 404 page** and **OpenGraph/Twitter share card** (`og-card.jpg`)
- **JSON-LD excerpt fallback** — stories missing RSS summaries scrape the
  article's structured metadata; snippet coverage rose from ~63% to ~89%
- **Fuzzy near-duplicate collapsing** — lightly-reworded copies of the same
  story across feeds are merged; number-aware so different scores/amounts
  ($45m vs $120m) never merge, but omitted years still match
- **Repo hygiene** — `CHANGELOG.md`, `CONTRIBUTING.md`, `.nvmrc`,
  `.editorconfig`, MIT `LICENSE`, semantic-version tags

### Fixed

- Frozen tiles after category switch: cycle chains re-arm on refresh and a
  watchdog heals dead/stuck tiles
- Progress bars vanishing after first swap: replaced CSS-transition
  choreography with timestamp-driven updates
- Cold-start latency: `/api/news` no longer blocks on photo enrichment;
  headlines respond in seconds and enrichment lands on a follow-up poll
- Header wrapping to three rows on side monitors: compact single-row design
  with progressive info hiding and fade-edge scrolling
- Missing CI export on `extractMetaDescription`

### Changed

- Frontend rebuilt in **React 18 + strict TypeScript (Vite)** with a
  heartbeat-driven tile engine; vanilla JS predecessor removed
- Cycle speed default 12s → 18s with per-tile countdown bars
- Editorial typography (Newsreader serif headlines, Inter UI) and source
  favicons on every card

## [2.0.0] — 2026-09-07

### Added

- React + TypeScript (Vite) frontend with heartbeat-driven tile engine
- 10 categories and a feed registry designed for extension
- GitHub Actions CI (typecheck + tests + build) and scheduled deploys

### Changed

- Vanilla JS frontend replaced by the React implementation

## [1.x] — 2026-09-07

- Initial releases: Express data pipeline, RSS aggregation with
  stale-while-revalidate caching, og:image enrichment, GitHub Pages deploys,
  headline cycling grid, esports spam filter, per-tile countdown bars

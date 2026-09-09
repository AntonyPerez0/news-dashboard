# Changelog

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

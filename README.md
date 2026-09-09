# News Dashboard

[![CI](https://github.com/AntonyPerez0/news-dashboard/actions/workflows/ci.yml/badge.svg)](https://github.com/AntonyPerez0/news-dashboard/actions/workflows/ci.yml)
[![Deploy](https://github.com/AntonyPerez0/news-dashboard/actions/workflows/deploy.yml/badge.svg)](https://github.com/AntonyPerez0/news-dashboard/actions/workflows/deploy.yml)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![React 18](https://img.shields.io/badge/React-18-61DAFB?logo=react&logoColor=white)](https://react.dev/)
[![Tested](https://img.shields.io/badge/tests-26%20passing-3FB950)](#testing)

A live news dashboard built for a second monitor. Ten categories of headlines
cycle continuously through a grid of rich tiles — photos, excerpts, source
logos — so the news stays glanceable without ever touching a scrollbar.

**Live:** [newsdash.page](https://newsdash.page/)

![News Dashboard — live headline grid](docs/screenshot.jpg)

## Why this project exists

The interesting engineering problem here isn't displaying news — it's keeping
a browser tab healthy and populated for weeks of unattended runtime, fed by
inconsistent third-party data, with zero API keys and zero server costs.

## Highlights

- **React 18 + strict TypeScript** — the whole frontend is typed end-to-end,
  including the data layer that transparently switches between a live Express
  API and pre-built static snapshots
- **Heartbeat tile engine** — every tile's swap is a timestamp comparison on a
  single 250 ms heartbeat, so swaps, hover-pauses, countdown bars and
  stuck-state healing are pure functions of time; a throttled background tab
  can never permanently stall one
- **Photo & excerpt pipeline** — most RSS feeds ship no image or summary, so
  each story falls back to scraping the article's `og:image` /
  `og:description` / JSON-LD metadata — after resolving Google News gateway
  links back to real publisher URLs. Coverage: ~90 % photos, ~90 % excerpts;
  scraper-blocking publishers (WSJ, Reuters) degrade to styled monograms
- **Self-healing data layer** — `Promise.allSettled` per feed means one dead
  outlet never takes down a category; fuzzy near-duplicate collapsing stops
  lightly-reworded versions of the same story appearing twice; SWR caching
  with negative-result backoff keeps upstream feeds unharmed during outages
- **10 categories, 20+ feeds** — Headlines, World, Business, Technology,
  Sports, CS Esports, Gaming, Science, Health, Entertainment, aggregated from
  BBC, NPR, Al Jazeera, The Verge, Ars Technica, ESPN, HLTV, Polygon, IGN,
  GameSpot, Eurogamer and more
- **Quality gates** — 26 Vitest unit tests over the data pipeline, strict
  `tsc` typecheck, both wired into CI on every push

## Testing

The test suite targets the parts where real data bites: Google News title
suffix stripping (doubled suffixes, hyphenated outlets like `WSB-TV`),
XML sanitizing of unescaped `&`, betting-spam filtering, meta-tag extraction
with fallback chains, grid layout math across aspect ratios, and deduping.

```bash
npm test        # 26 tests, no network required
```

CI runs typecheck + tests + production build on every push; the deploy
workflow rebuilds and republishes the site with fresh data every 15 minutes.

## Architecture

```
GitHub Action (every 15 min)                local: npm start
       │ scripts/generate-data.js                  │ /api/news (10-min SWR cache)
       ▼                                           ▼
dist/data/<category>.json  ─── both served to ───┐
                                                 ▼
                      browser polls every 5 min (live API first,
                      transparent static-snapshot fallback)
```

```
src/                          server/
  components/                   server.js      Express, SWR cache, API
    Tile.tsx        tile engine   news.js      RSS fetch, dedupe, meta scrape
    TileGrid.tsx    grid + heartbeat          feeds.js    feed registry
    Header.tsx      nav, clock, status      scripts/
    SettingsDrawer  speed, density            generate-data.js  static build
  hooks/        useNews, useClock, useWindowSize
  api.ts        live-API-first data layer
  types.ts      shared contracts
```

**Design decisions worth calling out:**

- **Timestamp-driven UI** — the vanilla predecessor used per-tile
  `setTimeout` chains, which froze whenever a timer died. The React rewrite
  stores each tile's `nextSwapAt` and compares it against a heartbeat, making
  every visual state recoverable and testable
- **API-first, static-fallback** — the same frontend runs from `npm start`
  (freshest data) and GitHub Pages (pre-built snapshots), chosen at request
  time by whether the API responds
- **Enrichment in the background** — headlines respond in seconds; photo
  scraping continues server-side and the client picks up enriched data on a
  quick follow-up poll, so cold starts never block

## Run it

```bash
npm install
npm run build     # strict typecheck + vite build
npm start         # → http://localhost:3000 (API + built app)
```

Developing:

```bash
npm run dev           # vite dev server (proxies API to :3000)
npm run dev:server    # Express with hot reload
npm run test:watch    # vitest watch mode
```

Keyboard: `F` fullscreen · `Space` pause/resume · `1`–`9`, `0` categories ·
`Enter` open focused story

## Adding feeds

Registry lives in [`server/feeds.js`](server/feeds.js):

```js
gaming: {
  label: 'Gaming',
  feeds: [
    { url: 'https://www.polygon.com/rss/index.xml', name: 'Polygon' },
    // aggregate: true strips the " - Outlet" suffix Google News appends
    { url: 'https://news.google.com/rss/…', name: 'Google News', aggregate: true }
  ]
}
```

## Versioning & changelog

Releases follow [semver](https://semver.org/) and are tagged; notable changes
are documented in [CHANGELOG.md](CHANGELOG.md). Contributions welcome — see
[CONTRIBUTING.md](CONTRIBUTING.md).

## License

MIT — see [LICENSE](LICENSE).

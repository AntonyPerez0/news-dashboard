# News Dashboard

[![CI](https://github.com/AntonyPerez0/news-dashboard/actions/workflows/ci.yml/badge.svg)](https://github.com/AntonyPerez0/news-dashboard/actions/workflows/ci.yml)
[![Deploy](https://github.com/AntonyPerez0/news-dashboard/actions/workflows/deploy.yml/badge.svg)](https://github.com/AntonyPerez0/news-dashboard/actions/workflows/deploy.yml)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![React 18](https://img.shields.io/badge/React-18-61DAFB?logo=react&logoColor=white)](https://react.dev/)
[![Tested](https://img.shields.io/badge/tests-Vitest-3FB950)](#testing)

A live news dashboard built for a second monitor. Six categories of headlines
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
  links back to real publisher URLs. The scraper identifies itself first
  (some publishers serve a declared bot but challenge a fake browser) and
  reads on to `</head>` when a page buries its tags under 300 KB of script.
  For publishers that refuse every automated request (AP, Reuters, WSJ), a
  news search finds the photo on a syndicated copy of the same headline.
  Stories that still have no photo are left off the grid by default
- **Self-healing data layer** — `Promise.allSettled` per feed means one dead
  outlet never takes down a category; fuzzy near-duplicate collapsing stops
  lightly-reworded versions of the same story appearing twice; stories older
  than three days are dropped; SWR caching with negative-result backoff
  keeps upstream feeds unharmed during outages
- **Built to be left alone** — a running tab notices a new deploy and
  reloads itself, categories can rotate on a timer, the screen can be kept
  awake, and a whole setup fits in the URL for kiosk displays
- **6 categories, 20+ feeds** — Headlines, World, Technology, Gaming,
  CS Esports and WoW: Forever, aggregated from BBC, NPR, Al Jazeera, The
  Verge, Ars Technica, TechCrunch, Polygon, IGN, GameSpot, Eurogamer, HLTV,
  Wowhead, Blizzard and more. More tabs are a
  [feeds file](#your-own-feeds-and-region) away
- **Quality gates** — Vitest tests over the data pipeline, the tile engine
  and the polling hook, plus a strict `tsc` typecheck, all wired into CI on
  every push

## Testing

The test suite targets the parts where real data bites: Google News title
suffix stripping (doubled suffixes, hyphenated outlets like `WSB-TV`),
XML sanitizing of unescaped `&`, betting-spam filtering, meta-tag extraction
with fallback chains, grid layout math across aspect ratios, and deduping.
Component tests (jsdom) cover the unattended-runtime cases: a photo that
fails to load, a refresh arriving mid-cycle, and data that has gone stale.

```bash
npm test        # no network required
```

CI runs typecheck + tests + production build on every push; the deploy
workflow rebuilds and republishes the site with fresh data every 15 minutes
(see [Live-site freshness](#live-site-freshness)).

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
  hooks/        useNews, useClock, useWakeLock
  update.ts     reload when a newer build is out
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

## Live-site freshness

The hosted site is rebuilt every 15 minutes. A small Cloudflare Worker
([`cloudflare/refresh-trigger`](cloudflare/refresh-trigger)) starts the
deploy workflow on a timer; both the Worker and the workflow run on free
plans. GitHub's own `schedule:` trigger is not used for this: it is
best-effort (it ran this workflow every 3 to 10 hours), and GitHub disables
scheduled workflows after 60 days without repository activity.

Frequent runs stay cheap for publishers because the scraper's results are
published with the site (`data/page-cache.json`) and the next run starts
from them: a run fetches only the article pages of stories that are new,
a few dozen instead of several hundred.

When the data is older than 45 minutes the header says so ("stale · updated
4h"). If that happens, the Worker's cron events in the Cloudflare dashboard
show why; the usual cause is an expired or revoked GitHub token (GitHub
answers 401), fixed by running the setup below again with a new token.

### Setting up the trigger on a fork

1. Create a fine-grained GitHub token with
   [this pre-filled form](https://github.com/settings/personal-access-tokens/new?name=newsdash+refresh+trigger&description=Lets+a+Cloudflare+Worker+start+the+news-dashboard+deploy+workflow&expires_in=none&actions=write):
   under **Repository access** choose **Only select repositories** and pick
   your fork. It needs **Actions: read and write** and nothing else.
2. Create a Cloudflare API token with
   [this pre-filled form](https://dash.cloudflare.com/profile/api-tokens?permissionGroupKeys=%5B%7B%22key%22%3A%22workers_scripts%22%2C%22type%22%3A%22edit%22%7D%2C%7B%22key%22%3A%22account_settings%22%2C%22type%22%3A%22read%22%7D%5D&accountId=%2A&zoneId=all&name=newsdash%20refresh%20trigger%20setup).
   It is only used to deploy and can be deleted afterwards.
3. Set `GITHUB_REPO` in
   [`wrangler.toml`](cloudflare/refresh-trigger/wrangler.toml) to your fork
   and run:

   ```bash
   CLOUDFLARE_API_TOKEN=… GITHUB_DISPATCH_TOKEN=… ./cloudflare/refresh-trigger/setup.sh
   ```

   The script checks both tokens, starts one deploy to prove the GitHub
   token works, deploys the Worker and stores the GitHub token on it as a
   secret.

Without the Worker the site still deploys on every push and from the
**Run workflow** button; add a `schedule:` trigger to
[`deploy.yml`](.github/workflows/deploy.yml) if a few refreshes a day are
enough.

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

Keyboard: `F` fullscreen · `Space` pause/resume · `1`–`9`, `0`, `-` categories ·
`Enter` open focused story · `Esc` close settings

## Kiosk setup

Everything in the settings drawer can also be pinned from the URL, so a
display can be set up with a bookmark and nothing else:

```
https://newsdash.page/?category=technology&rotate=5&speed=30&awake=1&theme=dark
```

| Parameter | Values | Effect |
| --- | --- | --- |
| `category` | a category key (`headlines`, `world`, …) | opens on that category |
| `rotate` | minutes, `0` or `off` | moves to the next category on a timer |
| `speed` | seconds, 5–300 | time each headline stays on a tile |
| `excerpts`, `photos` | `1` / `0` | show or hide excerpts and photos |
| `photosonly` | `1` / `0` | leave out stories that have no photo (on by default) |
| `awake` | `1` / `0` | keep the screen from sleeping (HTTPS or localhost only) |
| `theme` | `light`, `dark` | pin the theme |

URL values win over saved settings on every load and are never saved
themselves; changing a setting by hand takes over for that setting until the
page is reloaded.

## Adding feeds

Registry lives in [`server/feeds.js`](server/feeds.js); the tabs appear in
the order the categories are listed there:

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

## Your own feeds and region

The feeds are fetched by the server (or the deploy job), not the browser, so
they are configured where that runs — your own `npm start`, or your fork's
deploy — with two environment variables. The hosted newsdash.page uses the
defaults.

**`NEWS_EDITION`** switches the Google News feeds to another edition, as
`<COUNTRY>:<language>`:

```bash
NEWS_EDITION=GB:en npm start        # also DE:de, FR:fr, MX:es-419, …
```

**`NEWS_FEEDS_FILE`** points at a JSON file that replaces the built-in
categories entirely:

```json
{
  "categories": {
    "berlin": {
      "label": "Berlin",
      "maxAgeDays": 7,
      "feeds": [
        { "url": "https://www.tagesschau.de/index~rss2.xml", "name": "tagesschau" },
        { "googleTopic": "WORLD" },
        { "googleSearch": "berlin when:7d" },
        { "googleTop": true }
      ]
    }
  }
}
```

A feed is either a `url` with the `name` shown on its tiles, or a Google News
shorthand that follows `NEWS_EDITION`: `googleTop`, `googleTopic` (`WORLD`,
`NATION`, `BUSINESS`, `TECHNOLOGY`, `ENTERTAINMENT`, `SPORTS`, `SCIENCE`,
`HEALTH`) or `googleSearch`. `maxAgeDays` overrides the three-day cut-off for
a slow category. A file with a mistake stops the server at startup with the
path of the bad entry.

For a tab about one subject — the built-in WoW: Forever category in
[`server/feeds.js`](server/feeds.js) is the worked example — any feed can
also take:

| Option | Example | Effect |
| --- | --- | --- |
| `match` | `"\\bforever\\b"` | keep only headlines matching the pattern (a general feed narrowed to one topic) |
| `exclude` | `"\\bguide\\b"` | drop headlines matching the pattern |
| `trim` | `[" — World of Warcraft"]` | endings to remove from headlines |
| `official` | `true`, or `"^Blizzard"` | the publisher's own feed: its copy of a story is kept over a repost. A pattern picks the publisher out of a mixed search feed by source name |

Patterns are case-insensitive regular expressions.

On a fork deployed to GitHub Pages, set both as repository variables
(Settings → Secrets and variables → Actions → Variables), with
`NEWS_FEEDS_FILE` as a path inside the repo.

## Versioning & changelog

Releases follow [semver](https://semver.org/) and are tagged; notable changes
are documented in [CHANGELOG.md](CHANGELOG.md). Contributions welcome — see
[CONTRIBUTING.md](CONTRIBUTING.md).

## License

MIT — see [LICENSE](LICENSE).

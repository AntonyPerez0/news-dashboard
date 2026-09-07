# News Dashboard

An ambient, fullscreen news dashboard built for a second monitor. Live headlines
arrive as a grid of tiles that continuously fade out and cycle to the next story,
so you can glance over the news without ever touching a scrollbar.

![News Dashboard](docs/screenshot.jpg)

## Features

- **9 categories** — Headlines, World, Business, Technology, Sports,
  CS Esports, Science, Health, Entertainment — aggregated from BBC, NPR,
  Al Jazeera, The Verge, Ars Technica, TechCrunch, ESPN, Sky Sports, HLTV,
  Phys.org, ScienceDaily, STAT, Variety,
  The Hollywood Reporter, CNBC and Google News.
- **Rich tiles** — each card shows the article's photo (with a styled source
  monogram when a feed doesn't provide one), the headline and a short excerpt.
  Hover a tile to pause it and click to open the story.
- **Continuous tile cycling** — every tile swaps to the next headline on a
  staggered timer, so the whole board feels alive.
- **No API keys** — everything comes from public RSS feeds, fetched server-side
  (no CORS issues) and cached for 10 minutes per category.
- **Keyboard shortcuts** — `F` toggles fullscreen, `Space` pauses/resumes all
  cycling, `1`–`9` switch categories.
- **Self-healing** — a dead feed never breaks a category; the grid layout adapts
  to any screen size or aspect ratio; the UI polls for fresh news every 5
  minutes and shows connection status.

## Run it

**Option A — GitHub Pages (zero install):** the repo deploys itself to
**https://antonyperez0.github.io/news-dashboard/** — a GitHub Action refetches
all feeds every 15 minutes and publishes static news snapshots. Open it on your
second monitor, press `F` for fullscreen, and let it run.

**Option B — run locally (freshest data, 10-min server cache):**

```bash
npm install
npm start          # → http://localhost:3000
```

Both modes share the same UI: when the local Node API isn't reachable (Pages),
the frontend silently falls back to the static JSON snapshots in `data/`.

Use a custom port:

```bash
PORT=8080 npm start
```

## How it works

```
GitHub Action (every 15 min)                local: npm start
       │ runs scripts/generate-data.js             │ /api/news (10-min cache)
       ▼                                           ▼
dist/data/<category>.json  ──── both served to ────┐
                                                   ▼
                       browser polls every 5 min (API first, static fallback)
```

Photo pipeline: most RSS feeds ship no image, so each story falls back to
scraping its page's `og:image` — Google News gateway links are resolved back
to the real publisher URL first (via `google-news-url-decoder`). Coverage lands
around 85–91%; publishers that block scrapers (WSJ, Reuters…) show a styled
source monogram instead.

- `server.js` — Express server, RSS aggregation, stale-while-revalidate cache
- `lib/news.js` — shared feed fetching/normalizing used by server + static build
- `feeds.js` — the category → feed registry (edit this to add/remove sources)
- `scripts/generate-data.js` — builds `dist/` (public + news snapshots) for Pages
- `.github/workflows/deploy.yml` — refreshes data & deploys to Pages every 15 min
- `public/` — the dashboard UI (vanilla HTML/CSS/JS, no build step)

## Adding your own feeds

Add an entry to `feeds.js`:

```js
technology: {
  label: 'Technology',
  feeds: [
    { url: 'https://example.com/rss.xml', name: 'Example' },
    // aggregate: true strips the " - Outlet" suffix Google News appends
    { url: 'https://news.google.com/rss/…', name: 'Google News', aggregate: true }
  ]
}
```

No rebuild needed — commit and push, and the deploy action picks it up within
15 minutes.

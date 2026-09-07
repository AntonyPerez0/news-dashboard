# News Dashboard

An ambient, fullscreen news dashboard built for a second monitor. Live headlines
arrive as a grid of tiles that continuously fade out and cycle to the next story,
so you can glance over the news without ever touching a scrollbar.

![News Dashboard](docs/screenshot.jpg)

## Features

- **8 categories** — Headlines, World, Business, Technology, Sports, Science,
  Health, Entertainment — aggregated from BBC, NPR, Al Jazeera, The Verge, Ars
  Technica, TechCrunch, ESPN, Sky Sports, Phys.org, ScienceDaily, STAT, Variety,
  The Hollywood Reporter, CNBC and Google News.
- **Continuous tile cycling** — every tile swaps to the next headline on a
  staggered timer, so the whole board feels alive. Hover a tile to pause it and
  click to open the story.
- **No API keys** — everything comes from public RSS feeds, fetched server-side
  (no CORS issues) and cached for 10 minutes per category.
- **Keyboard shortcuts** — `F` toggles fullscreen, `Space` pauses/resumes all
  cycling, `1`–`8` switch categories.
- **Self-healing** — a dead feed never breaks a category; the grid layout adapts
  to any screen size or aspect ratio; the UI polls for fresh news every 5
  minutes and shows connection status.

## Run it

```bash
npm install
npm start          # → http://localhost:3000
```

Open it on your second monitor, press `F` for fullscreen, pick your categories,
and let it run. Your chosen category is remembered in `localStorage`.

Use a custom port:

```bash
PORT=8080 npm start
```

## How it works

```
browser ──polls──▶ /api/news?category=… ──▶ in-memory cache (10 min TTL)
                                              │ cache miss / expired
                                              ▼
                                   parallel RSS fetches (Promise.allSettled)
                                   → dedupe → sort by recency → cap 150 items
```

- `server.js` — Express server, RSS aggregation, stale-while-revalidate cache
- `feeds.js` — the category → feed registry (edit this to add/remove sources)
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

No rebuild needed — restart the server and you're done.

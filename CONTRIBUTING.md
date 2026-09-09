# Contributing

Thanks for considering a contribution! This project is a live, unattended
dashboard — changes should respect its two hard constraints:

1. **Zero API keys, zero server costs** — public RSS only
2. **Weeks of unattended runtime** — every state must be recoverable

## Development setup

```bash
nvm use              # or any Node >= 20
npm install
npm run dev          # vite dev server (proxies API to :3000)
npm run dev:server   # in a second terminal: Express with hot reload
```

## Before opening a PR

```bash
npm run build        # strict typecheck + production build — must pass
npm test             # unit tests — must pass
```

CI runs both on every push. PRs that fail either will not be merged.

## Guidelines

- **TypeScript strict, no `any`** — the data layer is the typed contract
  between server and client; change both sides together
- **Every pipeline function gets tests** — `server/news.js` processes hostile
  third-party data (unescaped XML, doubled title suffixes, malformed meta
  tags). If you touch it, add a test with a real-world-shaped fixture
- **Time-driven, not timer-driven** — tile state must be a pure function of a
  timestamp (see `Tile.tsx`), never a fire-once timer that can die
- **Degrade gracefully** — a dead feed, a scraper-blocked publisher, or a
  throttled tab must never break the whole board
- **No new runtime dependencies** without discussion; the bundle is small on
  purpose

## Adding a feed

Edit [`server/feeds.js`](server/feeds.js) and verify the URL returns XML:

```bash
curl -s -o /dev/null -w '%{http_code} %{content_type}' -L '<feed-url>'
```

`aggregate: true` marks Google News feeds whose titles carry the
` - Outlet` suffix the pipeline strips.

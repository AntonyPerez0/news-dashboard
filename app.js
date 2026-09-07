/* News Dashboard — ambient tile grid for a second monitor. */

const CYCLE_MS = 12000;        // each tile swaps headlines every 12s
const REFRESH_MS = 5 * 60 * 1000; // poll the server every 5 minutes
const STALE_MS = 15 * 60 * 1000;
const PALETTE = ['#4f8cff', '#3fc1a9', '#b07cf5', '#ff9a62', '#5cc8ff', '#f2c94c', '#f472b6', '#7ee787'];

const DEFAULT_CATEGORIES = [
  { key: 'headlines', label: 'Headlines' },
  { key: 'world', label: 'World' },
  { key: 'business', label: 'Business' },
  { key: 'technology', label: 'Technology' },
  { key: 'sports', label: 'Sports' },
  { key: 'science', label: 'Science' },
  { key: 'health', label: 'Health' },
  { key: 'entertainment', label: 'Entertainment' }
];

const els = {
  grid: document.getElementById('grid'),
  cats: document.getElementById('cats'),
  clock: document.getElementById('clock'),
  updated: document.getElementById('updated'),
  updatedLabel: null,
  pauseChip: document.getElementById('pause-chip'),
  toast: document.getElementById('toast'),
  fsBtn: document.getElementById('fs-btn')
};

const state = {
  category: localStorage.getItem('nd.category') || 'headlines',
  categories: DEFAULT_CATEGORIES,
  items: [],
  tiles: [],
  rows: 0,
  cols: 0,
  paused: false,
  allPaused: false,
  lastOk: 0,
  loading: true
};

/* ------------------------------------------------------------------ utils */

function timeAgo(ts) {
  if (!ts) return '';
  const s = Math.max(0, (Date.now() - ts) / 1000);
  if (s < 60) return 'now';
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

function setUpdated(status, ts) {
  els.updated.classList.toggle('stale', status === 'stale');
  els.updated.classList.toggle('error', status === 'error');
  els.updated.title = ts ? `Last successful update: ${new Date(ts).toLocaleString()}` : 'No successful update yet';
  const label =
    status === 'error' ? 'offline — retrying'
    : status === 'stale' ? 'stale'
    : ts ? `updated ${timeAgo(ts)}`
    : 'loading…';
  if (els.updatedLabel) els.updatedLabel.remove();
  els.updatedLabel = document.createElement('span');
  els.updatedLabel.textContent = label;
  els.updated.appendChild(els.updatedLabel);
}

let toastTimer = null;
function toast(msg, sticky = false) {
  els.toast.textContent = msg;
  els.toast.classList.add('show');
  clearTimeout(toastTimer);
  if (!sticky) toastTimer = setTimeout(() => els.toast.classList.remove('show'), 5000);
}
function hideToast() {
  clearTimeout(toastTimer);
  els.toast.classList.remove('show');
}

/* -------------------------------------------------------------- categories */

function renderCategories() {
  els.cats.textContent = '';
  for (const { key, label } of state.categories) {
    const btn = document.createElement('button');
    btn.className = 'cat-btn' + (key === state.category ? ' active' : '');
    btn.textContent = label;
    btn.dataset.key = key;
    btn.addEventListener('click', () => selectCategory(key));
    els.cats.appendChild(btn);
  }
}

async function loadCategories() {
  try {
    const res = await fetch('api/categories');
    if (!res.ok) return;
    const data = await res.json();
    if (Array.isArray(data) && data.length) {
      state.categories = data;
      renderCategories();
    }
  } catch {
    /* keep defaults (GitHub Pages mode) */
  }
}

/**
 * Live Node API first (npm start); when that's absent — e.g. on GitHub
 * Pages — fall back to the static JSON snapshots the deploy action builds.
 */
async function loadNews(cat) {
  try {
    const res = await fetch(`api/news?category=${encodeURIComponent(cat)}`);
    if (res.ok) return await res.json();
  } catch {
    /* no API available */
  }
  const res = await fetch(`data/${encodeURIComponent(cat)}.json`, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function selectCategory(key) {
  if (key === state.category) return;
  state.category = key;
  localStorage.setItem('nd.category', key);
  renderCategories();
  state.items = [];
  state.loading = true;
  resetTiles();
  await refresh();
}

/* ------------------------------------------------------------------- grid */

function computeLayout() {
  const aspect = window.innerWidth / Math.max(1, window.innerHeight);
  const cols = Math.min(6, Math.max(2, Math.round(Math.sqrt(12 * aspect))));
  const rows = Math.min(6, Math.max(2, Math.ceil(12 / cols)));
  return { rows, cols };
}

function createTile(index) {
  const tile = document.createElement('article');
  tile.className = 'tile loading';
  tile.style.setProperty('--accent', PALETTE[index % PALETTE.length]);

  const inner = document.createElement('div');
  inner.className = 'tile-inner';

  const media = document.createElement('div');
  media.className = 'tile-media';
  const img = document.createElement('img');
  img.className = 'tile-img';
  img.alt = '';
  img.loading = 'lazy';
  img.decoding = 'async';
  img.referrerPolicy = 'no-referrer';
  const mono = document.createElement('span');
  mono.className = 'tile-mono';
  media.append(img, mono);

  const body = document.createElement('div');
  body.className = 'tile-body';

  const meta = document.createElement('div');
  meta.className = 'tile-meta';
  const source = document.createElement('div');
  source.className = 'tile-source';
  const time = document.createElement('div');
  time.className = 'tile-time';
  meta.append(source, time);

  const headlineWrap = document.createElement('div');
  headlineWrap.className = 'tile-headline';
  const headline = document.createElement('span');
  headline.textContent = 'Loading live headlines…';
  headlineWrap.appendChild(headline);

  const snippetWrap = document.createElement('div');
  snippetWrap.className = 'tile-snippet';
  const snippet = document.createElement('span');
  snippetWrap.appendChild(snippet);

  body.append(meta, headlineWrap, snippetWrap);
  inner.append(media, body);
  tile.append(inner);

  const t = {
    el: tile, inner, img, mono, source, time, headline, snippet,
    list: [], pointer: 0, timer: null, paused: false, link: '', current: null
  };

  tile.addEventListener('mouseenter', () => { t.paused = true; clearTimeout(t.timer); });
  tile.addEventListener('mouseleave', () => {
    t.paused = false;
    if (!state.allPaused) schedule(t, 1200);
  });
  tile.addEventListener('click', () => {
    if (t.link) window.open(t.link, '_blank', 'noopener');
  });

  return t;
}

function buildGrid() {
  const { rows, cols } = computeLayout();
  if (rows === state.rows && cols === state.cols) return;
  state.rows = rows;
  state.cols = cols;
  const count = rows * cols;

  els.grid.textContent = '';
  els.grid.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;
  els.grid.style.gridTemplateRows = `repeat(${rows}, 1fr)`;

  state.tiles = Array.from({ length: count }, (_, i) => createTile(i));
  state.tiles.forEach((t) => els.grid.appendChild(t.el));
  assignLists();
  startCycling();
}

function resetTiles() {
  for (const t of state.tiles) {
    clearTimeout(t.timer);
    t.timer = null;
    t.list = [];
    t.pointer = 0;
    t.current = null;
    t.link = '';
    t.el.classList.add('loading');
    t.el.classList.remove('no-img', 'no-snippet');
    t.img.classList.remove('loaded');
    t.img.removeAttribute('src');
    t.mono.textContent = '';
    t.source.textContent = '';
    t.time.textContent = '';
    t.headline.textContent = 'Loading live headlines…';
    t.snippet.textContent = '';
    t.inner.classList.remove('swap');
  }
}

function applyContent(t, item) {
  t.current = item;
  t.link = item.link;
  t.el.classList.remove('loading');

  t.source.textContent = item.source;
  t.time.textContent = timeAgo(item.publishedAt);
  t.headline.textContent = item.title;

  if (item.image) {
    t.img.classList.remove('loaded');
    t.img.onload = () => t.img.classList.add('loaded');
    t.img.onerror = () => t.el.classList.add('no-img');
    t.img.src = item.image;
    t.el.classList.remove('no-img');
    t.mono.textContent = '';
  } else {
    t.img.removeAttribute('src');
    t.img.classList.remove('loaded');
    t.el.classList.add('no-img');
    t.mono.textContent = (item.source || '?').trim()[0]?.toUpperCase() || '?';
  }

  if (item.snippet) {
    t.snippet.textContent = item.snippet;
    t.el.classList.remove('no-snippet');
  } else {
    t.snippet.textContent = '';
    t.el.classList.add('no-snippet');
  }
}

/** Tile i owns every tileCount-th item, so all tiles show distinct headlines. */
function assignLists() {
  const n = state.tiles.length;
  state.tiles.forEach((t, i) => {
    t.list = state.items.filter((_, idx) => idx % n === i);
    t.pointer = 0;
    if (t.list.length) {
      applyContent(t, t.list[0]);
      t.pointer = 1;
    }
  });
}

/* ----------------------------------------------------------------- cycling */

function schedule(t, delay) {
  clearTimeout(t.timer);
  if (state.allPaused || t.paused || !t.list.length) return;
  t.timer = setTimeout(() => {
    advance(t);
    schedule(t, CYCLE_MS);
  }, delay);
}

function startCycling() {
  state.tiles.forEach((t, i) => schedule(t, i * (CYCLE_MS / state.tiles.length)));
}

function once(fn) {
  let called = false;
  return (...args) => {
    if (called) return;
    called = true;
    fn(...args);
  };
}

function advance(t) {
  if (!t.list.length) return;
  const item = t.list[t.pointer % t.list.length];
  t.pointer++;

  const swap = once(() => {
    t.inner.classList.add('swap');
    setTimeout(() => {
      applyContent(t, item);
      t.inner.classList.remove('swap');
    }, 260);
  });

  // Preload the next photo so the crossfade never shows a half-loaded image.
  if (item.image) {
    const pre = new Image();
    pre.onload = swap;
    pre.onerror = swap;
    pre.src = item.image;
    setTimeout(swap, 1800);
  } else {
    swap();
  }
}

function setAllPaused(paused) {
  state.allPaused = paused;
  els.pauseChip.classList.toggle('hidden', !paused);
  if (paused) {
    state.tiles.forEach((t) => clearTimeout(t.timer));
  } else {
    state.tiles.forEach((t, i) => schedule(t, (i % 5) * 150));
  }
}

/* ------------------------------------------------------------------ refresh */

async function refresh() {
  const cat = state.category;
  try {
    const data = await loadNews(cat);
    if (cat !== state.category) return; // user switched meanwhile

    state.items = Array.isArray(data.items) ? data.items : [];
    state.lastOk = Date.now();
    state.loading = false;
    setUpdated(state.items.length ? 'ok' : 'error', data.fetchedAt);
    hideToast();

    if (state.items.length) {
      if (!state.tiles.length) buildGrid();
      assignLists();
    } else if (!state.tiles.length) {
      buildGrid();
      toast('No news available for this category yet — retrying automatically.', true);
    }
  } catch (err) {
    if (cat !== state.category) return;
    setUpdated('error', state.lastOk);
    toast(`Could not reach the news server (${err.message}). Retrying…`, !state.items.length);
    if (!state.tiles.length) buildGrid();
  }
}

function refreshVisibleTimes() {
  for (const t of state.tiles) {
    if (t.current) t.time.textContent = timeAgo(t.current.publishedAt);
  }
}

/* ------------------------------------------------------------------- misc */

function tickClock() {
  els.clock.textContent = new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function toggleFullscreen() {
  if (document.fullscreenElement) document.exitFullscreen();
  else document.documentElement.requestFullscreen().catch(() => {});
}

function onKeyDown(e) {
  if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
  const k = e.key.toLowerCase();
  if (k === 'f') toggleFullscreen();
  else if (k === ' ' || e.code === 'Space') {
    e.preventDefault();
    setAllPaused(!state.allPaused);
  } else if (/^[1-8]$/.test(k)) {
    const cat = state.categories[Number(k) - 1];
    if (cat) selectCategory(cat.key);
  }
}

/* -------------------------------------------------------------------- init */

renderCategories();
buildGrid();
tickClock();
setInterval(tickClock, 1000);
setInterval(refreshVisibleTimes, 60_000);
setInterval(refresh, REFRESH_MS);
setInterval(() => {
  if (state.lastOk && Date.now() - state.lastOk > STALE_MS) setUpdated('stale', state.lastOk);
}, 30_000);

document.addEventListener('visibilitychange', () => {
  if (!document.hidden && state.lastOk && Date.now() - state.lastOk > REFRESH_MS) refresh();
});
document.addEventListener('keydown', onKeyDown);
document.addEventListener('fullscreenchange', () => {
  els.fsBtn.style.opacity = document.fullscreenElement ? '1' : '';
});
els.fsBtn.addEventListener('click', toggleFullscreen);
window.addEventListener('resize', () => {
  clearTimeout(state._resizeTimer);
  state._resizeTimer = setTimeout(buildGrid, 150);
});

loadCategories();
refresh();

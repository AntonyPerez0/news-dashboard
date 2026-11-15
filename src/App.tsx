import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { DEFAULT_CATEGORIES, loadCategories } from './api';
import { Header } from './components/Header';
import { OfflineBanner } from './components/OfflineBanner';
import { SettingsDrawer } from './components/SettingsDrawer';
import { TileGrid } from './components/TileGrid';
import { Toast } from './components/Toast';
import { useClock } from './hooks/useClock';
import { useNews } from './hooks/useNews';
import { useWakeLock } from './hooks/useWakeLock';
import { categoryFromUrl, DEFAULT_SETTINGS, loadSettings, saveSettings, settingsFromUrl } from './settings';
import { applyTheme, resolveTheme } from './theme';
import type { Settings } from './types';
import { nextCategory } from './utils';

// The number row, left to right: one key per category tab.
const CATEGORY_KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0', '-', '='];

export default function App() {
  const [categories, setCategories] = useState(DEFAULT_CATEGORIES);
  const [categoriesLoaded, setCategoriesLoaded] = useState(false);
  const [category, setCategory] = useState(
    () => categoryFromUrl(window.location.search) || localStorage.getItem('nd.category') || 'headlines'
  );
  const [allPaused, setAllPaused] = useState(false);
  const [saved, setSaved] = useState<Settings>(() => loadSettings());
  // Settings pinned by the URL (?speed=30&rotate=5…) win over the saved ones
  // until the user changes that setting by hand; they are never saved.
  const [pinned, setPinned] = useState<Partial<Settings>>(() => settingsFromUrl(window.location.search));
  const settings = useMemo<Settings>(() => ({ ...saved, ...pinned }), [saved, pinned]);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [timeTick, setTimeTick] = useState(0);
  const { items, status, fetchedAt, error } = useNews(category);
  const { time, date } = useClock();
  useWakeLock(settings.keepAwake);

  useEffect(() => {
    loadCategories().then((list) => {
      setCategories(list);
      setCategoriesLoaded(true);
    });
  }, []);

  // A category from the URL or a previous visit may not exist on this server.
  useEffect(() => {
    const first = categories[0];
    if (categoriesLoaded && first && !categories.some((cat) => cat.key === category)) {
      setCategory(first.key);
    }
  }, [categoriesLoaded, categories, category]);

  // Category rotation. Timestamp-driven like the tiles: the next switch is a
  // moment in time checked on a heartbeat, so a throttled tab catches up
  // instead of stalling. A manual category change, a pause or a visit to
  // the settings starts a full interval afresh.
  const rotateAt = useRef(0);
  const rotateMs = settings.rotateMin * 60_000;
  useEffect(() => {
    rotateAt.current = rotateMs > 0 ? Date.now() + rotateMs : 0;
  }, [rotateMs, category, allPaused, settingsOpen]);
  useEffect(() => {
    if (!rotateMs || allPaused || settingsOpen) return;
    const id = setInterval(() => {
      if (!rotateAt.current || Date.now() < rotateAt.current) return;
      if (document.querySelector('.tile:hover')) return; // someone is reading
      rotateAt.current = Date.now() + rotateMs; // before the render, so one due time means one switch
      setCategory((current) => nextCategory(categories, current));
    }, 1000);
    return () => clearInterval(id);
  }, [rotateMs, allPaused, settingsOpen, categories]);

  useEffect(() => {
    const id = setInterval(() => setTimeTick((t) => t + 1), 60_000);
    return () => clearInterval(id);
  }, []);

  // Day/night theming: "auto" follows the clock (light 07:00–19:00 local),
  // explicit choices pin the theme. Re-evaluated every minute while auto.
  // The index.html pre-paint script applies the saved theme before first
  // paint; this keeps it live (clock crossing the daytime window, setting
  // changes).
  useEffect(() => {
    const apply = () => applyTheme(resolveTheme(settings.theme));
    apply();
    if (settings.theme !== 'auto') return;
    const id = setInterval(apply, 60_000);
    return () => clearInterval(id);
  }, [settings.theme]);

  const changeSettings = useCallback((patch: Partial<Settings>) => {
    setSaved((prev) => {
      const next = { ...prev, ...patch };
      saveSettings(next);
      return next;
    });
    setPinned((prev) => {
      const next = { ...prev };
      for (const key of Object.keys(patch) as (keyof Settings)[]) delete next[key];
      return next;
    });
  }, []);

  const resetSettings = useCallback(() => {
    setSaved({ ...DEFAULT_SETTINGS });
    saveSettings({ ...DEFAULT_SETTINGS });
    setPinned({});
  }, []);

  const selectCategory = useCallback((key: string) => {
    setCategory(key);
    localStorage.setItem('nd.category', key);
  }, []);

  const toggleFullscreen = useCallback(() => {
    if (document.fullscreenElement) {
      document.exitFullscreen();
    } else {
      document.documentElement.requestFullscreen().catch(() => {});
    }
  }, []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();
      // While the settings are open the keyboard belongs to them: Space and
      // Enter work their controls, only Escape reaches the dashboard.
      if (settingsOpen) {
        if (key === 'escape') setSettingsOpen(false);
        return;
      }
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (key === 'f') {
        toggleFullscreen();
      } else if (key === ' ' || e.code === 'Space') {
        e.preventDefault();
        setAllPaused((p) => !p);
      } else if (CATEGORY_KEYS.includes(key)) {
        const cat = categories[CATEGORY_KEYS.indexOf(key)];
        if (cat) selectCategory(cat.key);
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [categories, selectCategory, settingsOpen, toggleFullscreen]);

  const toastMessage = error
    ? items.length
      ? `News update failed (${error}) — retrying…`
      : `Could not reach the news server (${error}). Retrying…`
    : '';

  return (
    <>
      <OfflineBanner />
      <Header
        categories={categories}
        active={category}
        onSelect={selectCategory}
        status={status}
        fetchedAt={fetchedAt}
        paused={allPaused}
        time={time}
        date={date}
        onToggleFullscreen={toggleFullscreen}
        onOpenSettings={() => setSettingsOpen(true)}
      />
      <TileGrid
        category={category}
        items={items}
        allPaused={allPaused}
        timeTick={timeTick}
        settings={settings}
      />
      <Toast message={toastMessage} sticky={!items.length} />
      <SettingsDrawer
        open={settingsOpen}
        settings={settings}
        onChange={changeSettings}
        onReset={resetSettings}
        onClose={() => setSettingsOpen(false)}
      />
    </>
  );
}

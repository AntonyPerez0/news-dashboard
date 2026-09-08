import { useCallback, useEffect, useState } from 'react';
import { DEFAULT_CATEGORIES, loadCategories } from './api';
import { Header } from './components/Header';
import { SettingsDrawer } from './components/SettingsDrawer';
import { TileGrid } from './components/TileGrid';
import { Toast } from './components/Toast';
import { useClock } from './hooks/useClock';
import { useNews } from './hooks/useNews';
import { DEFAULT_SETTINGS, loadSettings, saveSettings } from './settings';
import type { Settings } from './types';

export default function App() {
  const [categories, setCategories] = useState(DEFAULT_CATEGORIES);
  const [category, setCategory] = useState(
    () => localStorage.getItem('nd.category') || 'headlines'
  );
  const [allPaused, setAllPaused] = useState(false);
  const [settings, setSettings] = useState<Settings>(() => loadSettings());
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [timeTick, setTimeTick] = useState(0);
  const { items, status, fetchedAt, error } = useNews(category);
  const { time, date } = useClock();

  useEffect(() => {
    loadCategories().then(setCategories);
  }, []);

  useEffect(() => {
    const id = setInterval(() => setTimeTick((t) => t + 1), 60_000);
    return () => clearInterval(id);
  }, []);

  const changeSettings = useCallback((patch: Partial<Settings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...patch };
      saveSettings(next);
      return next;
    });
  }, []);

  const resetSettings = useCallback(() => {
    setSettings({ ...DEFAULT_SETTINGS });
    saveSettings({ ...DEFAULT_SETTINGS });
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
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      const key = e.key.toLowerCase();
      if (key === 'escape') {
        setSettingsOpen(false);
      } else if (key === 'f') {
        toggleFullscreen();
      } else if (key === ' ' || e.code === 'Space') {
        e.preventDefault();
        setAllPaused((p) => !p);
      } else if (/^[0-9]$/.test(key)) {
        const index = key === '0' ? 9 : Number(key) - 1;
        const cat = categories[index];
        if (cat) selectCategory(cat.key);
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [categories, selectCategory, toggleFullscreen]);

  const toastMessage = error
    ? items.length
      ? `News update failed (${error}) — retrying…`
      : `Could not reach the news server (${error}). Retrying…`
    : '';

  return (
    <>
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

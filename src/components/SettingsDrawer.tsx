import { useEffect, useRef } from 'react';
import { WAKE_LOCK_SUPPORTED } from '../hooks/useWakeLock';
import { CYCLE_OPTIONS, ROTATE_OPTIONS } from '../settings';
import { APP_VERSION, BUILD_DATE, LIVE_URL, REPO_URL } from '../version';
import type { Settings, ThemeSetting } from '../types';

const THEME_OPTIONS: { label: string; value: ThemeSetting }[] = [
  { label: 'Auto', value: 'auto' },
  { label: 'Light', value: 'light' },
  { label: 'Dark', value: 'dark' }
];

interface SettingsDrawerProps {
  open: boolean;
  settings: Settings;
  onChange: (patch: Partial<Settings>) => void;
  onReset: () => void;
  onClose: () => void;
}

const FOCUSABLE = 'button:not([disabled]), a[href], input:not([disabled])';

export function SettingsDrawer({ open, settings, onChange, onReset, onClose }: SettingsDrawerProps) {
  const drawerRef = useRef<HTMLElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const returnFocusTo = useRef<HTMLElement | null>(null);

  // A modal dialog: focus moves in when it opens and goes back to whatever
  // opened it when it closes.
  useEffect(() => {
    if (!open) return;
    returnFocusTo.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    closeRef.current?.focus();
    return () => returnFocusTo.current?.focus();
  }, [open]);

  // ...and Tab stays inside it, wrapping at either end.
  const keepFocusInside = (e: React.KeyboardEvent) => {
    if (e.key !== 'Tab') return;
    const stops = Array.from(drawerRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? []);
    const first = stops[0];
    const last = stops[stops.length - 1];
    if (!first || !last) return;
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  };

  return (
    <>
      <div
        className={open ? 'drawer-backdrop show' : 'drawer-backdrop'}
        onClick={onClose}
        aria-hidden="true"
      />
      <aside
        className={open ? 'drawer open' : 'drawer'}
        role="dialog"
        aria-modal="true"
        aria-label="Dashboard settings"
        aria-hidden={!open}
        ref={drawerRef}
        onKeyDown={keepFocusInside}
      >
        <div className="drawer-head">
          <h2>SETTINGS</h2>
          <button className="drawer-close" aria-label="Close settings" onClick={onClose} ref={closeRef}>
            <svg width="14" height="14" viewBox="0 0 14 14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
              <path d="M2 2l10 10M12 2L2 12" />
            </svg>
          </button>
        </div>

        <section>
          <h3>Cycle speed</h3>
          <div className="seg" role="radiogroup" aria-label="Cycle speed">
            {CYCLE_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                role="radio"
                aria-checked={settings.cycleMs === opt.value}
                className={settings.cycleMs === opt.value ? 'active' : ''}
                onClick={() => onChange({ cycleMs: opt.value })}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </section>

        <section>
          <h3>Rotate categories</h3>
          <div className="seg" role="radiogroup" aria-label="Rotate categories">
            {ROTATE_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                role="radio"
                aria-checked={settings.rotateMin === opt.value}
                className={settings.rotateMin === opt.value ? 'active' : ''}
                onClick={() => onChange({ rotateMin: opt.value })}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </section>

        <section>
          <h3>Theme</h3>
          <div className="seg" role="radiogroup" aria-label="Theme">
            {THEME_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                role="radio"
                aria-checked={settings.theme === opt.value}
                className={settings.theme === opt.value ? 'active' : ''}
                onClick={() => onChange({ theme: opt.value })}
              >
                {opt.label}
                {opt.value === 'auto' && <span className="seg-note">7–19h</span>}
              </button>
            ))}
          </div>
        </section>

        <section>
          <h3>Tile content</h3>
          <div className="switch-row">
            <span>Show excerpts</span>
            <label className="switch">
              <input
                type="checkbox"
                checked={settings.showSnippets}
                onChange={(e) => onChange({ showSnippets: e.target.checked })}
              />
              <span className="slider" />
            </label>
          </div>
          <div className="switch-row">
            <span>Show photos</span>
            <label className="switch">
              <input
                type="checkbox"
                checked={settings.showImages}
                onChange={(e) => onChange({ showImages: e.target.checked })}
              />
              <span className="slider" />
            </label>
          </div>
          <div className="switch-row">
            <span>
              Only stories with a photo
              <span className="seg-note">some publishers block photo lookups</span>
            </span>
            <label className="switch">
              <input
                type="checkbox"
                checked={settings.photosOnly && settings.showImages}
                disabled={!settings.showImages}
                onChange={(e) => onChange({ photosOnly: e.target.checked })}
              />
              <span className="slider" />
            </label>
          </div>
        </section>

        <section>
          <h3>Display</h3>
          <div className="switch-row">
            <span>
              Keep screen awake
              {!WAKE_LOCK_SUPPORTED && <span className="seg-note">not available in this browser</span>}
            </span>
            <label className="switch">
              <input
                type="checkbox"
                checked={settings.keepAwake && WAKE_LOCK_SUPPORTED}
                disabled={!WAKE_LOCK_SUPPORTED}
                onChange={(e) => onChange({ keepAwake: e.target.checked })}
              />
              <span className="slider" />
            </label>
          </div>
        </section>

        <section>
          <h3>Shortcuts</h3>
          <ul className="shortcut-list">
            <li><kbd>F</kbd> fullscreen</li>
            <li><kbd>Space</kbd> pause / resume</li>
            <li><kbd>1</kbd>–<kbd>9</kbd>, <kbd>0</kbd>, <kbd>-</kbd> switch category</li>
            <li><kbd>Enter</kbd> open focused story</li>
            <li><kbd>Esc</kbd> close settings</li>
          </ul>
        </section>

        <section className="about">
          <h3>About</h3>
          <div className="about-rows">
            <div className="about-row">
              <span>Version</span>
              <code>v{APP_VERSION}</code>
            </div>
            <div className="about-row">
              <span>Build</span>
              <code>{BUILD_DATE}</code>
            </div>
            <div className="about-row">
              <span>Privacy</span>
              <span className="about-note">no analytics, no cookies</span>
            </div>
            <div className="about-row">
              <span>Install</span>
              <span className="about-note">
                via your browser's install option
              </span>
            </div>
          </div>
          <p className="about-fine">
            Photos load from the publishers' own servers and source icons from
            Google's icon service, so those see your requests.
          </p>
          <div className="about-links">
            <a href={REPO_URL} target="_blank" rel="noopener noreferrer">
              Source
            </a>
            <a href={LIVE_URL} target="_blank" rel="noopener noreferrer">
              Live site
            </a>
          </div>
        </section>

        <button className="reset-btn" onClick={onReset}>
          Reset to defaults
        </button>
      </aside>
    </>
  );
}

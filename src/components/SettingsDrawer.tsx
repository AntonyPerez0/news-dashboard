import { CYCLE_OPTIONS } from '../settings';
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

export function SettingsDrawer({ open, settings, onChange, onReset, onClose }: SettingsDrawerProps) {
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
      >
        <div className="drawer-head">
          <h2>SETTINGS</h2>
          <button className="drawer-close" aria-label="Close settings" onClick={onClose}>
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
        </section>

        <section>
          <h3>Shortcuts</h3>
          <ul className="shortcut-list">
            <li><kbd>F</kbd> fullscreen</li>
            <li><kbd>Space</kbd> pause / resume</li>
            <li><kbd>1</kbd>–<kbd>9</kbd>, <kbd>0</kbd> switch category</li>
            <li><kbd>Enter</kbd> open focused story</li>
          </ul>
        </section>

        <button className="reset-btn" onClick={onReset}>
          Reset to defaults
        </button>
      </aside>
    </>
  );
}

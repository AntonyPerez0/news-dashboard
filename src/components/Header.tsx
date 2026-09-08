import { timeAgo } from '../utils';
import type { Category, FeedStatus } from '../types';

interface HeaderProps {
  categories: Category[];
  active: string;
  onSelect: (key: string) => void;
  status: FeedStatus;
  fetchedAt: number;
  paused: boolean;
  time: string;
  date: string;
  onToggleFullscreen: () => void;
}

const STATUS_LABEL: Record<FeedStatus, string> = {
  loading: 'loading…',
  ok: '',
  stale: 'stale',
  error: 'offline — retrying'
};

export function Header({
  categories, active, onSelect, status, fetchedAt, paused, time, date, onToggleFullscreen
}: HeaderProps) {
  const label = status === 'ok' && fetchedAt ? `updated ${timeAgo(fetchedAt)}` : STATUS_LABEL[status];

  return (
    <header>
      <div className="brand">
        <svg width="18" height="18" viewBox="0 0 16 16" aria-hidden="true">
          <rect width="7" height="7" rx="1.5" fill="#4f8cff" />
          <rect x="9" width="7" height="7" rx="1.5" fill="#3fc1a9" />
          <rect y="9" width="7" height="7" rx="1.5" fill="#b07cf5" />
          <rect x="9" y="9" width="7" height="7" rx="1.5" fill="#ff9a62" />
        </svg>
        <span>NEWS</span>
        <b>DASH</b>
      </div>

      <nav id="cats" className="cats" aria-label="News categories">
        {categories.map((cat) => (
          <button
            key={cat.key}
            className={cat.key === active ? 'cat-btn active' : 'cat-btn'}
            onClick={() => onSelect(cat.key)}
          >
            {cat.label}
          </button>
        ))}
      </nav>

      <div className="right">
        <span id="pause-chip" className={paused ? 'chip' : 'chip hidden'}>
          PAUSED
        </span>
        <span id="updated" className={status} title="Last successful update">
          <span>{label}</span>
        </span>
        <span id="date">{date}</span>
        <span id="clock">{time}</span>
        <button id="fs-btn" title="Toggle fullscreen (F)" aria-label="Toggle fullscreen" onClick={onToggleFullscreen}>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
            <path d="M2 6V2h4M14 6V2h-4M2 10v4h4M14 10v4h-4" />
          </svg>
        </button>
      </div>
    </header>
  );
}

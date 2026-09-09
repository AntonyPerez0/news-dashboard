import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
  reloadIn: number;
  /** Auto-reload paused after too many attempts (deterministic error). */
  paused: boolean;
}

const RELOAD_SECONDS = 8;
const RECOVERY_KEY = 'nd.recoveries';
const RECOVERY_WINDOW_MS = 60_000;
const MAX_RECOVERIES = 3;

/** Recovery attempts within the window, aging out after it passes. A long
 *  stable session naturally resets the count. */
function recentRecoveries(): number {
  try {
    const raw = JSON.parse(sessionStorage.getItem(RECOVERY_KEY) || '{}') as {
      count?: number;
      at?: number;
    };
    if (!raw.count || !raw.at || Date.now() - raw.at > RECOVERY_WINDOW_MS) return 0;
    return raw.count;
  } catch {
    return 0;
  }
}

function noteRecovery(): number {
  const count = recentRecoveries() + 1;
  sessionStorage.setItem(RECOVERY_KEY, JSON.stringify({ count, at: Date.now() }));
  return count;
}

/** Catches render-time errors and shows a branded recovery screen instead of
 *  a blank page. Auto-reloads after a short countdown so an unattended
 *  second-monitor tab heals itself — but never in a loop: after
 *  MAX_RECOVERIES attempts within a minute (a deterministic error), it stops
 *  and waits for a manual reload. */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null, reloadIn: RELOAD_SECONDS, paused: false };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[news-dashboard] recovered from render error:', error, info.componentStack);
  }

  componentDidUpdate(_prev: Props, prevState: State) {
    if (!prevState.error && this.state.error) this.startCountdown();
  }

  startCountdown() {
    if (recentRecoveries() >= MAX_RECOVERIES) {
      this.setState({ paused: true });
      return;
    }
    noteRecovery();
    window.clearInterval(this.timer);
    this.setState({ reloadIn: RELOAD_SECONDS });
    this.timer = window.setInterval(() => {
      const next = this.state.reloadIn - 1;
      if (next <= 0) {
        window.location.reload();
        return;
      }
      this.setState({ reloadIn: next });
    }, 1000);
  }

  manualReload() {
    sessionStorage.removeItem(RECOVERY_KEY);
    window.location.reload();
  }

  timer = 0;

  componentWillUnmount() {
    window.clearInterval(this.timer);
  }

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <div className="crash-screen" role="alert">
        <svg width="26" height="26" viewBox="0 0 16 16" aria-hidden="true">
          <rect width="7" height="7" rx="1.5" fill="#4f8cff" />
          <rect x="9" width="7" height="7" rx="1.5" fill="#3fc1a9" />
          <rect y="9" width="7" height="7" rx="1.5" fill="#b07cf5" />
          <rect x="9" y="9" width="7" height="7" rx="1.5" fill="#ff9a62" />
        </svg>
        <h1>Something went wrong</h1>
        {this.state.paused ? (
          <>
            <p>
              Recovery paused after repeated attempts. Reload manually once the
              news server is reachable.
            </p>
            <button onClick={this.manualReload}>Reload now</button>
          </>
        ) : (
          <>
            <p>
              The dashboard hit an unexpected error and will reload in{' '}
              {this.state.reloadIn}s.
            </p>
            <button onClick={this.manualReload}>Reload now</button>
          </>
        )}
      </div>
    );
  }
}

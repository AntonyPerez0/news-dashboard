import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
  reloadIn: number;
}

const RELOAD_SECONDS = 8;

/** Catches render-time errors and shows a branded recovery screen instead of
 *  a blank page. Auto-reloads after a short countdown so an unattended
 *  second-monitor tab heals itself. */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null, reloadIn: RELOAD_SECONDS };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[news-dashboard] recovered from render error:', error, info.componentStack);
  }

  componentDidMount() {
    this.startCountdown();
  }

  componentDidUpdate(_prev: Props, prevState: State) {
    if (!prevState.error && this.state.error) this.startCountdown();
  }

  startCountdown() {
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
        <p>The dashboard hit an unexpected error and will reload in {this.state.reloadIn}s.</p>
        <button onClick={() => window.location.reload()}>Reload now</button>
      </div>
    );
  }
}

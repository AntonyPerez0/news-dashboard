import { useEffect, useState } from 'react';

/** Tracks browser connectivity for the offline banner. */
export function useOnline(): boolean {
  const [online, setOnline] = useState(() => navigator.onLine);

  useEffect(() => {
    const goOffline = () => setOnline(false);
    const goOnline = () => setOnline(true);
    window.addEventListener('offline', goOffline);
    window.addEventListener('online', goOnline);
    return () => {
      window.removeEventListener('offline', goOffline);
      window.removeEventListener('online', goOnline);
    };
  }, []);

  return online;
}

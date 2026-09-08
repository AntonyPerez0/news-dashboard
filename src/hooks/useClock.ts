import { useEffect, useState } from 'react';

interface Clock {
  time: string;
  date: string;
}

export function useClock(): Clock {
  const [clock, setClock] = useState<Clock>(() => format(new Date()));
  useEffect(() => {
    const id = setInterval(() => setClock(format(new Date())), 1000);
    return () => clearInterval(id);
  }, []);
  return clock;
}

function format(now: Date): Clock {
  return {
    time: now.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }),
    date: now.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })
  };
}

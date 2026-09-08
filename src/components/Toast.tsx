import { useEffect, useState } from 'react';

interface ToastProps {
  message: string;
  sticky: boolean;
}

export function Toast({ message, sticky }: ToastProps) {
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    setHidden(false);
    if (!message || sticky) return;
    const id = window.setTimeout(() => setHidden(true), 5000);
    return () => window.clearTimeout(id);
  }, [message, sticky]);

  const show = message !== '' && !hidden;
  return (
    <div id="toast" role="status" className={show ? 'show' : ''}>
      {message}
    </div>
  );
}

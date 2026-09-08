import { useEffect, useState } from 'react';

export interface Viewport {
  width: number;
  height: number;
}

/** Window size with a short debounce so resizes rebuild the grid calmly. */
export function useWindowSize(): Viewport {
  const [size, setSize] = useState<Viewport>(() => ({
    width: window.innerWidth,
    height: window.innerHeight
  }));

  useEffect(() => {
    let timer = 0;
    const onResize = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        setSize({ width: window.innerWidth, height: window.innerHeight });
      }, 150);
    };
    window.addEventListener('resize', onResize);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('resize', onResize);
    };
  }, []);

  return size;
}

import { useEffect, useState } from 'react';

export function useMedia(query: string): boolean {
  const get = () => (typeof window !== 'undefined' ? window.matchMedia(query).matches : true);
  const [m, setM] = useState(get);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const on = () => setM(mq.matches);
    on();
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, [query]);
  return m;
}

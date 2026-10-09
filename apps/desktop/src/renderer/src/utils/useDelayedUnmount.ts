import { useEffect, useState } from 'react';

/** True while `open`, and for `ms` after it turns false, so a closing animation can play before unmount. */
export function useDelayedUnmount(open: boolean, ms: number): boolean {
  const [mounted, setMounted] = useState(open);
  useEffect(() => {
    if (open) {
      setMounted(true);
      return;
    }
    const t = setTimeout(() => setMounted(false), ms);
    return () => clearTimeout(t);
  }, [open, ms]);
  return open || mounted;
}

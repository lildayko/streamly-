"use client";
import { useEffect, useRef } from "react";

export function useInfiniteScroll(cursor: string, loading: boolean, enabled: boolean, load: () => void) {
  const target = useRef<HTMLDivElement>(null);
  const callback = useRef(load);
  callback.current = load;
  useEffect(() => {
    const element = target.current;
    if (!element || !cursor || loading || !enabled) return;
    let fired = false;
    const observer = new IntersectionObserver(entries => {
      if (!fired && entries.some(entry => entry.isIntersecting)) {
        fired = true;
        callback.current();
      }
    }, { rootMargin: "250px" });
    observer.observe(element);
    return () => observer.disconnect();
  }, [cursor, loading, enabled]);
  return target;
}

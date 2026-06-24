import { useEffect, useRef } from 'react';

/**
 * Calls `onIntersect` when the returned ref's element scrolls into view.
 * Used to trigger loading the next page when the user nears the bottom
 * of the list, instead of a manual "Load more" click or a scroll-position
 * calculation.
 */
export function useInfiniteScrollTrigger(onIntersect: () => void, enabled: boolean) {
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const node = sentinelRef.current;
    if (!node || !enabled) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) onIntersect();
      },
      { rootMargin: '400px' } // start loading before the sentinel is actually on screen
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [onIntersect, enabled]);

  return sentinelRef;
}

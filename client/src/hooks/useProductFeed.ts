import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchProducts } from '../api/products';
import type { Product } from '../types/api';

const PAGE_SIZE = 30;

interface UseProductFeedResult {
  products: Product[];
  loading: boolean;
  error: string | null;
  hasMore: boolean;
  loadMore: () => void;
}

/**
 * Drives the infinite-scroll product feed. Owns the cursor and the
 * accumulated list of products; the component just renders what this
 * returns and calls loadMore() when the user scrolls near the bottom.
 *
 * Resets entirely whenever `category` changes, since switching filters
 * means starting a new cursor sequence from the top — the old cursor was
 * positioned within the previous (possibly unfiltered) result set and
 * isn't meaningful for a different filter.
 */
export function useProductFeed(category: string | null): UseProductFeedResult {
  const [products, setProducts] = useState<Product[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Guards against double-fetching the same page if loadMore() fires
  // again (e.g. a fast double-scroll) before the previous request
  // resolves.
  const inFlight = useRef(false);

  const loadMore = useCallback(() => {
    if (inFlight.current || !hasMore) return;
    inFlight.current = true;
    setLoading(true);

    fetchProducts({ limit: PAGE_SIZE, cursor, category })
      .then((res) => {
        setProducts((prev) => [...prev, ...res.data]);
        setCursor(res.pageInfo.nextCursor);
        setHasMore(res.pageInfo.hasMore);
        setError(null);
      })
      .catch((err: Error) => setError(err.message))
      .finally(() => {
        setLoading(false);
        inFlight.current = false;
      });
  }, [cursor, hasMore, category]);

  // Reset and load the first page whenever the category filter changes.
  useEffect(() => {
    setProducts([]);
    setCursor(null);
    setHasMore(true);
    setError(null);
    inFlight.current = false;

    fetchProducts({ limit: PAGE_SIZE, cursor: null, category })
      .then((res) => {
        setProducts(res.data);
        setCursor(res.pageInfo.nextCursor);
        setHasMore(res.pageInfo.hasMore);
      })
      .catch((err: Error) => setError(err.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [category]);

  return { products, loading, error, hasMore, loadMore };
}

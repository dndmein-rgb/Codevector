import type { Product } from '../types/api';
import { ProductRow } from './ProductRow';

interface ProductListProps {
  products: Product[];
  loading: boolean;
  error: string | null;
  hasMore: boolean;
  sentinelRef: React.RefObject<HTMLDivElement | null>;
}

export function ProductList({ products, loading, error, hasMore, sentinelRef }: ProductListProps) {
  return (
    <div className="ledger">
      <div className="row row--header" aria-hidden="true">
        <span className="row__id">No.</span>
        <span className="row__name">Product</span>
        <span className="row__category">Category</span>
        <span className="row__price">Price</span>
      </div>

      <ul className="row-list">
        {products.map((product) => (
          <ProductRow key={product.id} product={product} />
        ))}
      </ul>

      <div ref={sentinelRef} className="feed-status">
        {error && <span className="feed-status__error">Couldn&rsquo;t load more — {error}</span>}
        {!error && loading && <span>Loading more…</span>}
        {!error && !loading && !hasMore && products.length > 0 && (
          <span>End of catalog — {products.length} shown.</span>
        )}
      </div>
    </div>
  );
}

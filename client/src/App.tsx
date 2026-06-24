import { useEffect, useState } from 'react';
import { fetchCategories } from './api/products';
import { CategoryFilter } from './components/CategoryFilter';
import { ProductList } from './components/ProductList';
import { useInfiniteScrollTrigger } from './hooks/useInfiniteScrollTrigger';
import { useProductFeed } from './hooks/useProductFeed';
import './App.css';

export default function App() {
  const [categories, setCategories] = useState<string[]>([]);
  const [activeCategory, setActiveCategory] = useState<string | null>(null);

  const { products, loading, error, hasMore, loadMore } = useProductFeed(activeCategory);
  const sentinelRef = useInfiniteScrollTrigger(loadMore, hasMore && !loading);

  useEffect(() => {
    fetchCategories()
      .then((res) => setCategories(res.categories))
      .catch(() => setCategories([]));
  }, []);

  return (
    <div className="page">
      <header className="masthead">
        <div className="masthead__title">
          <span className="masthead__mark">02</span>
          <div>
            <h1>Product Manifest</h1>
            <p className="masthead__subtitle">Newest entries first &middot; live catalog</p>
          </div>
        </div>
        <CategoryFilter categories={categories} active={activeCategory} onSelect={setActiveCategory} />
      </header>

      <main>
        <ProductList
          products={products}
          loading={loading}
          error={error}
          hasMore={hasMore}
          sentinelRef={sentinelRef}
        />
      </main>
    </div>
  );
}

import type { Product } from '../types/api';

function formatPrice(price: string): string {
  return `$${Number(price).toFixed(2)}`;
}

function formatId(id: string): string {
  return `#${id.padStart(6, '0')}`;
}

export function ProductRow({ product }: { product: Product }) {
  return (
    <li className="row">
      <span className="row__id">{formatId(product.id)}</span>
      <span className="row__name">{product.name}</span>
      <span className="row__category">{product.category}</span>
      <span className="row__price">{formatPrice(product.price)}</span>
    </li>
  );
}

import type { CategoriesResponse, ProductsPageResponse } from '../types/api';

// In production this is set via VITE_API_BASE_URL at build time to point
// at the deployed backend; empty string means same-origin (local dev with
// Vite's proxy, see vite.config.ts).
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? '';

export interface FetchProductsParams {
  limit: number;
  cursor: string | null;
  category: string | null;
}

async function getJson<T>(path: string, params: Record<string, string | null>): Promise<T> {
  const url = new URL(path, API_BASE_URL || window.location.origin);
  for (const [key, value] of Object.entries(params)) {
    if (value !== null && value !== '') url.searchParams.set(key, value);
  }

  const res = await fetch(url.toString());
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `Request failed with status ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export function fetchProducts(params: FetchProductsParams): Promise<ProductsPageResponse> {
  return getJson<ProductsPageResponse>('/products', {
    limit: String(params.limit),
    cursor: params.cursor,
    category: params.category,
  });
}

export function fetchCategories(): Promise<CategoriesResponse> {
  return getJson<CategoriesResponse>('/categories', {});
}

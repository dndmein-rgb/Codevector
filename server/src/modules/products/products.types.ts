/** A row as stored in and returned from the database. */
export interface Product {
  id: string; // BIGSERIAL — returned as string by `pg` since it can exceed JS's safe integer range
  name: string;
  category: string;
  price: string; // NUMERIC comes back as string from `pg` to avoid float rounding surprises
  created_at: Date;
  updated_at: Date;
}

/** Validated, normalized input for a "list products" request. */
export interface ListProductsQuery {
  limit: number;
  cursor: string | null;
  category: string | null;
}

export interface PageInfo {
  nextCursor: string | null;
  hasMore: boolean;
  count: number;
}

export interface ListProductsResult {
  data: Product[];
  pageInfo: PageInfo;
}

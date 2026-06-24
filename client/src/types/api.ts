export interface Product {
  id: string;
  name: string;
  category: string;
  price: string;
  created_at: string;
  updated_at: string;
}

export interface PageInfo {
  nextCursor: string | null;
  hasMore: boolean;
  count: number;
}

export interface ProductsPageResponse {
  data: Product[];
  pageInfo: PageInfo;
}

export interface CategoriesResponse {
  categories: string[];
}

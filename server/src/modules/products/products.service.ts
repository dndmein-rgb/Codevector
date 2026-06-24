import { z } from 'zod';
import {
  countProducts,
  findDistinctCategories,
  findProductsPage,
} from './products.repository.js';
import type { ListProductsResult } from './products.types.js';

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

/**
 * Raw query params come in as strings (or undefined) from Express. This
 * schema both validates and coerces them, and is the single source of
 * truth for what's a legal request — the controller doesn't need to know
 * the rules, just that this might throw.
 */
const listProductsInputSchema = z.object({
  limit: z.coerce.number().int().positive().max(MAX_LIMIT).optional().default(DEFAULT_LIMIT),
  // The cursor is an `id`, i.e. a positive integer, but arrives as a
  // string and is kept as a string end-to-end (it's passed straight
  // through to a parameterized SQL query) — BIGSERIAL can exceed JS's
  // safe integer range, so we validate it as a numeric string rather than
  // coercing to `number`.
  cursor: z
    .string()
    .regex(/^\d+$/, 'cursor must be a positive integer id')
    .optional(),
  category: z.string().trim().min(1).optional(),
});

/**
 * What the controller actually has on hand: raw query string values (or
 * undefined if the param was omitted). Defined explicitly rather than
 * derived from the Zod schema's inferred input type, because
 * `z.coerce.number()` widens its input type to `unknown`, which would
 * let bugs like "passing a number here by accident" slip past the
 * compiler instead of being caught at the boundary where they're
 * cheapest to fix.
 */
export interface ListProductsInput {
  limit?: string;
  cursor?: string;
  category?: string;
}

export class InvalidQueryError extends Error {
  constructor(public readonly issues: string[]) {
    super(`Invalid query: ${issues.join(', ')}`);
  }
}

function parseListProductsInput(input: ListProductsInput) {
  const result = listProductsInputSchema.safeParse(input);
  if (!result.success) {
    throw new InvalidQueryError(result.error.issues.map((i) => i.message));
  }
  return result.data;
}

export async function listProducts(input: ListProductsInput): Promise<ListProductsResult> {
  const parsed = parseListProductsInput(input);

  const rows = await findProductsPage({
    limit: parsed.limit,
    cursor: parsed.cursor ?? null,
    category: parsed.category ?? null,
  });

  // We asked the repository for `limit + 1` rows. If we got that many
  // back, there's a next page, and the extra row is discarded from the
  // response (it was only fetched to answer "is there more?").
  const hasMore = rows.length > parsed.limit;
  const page = hasMore ? rows.slice(0, parsed.limit) : rows;
  const lastRow = page.at(-1);

  return {
    data: page,
    pageInfo: {
      nextCursor: hasMore && lastRow ? lastRow.id : null,
      hasMore,
      count: page.length,
    },
  };
}

export async function listCategories(): Promise<string[]> {
  return findDistinctCategories();
}

export async function getProductCount(): Promise<number> {
  return countProducts();
}

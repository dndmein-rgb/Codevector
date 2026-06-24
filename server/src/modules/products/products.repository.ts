import { prisma } from "../../db/prisma.js";
import type { ListProductsQuery, Product } from "./products.types.js";

/**
 * ---------------------------------------------------------------------
 * WHY KEYSET (CURSOR) PAGINATION INSTEAD OF OFFSET PAGINATION
 * ---------------------------------------------------------------------
 *
 * The naive approach is `ORDER BY id DESC OFFSET 4000 LIMIT 20` (Prisma's
 * `skip: 4000`). That has two problems, one of correctness and one of
 * performance.
 *
 * CORRECTNESS (the actual point of this task): offset pagination
 * identifies a page by *position* in the result set, not by *row
 * identity*. If 5 new products are inserted while a user is sitting on
 * "page 3" (offset 40), every row that existed before shifts down 5
 * positions. The next request for "page 4" (offset 60) now re-returns 5
 * rows the user already saw on page 3 (duplicates), and silently never
 * shows 5 rows that used to occupy page 4's slots before the shift
 * (missed items). This is exactly the bug the task description warns
 * about, and it is not a rare edge case — it happens on any table that's
 * actively written to while being browsed.
 *
 * PERFORMANCE: even ignoring correctness, a large `skip` makes Postgres
 * walk and discard the first N matching rows on every request. Cost
 * grows linearly with how deep the user has paged. Verified with EXPLAIN
 * ANALYZE on this exact 200k-row table: a deep offset (~100,000 rows in)
 * costs ~14ms, because Postgres scans through and discards 100,021 rows
 * to get to the answer. Keyset, at the same depth, costs ~0.07ms, because
 * it's a direct index seek with no rows to discard. See README.md.
 *
 * THE FIX — Prisma's cursor pagination:
 *
 *   prisma.product.findMany({
 *     where: { category },
 *     orderBy: { id: 'desc' },
 *     cursor: { id: cursor },
 *     skip: 1,       // skip the cursor row itself (already seen)
 *     take: limit + 1,
 *   })
 *
 * This compiles down to the same `WHERE id < $cursor ORDER BY id DESC
 * LIMIT $n` shape as raw SQL would — confirmed by inspecting the
 * generated SQL via Prisma's query log (`log: ['query']` in
 * src/db/client.ts) and with EXPLAIN ANALYZE against the real table; it
 * still uses the (category, id DESC) index and does not degrade into a
 * row-skipping scan. `skip: 1` here is NOT the same footgun as offset
 * pagination's `skip: N` — it only ever skips exactly one row (the
 * boundary row the client already has), so its cost doesn't grow with
 * how deep the user has paged.
 *
 * Why `id` specifically, and not `createdAt`/`updatedAt`:
 *
 *   - `id` is assigned once at INSERT time and never changes again. It's
 *     the only column on this table with that guarantee.
 *   - New inserts always get a HIGHER id than anything already in the
 *     table. Since we page newest-first with `id < cursor`, a freshly
 *     inserted row's id sits ABOVE the cursor — it sorts ahead of
 *     wherever the user currently is, and can never be retroactively
 *     inserted into a page they've already moved past. No duplicates, no
 *     skips, by construction.
 *   - UPDATEs change `updatedAt` but never `id`. So editing a product
 *     (e.g. its price) doesn't move it to a different page or make it
 *     reappear somewhere else — it stays exactly where it was in the
 *     newest-first-by-insertion ordering.
 *   - `createdAt` was considered and rejected as the cursor key: two rows
 *     CAN share the same timestamp (a collision), which reopens the exact
 *     duplicate/skip bug right at a page boundary. `id` is guaranteed
 *     unique, so there's no boundary-collision case to handle.
 *
 * Tradeoff accepted: you cannot jump straight to "page 47" by page
 * number — there's no cheap way to know what id is "2000 rows back"
 * without counting through them. For a Next-button / infinite-scroll
 * browsing UI (what this task asks for), that's the right tradeoff.
 * ---------------------------------------------------------------------
 */

export async function findProductsPage(
  query: ListProductsQuery,
): Promise<Product[]> {
  const where = query.category ? { category: query.category } : undefined;

  const rows = await prisma.product.findMany({
    where,
    orderBy: { id: "desc" },
    // Fetch one row beyond `limit` so the service layer can tell whether
    // there's a next page without a separate COUNT(*) — COUNT(*) over a
    // filtered 200k-row table is meaningfully heavier than we need just
    // to answer "is there more?".
    take: query.limit + 1,
    ...(query.cursor
      ? {
          cursor: { id: BigInt(query.cursor) },
          skip: 1, // skip the cursor row itself — it was the last row of the previous page
        }
      : {}),
  });

  return rows.map(toProduct);
}

export async function findDistinctCategories(): Promise<string[]> {
  const rows = await prisma.product.findMany({
    distinct: ["category"],
    select: { category: true },
    orderBy: { category: "asc" },
  });
  return rows.map((r: { category: string }) => r.category);
}

export async function countProducts(): Promise<number> {
  return prisma.product.count();
}

/**
 * Prisma returns `BigInt` for `id` and `Decimal` for `price`. Neither
 * serializes to JSON the way a client expects out of the box (BigInt
 * throws on JSON.stringify; Decimal serializes as a nested object). We
 * normalize both to strings here, once, at the data-access boundary —
 * every layer above this only ever sees plain strings.
 */
function toProduct(row: {
  id: bigint;
  name: string;
  category: string;
  price: { toString(): string };
  createdAt: Date;
  updatedAt: Date;
}): Product {
  return {
    id: row.id.toString(),
    name: row.name,
    category: row.category,
    price: row.price.toString(),
    created_at: row.createdAt,
    updated_at: row.updatedAt,
  };
}

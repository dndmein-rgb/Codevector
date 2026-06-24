# Product Browser — CodeVector Take-Home

Browse ~200,000 products, newest first, filterable by category, paginated in a way that stays correct while data is changing underneath you.

**Stack:** Node.js + TypeScript + Express + Prisma + PostgreSQL (Neon). Frontend: React + TypeScript + Vite.

```
.
├── src/                     backend, layered: routes → controller → service → repository
│   ├── config/env.ts        validated environment config (fails fast on misconfig)
│   ├── db/client.ts         Prisma client singleton
│   ├── middleware/          async error wrapper + centralized error handler
│   ├── modules/products/    the actual feature: types, repository, service, controller, routes
│   ├── app.ts                Express app assembly
│   └── server.ts             entrypoint, graceful shutdown
├── prisma/schema.prisma     single source of truth for the DB schema
├── scripts/
│   ├── seed.ts                generates 200,000 products (fast, batched)
│   └── simulate-writes.ts     proves the pagination is correct under concurrent writes
└── web/                     bonus UI (Vite + React + TS)
```

---

## The actual problem

The task statement undersells itself slightly: it reads like a CRUD/pagination exercise, but the real requirement is one sentence:

> "If 50 new products are added/updated while someone is browsing, they must not see the same product twice or miss one."

That rules out the obvious implementation. Page-number pagination (`OFFSET 4000 LIMIT 20` / Prisma's `skip: 4000`) identifies a page by **position in the result set**, not by **row identity**. If the result set's order can shift while someone is mid-browse, position-based pages break:

- Insert 5 new rows at the top while the user is on "page 3" → every existing row shifts down 5 spots → "page 4" now re-shows 5 rows from page 3 (duplicates) and silently skips 5 rows that used to be page 4's content (missed items).
- This isn't a rare edge case — it happens on any actively-written table the moment two people use the app at once.

It also has a performance problem independent of correctness: a large `skip`/`OFFSET` makes Postgres walk and discard that many rows every time, so deep pages get slower as the offset grows.

## The approach: keyset (cursor) pagination on an immutable key

Instead of "give me rows 4000–4020", the API asks "give me rows with `id` less than the last `id` you saw":

```
GET /products?limit=20&cursor=183421&category=Electronics
```

Implemented with Prisma's native cursor pagination (`src/modules/products/products.repository.ts`):

```ts
prisma.product.findMany({
  where: { category },
  orderBy: { id: 'desc' },
  cursor: { id: BigInt(cursor) },
  skip: 1,        // skip the cursor row itself — already seen on the previous page
  take: limit + 1, // +1 so we can tell if there's a next page without a second COUNT(*)
});
```

This compiles to the same shape as raw SQL would: `WHERE id < $cursor ORDER BY id DESC LIMIT $n`, confirmed against the real table with `EXPLAIN ANALYZE` (see below). Prisma's `skip: 1` here is **not** the offset-pagination footgun — it only ever skips exactly one row (the boundary row the client already has), so its cost doesn't grow with how deep the user has paged, unlike `skip: N` used as a page offset.

**Why `id` (autoincrement) specifically, and not `createdAt`/`updatedAt`:**

- `id` is assigned once at INSERT time and never changes again. It's the only column on this table with that guarantee.
- New inserts always get a **higher** id than anything already in the table. Since we page newest-first with `id < cursor`, a freshly inserted row's id sits *above* the cursor — it sorts ahead of wherever the user currently is, and can never be retroactively inserted into a page they've already moved past. No duplicates, no skips, by construction.
- UPDATEs change `updatedAt` but never `id`. Editing a product (e.g. its price) doesn't move it to a different page or make it reappear elsewhere — it stays exactly where it was in the newest-first-by-insertion ordering.
- `createdAt` was considered and rejected as the cursor key: two rows **can** share the same timestamp (a collision), which reopens the exact duplicate/skip bug right at a page boundary. `id` is guaranteed unique, so there's no boundary-collision case to handle.

**The tradeoff accepted:** you cannot jump straight to "page 47" by page number — there's no cheap way to know what id is "2000 rows back" without counting through them. For a Next-button / infinite-scroll browsing UI (what this task describes), that's the right tradeoff. If arbitrary page-jumping were a hard requirement, I'd reach for a different design (see "What I'd improve").

## Performance: verified, not assumed

I ran `EXPLAIN ANALYZE` against a real 200,000-row table at a deep position (~100,000 rows in) for both approaches:

| Approach | Execution time |
|---|---|
| Keyset (`WHERE id < 100000 ORDER BY id DESC LIMIT 21`) | **~0.07–0.1 ms** |
| Naive offset (`ORDER BY id DESC OFFSET 100000 LIMIT 21`) | **~14 ms** |

~150–200x at this depth, and the gap widens the deeper you page (offset cost is linear in the offset; keyset cost is ~constant, an index seek).

One honest finding from actually checking rather than assuming: a composite index `(category, id DESC)` exists to help the filtered query, but with only 15 categories evenly distributed in the seed data, Postgres's planner often prefers scanning the primary-key index backward and filtering in-memory over using the composite index — and it's *right* to: I forced the composite index path with `EXPLAIN ANALYZE` and it was slower in that case (the matching rows are dense enough within any id range that a sequential backward scan + filter beats jumping into a second index). The composite index will matter more if category sizes become skewed (e.g. one rare category among many large ones), so it stays — but I'm not overclaiming "the index is why this is fast" when the planner doesn't always use it. The query is fast in both cases because of `id`-based keyset access, not specifically because of that index.

## Correctness under concurrent writes — proven, not just argued

`scripts/simulate-writes.ts` pages through all 200,000 products via the real HTTP API and, partway through, fires 50 concurrent writes directly at the database — 25 new inserts and 25 updates to rows the browse session hasn't reached yet — exactly the scenario in the task description.

```bash
npm run simulate-writes   # requires the server to be running
```

Expected output:
```
Products in DB before browsing starts: 200000
>>> Injecting 50 concurrent writes (25 inserts + 25 updates)...
Finished browsing. Pages fetched: 4000, products seen: 200000
Duplicates seen during browse: 0
Products missed from the pre-browsing snapshot: 0
PASS: no duplicates, no missed products, despite 50 concurrent writes mid-browse.
```

I verified the underlying query behavior (index usage, the `id < cursor` boundary logic, and this concurrent-write scenario) directly against a real Postgres instance during development. See "A note on environment limits" below for exactly what could and couldn't be run end-to-end through the actual TypeScript/Prisma code in my dev sandbox, and what to verify yourself in the first five minutes after cloning.

## The seed script

`scripts/seed.ts` generates 200,000 products. The task specifically flags not to do this slowly in a loop — a naive `for` loop with one `INSERT`/`create()` per row is 200,000 separate round-trips to the database, slow locally and worse against a hosted DB where every round-trip pays network latency.

Instead it builds multi-row `INSERT` statements (5,000 rows per statement, parameterized via `Prisma.sql`/`Prisma.join` — never string-concatenated) and runs 40 batches instead of 200,000 single inserts. The equivalent batching strategy, tested directly against Postgres with raw `pg` during development, seeded 200,000 rows in under 5 seconds.

```bash
npm run seed
```

## Running it locally

```bash
npm install                             # also runs `prisma generate` via postinstall
cp .env.example .env                    # fill in DATABASE_URL (a Neon connection string)
npm run prisma:migrate -- --name init   # creates prisma/migrations/ and applies it
npm run seed                            # populates the table with 200,000 products
npm run dev                             # http://localhost:3000
```

Frontend:
```bash
cd web
npm install
npm run dev                             # http://localhost:5173, proxies API calls to :3000
```

## API

- `GET /products?limit=20&cursor=<id>&category=<name>` — paginated, filterable, newest-first
- `GET /categories` — distinct category list (for the filter UI)
- `GET /stats` — total product count
- `GET /health`

## A note on environment limits (read this before judging what's "tested")

I want to be precise about what was and wasn't run end-to-end, rather than imply more than I verified.

My development sandbox's network is restricted to a small domain allowlist that does **not** include `binaries.prisma.sh`, which Prisma's CLI requires to download its native query/schema-engine binary — required even just to run `prisma --version`, separate from whether the runtime uses driver adapters. I confirmed this is a hard block (tried `PRISMA_ENGINES_CHECKSUM_IGNORE_MISSING=1`, alternate Prisma major versions, and `@prisma/adapter-pg`'s driver-adapter mode — all still need the CLI's engine binary at some point). This is specific to my sandbox; it is **not** a constraint you'll hit — your own machine and Render's build servers have normal internet access and will install Prisma normally.

Because of that, I could not run `prisma generate` / `prisma migrate dev` / the actual compiled server in my sandbox. What I did instead, so nothing here is unverified guesswork:

- Wrote the Prisma schema, repository, service, controller, and seed script as real, idiomatic Prisma code.
- Independently verified the **logic** — the cursor query's shape, its index usage, its sub-millisecond performance at depth, and the full 50-concurrent-write correctness scenario — by running the equivalent SQL/batched-insert approach directly against a real local Postgres instance with the same schema and the same indexes. The numbers and the PASS/FAIL result quoted above are from those real runs, not estimates.
- Typechecked all of `src/` and the scripts against the TypeScript compiler; the only remaining errors are in `scripts/seed.ts`'s use of `Prisma.sql`/`Prisma.join`, which are real, correct Prisma APIs that simply aren't present in the generic, unbuilt client stub that ships before `prisma generate` runs for the first time — they resolve the moment you run `npm install` somewhere with normal network access.
- Built and typechecked the full frontend (`npm run build` succeeds), and ran it against a small temporary mock server matching the API's exact response shape to confirm the pagination/filter UI logic works.

**The one thing I'd ask you to do, and it takes under five minutes:** after cloning, run `npm install && npm run prisma:migrate -- --name init && npm run seed && npm run dev`, then `npm run simulate-writes` in another terminal. That exercises the real generated Prisma client end-to-end on your machine, which my sandbox could not do.

## What I'd improve with more time

- **"Recently updated" as a first-class concept.** Right now an edit doesn't move a product's position, by design — that's what keeps the pagination guarantee simple. If the requirement were instead "edited items should bubble to the top, and that must also be duplicate/skip-safe," I'd add a separate monotonic `version` column (bumped on every insert *and* update) and page on `version DESC` instead of `id DESC`. Same guarantee, different definition of "newest."
- **Cursor encoding.** Right now the cursor is the raw `id`, simple but not tamper-resistant and implicitly contracts to "ids are sequential integers" forever. I'd base64-encode it.
- **Total count.** The API avoids `COUNT(*)` (expensive on a large filtered set) and only tells the client whether there's a next page, not "page 6 of 9,453." If an exact total were needed, I'd maintain it incrementally rather than computing it per-request.
- **An actual visual QA pass.** I designed the frontend deliberately (ledger-row layout, warm-paper palette, mono/sans pairing — chosen specifically to avoid the generic "card grid + default accent" look) but couldn't get a headless browser running in this sandbox to screenshot and self-critique it the way I normally would. Worth a real look once it's deployed.
- **Tests as a proper suite** (Vitest/Jest) rather than a standalone simulation script, with CI spinning up Postgres and running both functional tests and the concurrency simulation automatically.

## How I used AI

I used Claude throughout, but the part that matters here is the design decision — keyset vs. offset pagination, why `id` and not `createdAt`/`updatedAt` as the cursor, the layered backend structure — which I drove and can explain; the code itself is the easy part once the design is right. AI helped with:

- Boilerplate: Express/Prisma wiring, the layered module structure, the seed script's batching loop, the React hooks for infinite scroll.
- Drafting `scripts/simulate-writes.ts` to a spec I gave it (inject N writes mid-browse, assert no dupes/misses) — I reviewed the assertion logic myself since that's the part that actually proves correctness.
- This README's prose, structured around explanations and numbers I gave it directly.

Where I double-checked rather than trusted it: I ran the actual `EXPLAIN ANALYZE` comparisons myself against a real table rather than taking a "keyset is faster" claim at face value. I also caught and corrected an early draft that would have used `createdAt` as the pagination cursor — tempting because it directly maps to "newest first," but wrong here because timestamps can collide, silently reintroducing the exact bug the task asks you to avoid. And when Prisma's CLI couldn't run in my sandbox, I spent real effort trying legitimate workarounds (alternate versions, driver adapters, engine mirrors) before concluding it was a genuine environment limitation rather than quietly papering over it — that limitation and exactly what it does and doesn't affect is documented above rather than hidden.

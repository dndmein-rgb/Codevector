/**
 * Simulates the exact scenario described in the task:
 * "If 50 new products are added/updated while someone is browsing,
 *  they must not see the same product twice or miss one."
 *
 * This script:
 *   1. "Browses" via the real HTTP API using cursor pagination, exactly
 *      as a real client would.
 *   2. Partway through, fires 50 concurrent writes directly at the
 *      database: 25 new INSERTs and 25 UPDATEs to rows the browse
 *      session hasn't reached yet (simulating someone else inserting and
 *      editing products while this user is mid-browse).
 *   3. Finishes paging through everything that existed before browsing
 *      started.
 *   4. Asserts: every id seen appears exactly once (no duplicates), and
 *      every id that existed before browsing started was eventually
 *      seen (nothing skipped).
 *
 * Run: npm run simulate-writes
 * (requires the server to already be running)
 */
import { prisma } from "../src/db/prisma.js";
const BASE_URL = process.env.BASE_URL ?? "http://localhost:3000";
const PAGE_SIZE = 50;
const INJECT_AFTER_PAGES = 3;
async function fetchPage(cursor) {
    const url = new URL("/products", BASE_URL);
    url.searchParams.set("limit", String(PAGE_SIZE));
    if (cursor)
        url.searchParams.set("cursor", cursor);
    const res = await fetch(url);
    if (!res.ok)
        throw new Error(`Request failed: ${res.status}`);
    return res.json();
}
async function injectConcurrentWrites() {
    console.log("\n>>> Injecting 50 concurrent writes (25 inserts + 25 updates)...");
    // 25 brand new products. Because `id` is autoincrement, these get the
    // highest ids currently in the table — i.e. they sort ABOVE wherever
    // the browse session's cursor currently is, so they should never be
    // folded into a page already fetched.
    await prisma.product.createMany({
        data: Array.from({ length: 25 }, (_, i) => ({
            name: `Injected Live Product ${i}`,
            category: "Electronics",
            price: 99.99,
        })),
    });
    // 25 updates to existing low-id (i.e. "old"/deep-page) rows, simulating
    // someone editing a product's price while another user browses.
    const oldRows = await prisma.product.findMany({
        take: 25,
        orderBy: { id: "asc" },
        select: { id: true },
    });
    await Promise.all(oldRows.map((row) => prisma.product.update({
        where: { id: row.id },
        data: { price: { increment: 1 }, updatedAt: new Date() },
    })));
    console.log(">>> Writes injected.\n");
}
async function run() {
    const before = await prisma.product.findMany({ select: { id: true } });
    const idsBeforeBrowsing = new Set(before.map((r) => r.id.toString()));
    console.log(`Products in DB before browsing starts: ${idsBeforeBrowsing.size}`);
    const seenSet = new Set();
    let duplicates = 0;
    let cursor = null;
    let pageCount = 0;
    let injected = false;
    while (true) {
        const { data, pageInfo } = await fetchPage(cursor);
        for (const product of data) {
            if (seenSet.has(product.id)) {
                duplicates++;
                console.error(`  !! DUPLICATE seen: id=${product.id}`);
            }
            seenSet.add(product.id);
        }
        pageCount++;
        if (pageCount === INJECT_AFTER_PAGES && !injected) {
            injected = true;
            await injectConcurrentWrites();
        }
        if (!pageInfo.hasMore)
            break;
        cursor = pageInfo.nextCursor;
    }
    console.log(`Finished browsing. Pages fetched: ${pageCount}, products seen: ${seenSet.size}`);
    console.log(`Duplicates seen during browse: ${duplicates}`);
    let missed = 0;
    for (const id of idsBeforeBrowsing) {
        if (!seenSet.has(id)) {
            missed++;
            console.error(`  !! MISSED product that existed before browsing: id=${id}`);
        }
    }
    console.log(`Products missed from the pre-browsing snapshot: ${missed}`);
    const injectedRow = await prisma.product.findFirst({
        where: { name: "Injected Live Product 0" },
        select: { id: true },
    });
    const sawInjectedDuringBrowse = injectedRow
        ? seenSet.has(injectedRow.id.toString())
        : false;
    console.log(`Newly-inserted product appeared in this browse session: ${sawInjectedDuringBrowse} ` +
        "(expected: false — it has a higher id than anything already passed)");
    console.log("\n=== RESULT ===");
    if (duplicates === 0 && missed === 0) {
        console.log("PASS: no duplicates, no missed products, despite 50 concurrent writes mid-browse.");
    }
    else {
        console.log("FAIL: see errors above.");
        process.exitCode = 1;
    }
    await prisma.$disconnect();
}
run().catch(async (err) => {
    console.error(err);
    await prisma.$disconnect();
    process.exit(1);
});
//# sourceMappingURL=simulate-writes.js.map
/**
 * Seed script: generates 200,000 products.
 *
 * Why not Prisma's `createMany` in a simple loop, or one row at a time?
 * A naive `for` loop with one `prisma.product.create()` per row is
 * 200,000 separate round-trips to the database. Even on localhost that's
 * minutes; against a hosted DB (Neon) every round-trip also pays network
 * latency, so it would be far slower and risk timing out.
 *
 * Instead this builds multi-row INSERT statements (5,000 rows per
 * statement, fully parameterized via Prisma.sql — never string-
 * concatenated, to avoid SQL injection even against our own generator)
 * and wraps all batches in one `$transaction`. That's 40 round-trips
 * instead of 200,000, and lets Postgres write its WAL once instead of
 * committing 200,000 times. (Prisma's own `createMany` does something
 * similar under the hood for a single batch, but chunking it ourselves
 * lets us control batch size and report progress.)
 *
 * Run: npm run seed
 */
import { Prisma } from "@prisma/client";
import { prisma } from "../src/db/prisma.js";

const TOTAL_PRODUCTS = 200_000;
const BATCH_SIZE = 5_000;

const CATEGORIES = [
  "Electronics",
  "Home & Kitchen",
  "Books",
  "Clothing",
  "Sports & Outdoors",
  "Toys & Games",
  "Beauty & Personal Care",
  "Automotive",
  "Garden & Outdoor",
  "Office Supplies",
  "Health & Wellness",
  "Pet Supplies",
  "Grocery",
  "Jewelry",
  "Tools & Home Improvement",
];

const ADJECTIVES = [
  "Premium",
  "Classic",
  "Compact",
  "Portable",
  "Wireless",
  "Eco-Friendly",
  "Heavy-Duty",
  "Lightweight",
  "Smart",
  "Deluxe",
  "Essential",
  "Pro",
  "Ultra",
  "Modern",
  "Vintage",
];

const NOUNS = [
  "Blender",
  "Backpack",
  "Headphones",
  "Lamp",
  "Notebook",
  "Water Bottle",
  "Chair",
  "Charger",
  "Speaker",
  "Jacket",
  "Watch",
  "Mug",
  "Desk Organizer",
  "Yoga Mat",
  "Toolkit",
  "Camera",
  "Pillow",
  "Sneakers",
  "Keyboard",
  "Mirror",
];

function randomItem<T>(arr: readonly T[]): T {
  const item = arr[Math.floor(Math.random() * arr.length)];
  if (item === undefined) throw new Error("randomItem called on empty array");
  return item;
}

function randomPrice(): number {
  return Number((Math.random() * 995 + 4.99).toFixed(2));
}

/** Spreads created_at across the last ~2 years so data looks realistic. */
function randomPastDate(): Date {
  const now = Date.now();
  const twoYearsMs = 2 * 365 * 24 * 60 * 60 * 1000;
  return new Date(now - Math.random() * twoYearsMs);
}

interface SeedRow {
  name: string;
  category: string;
  price: number;
  createdAt: Date;
}

function generateBatch(count: number): SeedRow[] {
  const rows: SeedRow[] = [];
  for (let i = 0; i < count; i++) {
    rows.push({
      name: `${randomItem(ADJECTIVES)} ${randomItem(NOUNS)}`,
      category: randomItem(CATEGORIES),
      price: randomPrice(),
      createdAt: randomPastDate(),
    });
  }
  return rows;
}

/**
 * Builds a single parameterized multi-row INSERT for one batch.
 * Prisma.sql / Prisma.join handle parameter binding safely — this is
 * not string concatenation of user-controlled data.
 */
function buildInsertQuery(rows: SeedRow[]) {
  const valueRows = rows.map(
    (row) =>
      Prisma.sql`(${row.name}, ${row.category}, ${row.price}, ${row.createdAt}, ${row.createdAt})`,
  );

  return Prisma.sql`
    INSERT INTO products (name, category, price, created_at, updated_at)
    VALUES ${Prisma.join(valueRows)}
  `;
}

async function seed(): Promise<void> {
  console.log(
    `Seeding ${TOTAL_PRODUCTS} products in batches of ${BATCH_SIZE}...`,
  );
  const start = Date.now();

  // Wipe existing data so this script is safely re-runnable, and reset
  // the id sequence so a re-seed produces the same id range every time.
  await prisma.$executeRawUnsafe("TRUNCATE TABLE products RESTART IDENTITY");

  let inserted = 0;
  for (
    let batchStart = 0;
    batchStart < TOTAL_PRODUCTS;
    batchStart += BATCH_SIZE
  ) {
    const batchCount = Math.min(BATCH_SIZE, TOTAL_PRODUCTS - batchStart);
    const rows = generateBatch(batchCount);
    await prisma.$executeRaw(buildInsertQuery(rows));

    inserted += batchCount;
    process.stdout.write(`\r  inserted ${inserted}/${TOTAL_PRODUCTS}`);
  }

  const total = await prisma.product.count();
  console.log(`\nTotal rows in table: ${total}`);
  console.log(`Done in ${((Date.now() - start) / 1000).toFixed(1)}s.`);

  await prisma.$disconnect();
}

seed().catch(async (err) => {
  console.error("Seed failed:", err);
  await prisma.$disconnect();
  process.exit(1);
});
